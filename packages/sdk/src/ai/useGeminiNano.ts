/**
 * @file useGeminiNano.ts
 * @description Gemini Nano on-device chat through the PixelNano module (ML Kit GenAI Prompt API on AICore).
 * Status, base model name, token limit and feature flags come from AICore; latency and time-to-first-token
 * are measured around the native call; token counts come from the on-device tokenizer. There is no cloud
 * fallback and no simulated reply: when the model is unavailable, `sendMessage` appends an error entry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PixelNano, {
  type NanoModelInfo,
  type NanoOptions,
  type NanoResult,
  type NanoStatus,
  type SummarizeOptions,
  type SummarizeResult,
  type ProofreadResult,
  type RewriteResult,
} from '@pixelkit-labs/mlkit';
import {
  beginTrace,
  withTraceContextFields,
  logEvent,
  recordMetric,
  type ObservabilityOptions,
  type TelemetrySource,
  type TraceContext,
  noteExpected,
} from '../core/observability';
import type { AIMessage } from '../core/types';

const MODULE = 'useGeminiNano';

export interface NanoRunOptions extends ObservabilityOptions {
  context: TraceContext;
}

/** Leaves room for the answer inside the model's token limit (4,096 on Nano v4 per ML Kit release notes). */
const MAX_HISTORY_CHARS = 6000;

export const NANO_SYSTEM_INSTRUCTION =
  'You are PixelKit, a concise hardware assistant running on-device on a Google Pixel 11 Pro. Answer in two or three sentences.';

/**
 * AICore keeps no conversation state. Behaviour goes in the system instruction; the recent transcript is
 * re-sent inside the prompt, newest turns kept first when the budget runs out.
 */
export function buildNanoTurn(history: AIMessage[], user: string): string {
  let transcript = '';
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'system') continue;
    const line = `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}\n`;
    if (transcript.length + line.length > MAX_HISTORY_CHARS) break;
    transcript = line + transcript;
  }
  return `${transcript}User: ${user}\nAssistant:`;
}

export function useGeminiNano() {
  const [status, setStatus] = useState<NanoStatus>('unavailable');
  const [info, setInfo] = useState<NanoModelInfo | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isWarmingUp, setIsWarmingUp] = useState<boolean>(false);
  const [warmupMs, setWarmupMs] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [partial, setPartial] = useState<string>('');
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastFirstTokenMs, setLastFirstTokenMs] = useState<number | null>(null);
  const [lastOutputTokens, setLastOutputTokens] = useState<number | null>(null);
  const [lastDecodeTokensPerSec, setLastDecodeTokensPerSec] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parameterization
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topK, setTopK] = useState<number>(40);
  const [candidateCount, setCandidateCount] = useState<number>(1);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number>(1024);
  const [thinkingMode, setThinkingMode] = useState<boolean>(false);
  const [systemInstruction, setSystemInstruction] = useState<string>(NANO_SYSTEM_INSTRUCTION);

  const messagesRef = useRef<AIMessage[]>([]);
  messagesRef.current = messages;

  const source: TelemetrySource = PixelNano ? 'hardware' : 'unavailable';

  /** Re-reads status and model facts from AICore. */
  const refresh = useCallback(async () => {
    if (!PixelNano) return;
    try {
      const i = await PixelNano.getModelInfo();
      setInfo(i);
      setStatus(i.status);
      logEvent(MODULE, 'model info', {
        status: i.status, model: i.baseModelName, tokenLimit: i.tokenLimit,
        thinking: i.thinkingModeAvailable, systemPrompt: i.systemPromptAvailable,
      });
    } catch (e: any) {
      setStatus('unavailable');
      setError(e?.message ?? 'getModelInfo failed');
      logEvent(MODULE, 'model info error', { message: e?.message, code: e?.code }, 'error');
    }
  }, []);

  useEffect(() => {
    if (!PixelNano) {
      logEvent(MODULE, 'native module absent; Gemini Nano unavailable', undefined, 'warn');
      return;
    }
    void refresh();
    const sub = PixelNano.addListener('onDownloadProgress', e => {
      if (e.phase === 'started') setDownloadedBytes(0);
      if (e.phase === 'progress' && e.bytes != null) setDownloadedBytes(e.bytes);
      if (e.phase === 'completed') setStatus('available');
    });
    return () => sub.remove();
  }, [refresh]);

  /** Asks AICore to download the model. Progress arrives in `downloadedBytes`. */
  const download = useCallback(async (): Promise<NanoStatus> => {
    if (!PixelNano) return 'unavailable';
    setIsDownloading(true);
    setError(null);
    try {
      const s = await PixelNano.download();
      setStatus(s);
      logEvent(MODULE, 'download finished', { status: s, bytes: downloadedBytes });
      await refresh();
      return s;
    } catch (e: any) {
      setError(e?.message ?? 'download failed');
      logEvent(MODULE, 'download error', { message: e?.message, code: e?.code }, 'error');
      return 'unavailable';
    } finally {
      setIsDownloading(false);
    }
  }, [downloadedBytes, refresh]);

  /** Loads the model into AICore ahead of the first prompt; reports the wall time. */
  const warmup = useCallback(async (): Promise<number | null> => {
    if (!PixelNano) return null;
    setIsWarmingUp(true);
    setError(null);
    try {
      const ms = await PixelNano.warmup();
      setWarmupMs(ms);
      recordMetric(MODULE, 'warmupMs', ms, 'hardware');
      logEvent(MODULE, 'warmup', { ms });
      return ms;
    } catch (e: any) {
      setError(e?.message ?? 'warmup failed');
      logEvent(MODULE, 'warmup error', { message: e?.message, code: e?.code }, 'error');
      return null;
    } finally {
      setIsWarmingUp(false);
    }
  }, []);

  /** Token count from the on-device tokenizer for a prompt as it would be sent. */
  const countTokens = useCallback(async (prompt: string, options?: NanoOptions): Promise<number | null> => {
    if (!PixelNano) return null;
    try { return await PixelNano.countTokens(prompt, options); } catch { return null; }
  }, []);

  /** Single-shot generation (text, optional image). Throws on failure; no fallback. */
  const generate = useCallback(async (
    prompt: string,
    run: NanoRunOptions,
    options?: NanoOptions,
  ): Promise<NanoResult> => {
    if (!PixelNano) throw new Error('PixelNano module is not in this build');
    const scope = beginTrace(MODULE, 'generate', 'hardware', { model: info?.baseModelName }, run);
    setIsGenerating(true);
    setError(null);
    scope.event('request_accepted', { chars: prompt.length });
    try {
      const result = await PixelNano.generate(prompt, options);
      setThoughts(result.thoughts);
      setLastLatencyMs(result.latencyMs);
      setLastFirstTokenMs(result.firstTokenMs);
      scope.metric('latencyMs', result.latencyMs);
      if (result.firstTokenMs != null) scope.event('first_response', { firstTokenMs: result.firstTokenMs });
      scope.end('ok', { latencyMs: result.latencyMs, firstTokenMs: result.firstTokenMs, finishReason: result.finishReason });
      return result;
    } catch (cause: any) {
      setError(cause?.message ?? 'generate failed');
      scope.end('error', undefined, cause);
      throw cause;
    } finally {
      setIsGenerating(false);
    }
  }, [info]);

  /** Chat turn with request-id-bound callbacks; late native events are ignored after completion. */
  const sendMessage = useCallback(async (
    userPrompt: string,
    run: NanoRunOptions,
    sendOptions?: Partial<NanoOptions>,
  ): Promise<void> => {
    const prompt = userPrompt.trim();
    if (!prompt) return;
    const now = Date.now();
    const requestId = `nano_${now}_${run.context.runId ?? run.context.traceId}`;
    const requestContext = withTraceContextFields(run.context, { nativeRequestId: requestId });
    const scope = beginTrace(MODULE, 'stream', 'hardware', {
      model: info?.baseModelName,
      nativeRequestId: requestId,
    }, { ...run, context: requestContext });
    const displayContent = sendOptions?.displayContent?.trim() || prompt;
    setMessages(previous => [...previous, { id: `user_${now}`, role: 'user', content: displayContent, timestamp: now }]);

    const fail = (content: string) => {
      setMessages(previous => [...previous, { id: `err_${Date.now()}`, role: 'system', content, timestamp: Date.now() }]);
    };
    if (!PixelNano) {
      fail('PixelNano module is not in this build (web or Expo Go).');
      scope.end('unavailable', { reason: 'native_module_absent' });
      return;
    }
    if (status !== 'available') {
      fail(`Gemini Nano is ${status} on this device. ${status === 'downloadable' ? 'Tap "Download model" first.' : ''}`.trim());
      scope.end('unavailable', { reason: `model_${status}` });
      return;
    }

    setIsGenerating(true);
    setPartial('');
    setThoughts([]);
    setError(null);
    let firstTokenObserved = false;
    const subscriptions = [
      PixelNano.addListener('onToken', event => {
        if (!scope.active || event.requestId !== requestId) return;
        if (!firstTokenObserved) {
          firstTokenObserved = true;
          scope.event('first_response', { nativeRequestId: requestId });
        }
        setPartial(previous => previous + event.text);
      }),
      PixelNano.addListener('onThought', event => {
        if (scope.active && event.requestId === requestId) setThoughts(previous => [...previous, event.text]);
      }),
    ];
    scope.event('request_accepted', { chars: prompt.length, nativeRequestId: requestId });
    try {
      const history = messagesRef.current;
      const useSystemPart = info?.systemPromptAvailable === true;
      const body = buildNanoTurn(history, prompt);
      const text = useSystemPart ? body : `${systemInstruction}\n\n${body}`;
      const options: NanoOptions = {
        temperature,
        topK,
        candidateCount,
        maxOutputTokens,
        thinking: thinkingMode && info?.thinkingModeAvailable === true,
        ...(useSystemPart ? { systemInstruction } : {}),
        ...sendOptions,
      };
      const result = await PixelNano.stream(requestId, text, options);
      let tokenCount: number | undefined;
      let decodeTokensPerSec: number | null = null;
      try {
        tokenCount = await PixelNano.countTokens(result.text || ' ');
        const decodeMs = result.firstTokenMs != null ? result.latencyMs - result.firstTokenMs : null;
        if (decodeMs != null && decodeMs > 0 && tokenCount > 0) {
          decodeTokensPerSec = Number((tokenCount / (decodeMs / 1000)).toFixed(1));
        }
      } catch {
        noteExpected(MODULE, 'tokenizer unavailable; token count left null');
      }
      setMessages(previous => [...previous, {
        id: `model_${Date.now()}`, role: 'model', content: result.text || '(empty response)',
        timestamp: Date.now(), latencyMs: result.latencyMs, tokenCount,
      }]);
      setLastLatencyMs(result.latencyMs);
      setLastFirstTokenMs(result.firstTokenMs);
      setLastOutputTokens(tokenCount ?? null);
      setLastDecodeTokensPerSec(decodeTokensPerSec);
      scope.metric('latencyMs', result.latencyMs);
      if (result.firstTokenMs != null) scope.metric('firstTokenMs', result.firstTokenMs);
      if (decodeTokensPerSec != null) scope.metric('decodeTokensPerSec', decodeTokensPerSec, 'derived');
      scope.end('ok', {
        nativeRequestId: requestId,
        latencyMs: result.latencyMs,
        firstTokenMs: result.firstTokenMs,
        finishReason: result.finishReason,
        outputTokens: tokenCount,
      });
    } catch (cause: any) {
      const message = cause?.message ?? 'Unknown error';
      setError(message);
      fail(`Gemini Nano error: ${message}`);
      scope.end('error', { nativeRequestId: requestId }, cause);
    } finally {
      subscriptions.forEach(subscription => subscription.remove());
      setPartial('');
      setIsGenerating(false);
    }
  }, [status, info, temperature, topK, candidateCount, maxOutputTokens, thinkingMode, systemInstruction]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setThoughts([]);
  }, []);

  /** On-Device GenAI Summarization via ML Kit / AICore */
  const summarize = useCallback(async (text: string, options?: SummarizeOptions): Promise<SummarizeResult> => {
    if (!PixelNano) throw new Error('PixelNano module not available');
    setIsGenerating(true);
    setError(null);
    try {
      const res = await PixelNano.summarize(text, options);
      recordMetric(MODULE, 'summarizeLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'summarize', { latencyMs: res.latencyMs, engine: res.engine });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'summarize failed');
      throw e;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /** On-Device GenAI Proofreading via ML Kit / AICore */
  const proofread = useCallback(async (text: string, options?: Record<string, any>): Promise<ProofreadResult> => {
    if (!PixelNano) throw new Error('PixelNano module not available');
    setIsGenerating(true);
    setError(null);
    try {
      const res = await PixelNano.proofread(text, options);
      recordMetric(MODULE, 'proofreadLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'proofread', { latencyMs: res.latencyMs, engine: res.engine });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'proofread failed');
      throw e;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /** On-Device GenAI Rewriting via ML Kit / AICore */
  const rewrite = useCallback(async (text: string, tone?: 'elaborate' | 'emojify' | 'shorten' | 'friendly' | 'professional' | 'rephrase'): Promise<RewriteResult> => {
    if (!PixelNano) throw new Error('PixelNano module not available');
    setIsGenerating(true);
    setError(null);
    try {
      const res = await PixelNano.rewrite(text, tone);
      recordMetric(MODULE, 'rewriteLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'rewrite', { latencyMs: res.latencyMs, engine: res.engine });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'rewrite failed');
      throw e;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /** Switches the AICore model track; the next call creates a new client. */
  const setModelConfig = useCallback(async (stage: 'stable' | 'preview', preference: 'full' | 'fast') => {
    if (!PixelNano) return;
    PixelNano.setModelConfig(stage, preference);
    logEvent(MODULE, 'model config', { stage, preference });
    await refresh();
  }, [refresh]);

  return {
    /** AICore feature status for the Prompt API */
    status,
    isAvailable: status === 'available',
    /** Base model name, token limit and feature flags as reported by AICore; null until read */
    info,
    downloadedBytes,
    isDownloading,
    isWarmingUp,
    warmupMs,
    isGenerating,
    /** Conversation so far. `system` role entries are local errors, not model output. */
    messages,
    /** Text streamed so far for the in-flight reply */
    partial,
    thoughts,
    lastLatencyMs,
    lastFirstTokenMs,
    lastOutputTokens,
    /** Output tokens per second over the decode phase (after the first token); derived */
    lastDecodeTokensPerSec,
    error,
    source,
    // Parameterization
    temperature,
    setTemperature,
    topK,
    setTopK,
    candidateCount,
    setCandidateCount,
    maxOutputTokens,
    setMaxOutputTokens,
    thinkingMode,
    setThinkingMode,
    systemInstruction,
    setSystemInstruction,
    // Actions
    refresh,
    download,
    warmup,
    countTokens,
    generate,
    sendMessage,
    clearMessages,
    setModelConfig,
    summarize,
    proofread,
    rewrite,
  };
}
