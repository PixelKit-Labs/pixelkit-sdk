/**
 * @file useGemini.ts
 * @description Conversational Gemini (cloud) chat with real multi-turn history via `ai.chats`.
 * There is no simulated fallback: without an API key `sendMessage` appends an error message that
 * tells the user how to configure one. Token counts come from the API's usageMetadata.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { HarmBlockThreshold, HarmCategory, type Chat } from '@google/genai';
import { AIMessage } from '../core/types';
import {
  getStoredApiKey,
  createGeminiClient,
  listAvailableModels,
  DEFAULT_MODELS,
  GEMINI_MODEL,
  NO_API_KEY_MESSAGE,
} from './geminiClient';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useGemini';

/** Every category the Gemini API scores. One threshold is applied across all of them. */
const HARM_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
];

/** `default` sends no safetySettings at all, leaving the model's own defaults in place. */
export type SafetyThreshold = 'default' | HarmBlockThreshold;

/** What a grounded reply searched for, and which pages it used. */
export interface GroundingSummary {
  /** The queries the model actually ran. */
  queries: string[];
  /** URIs of the pages it drew on. Empty when it answered without using a result. */
  sources: string[];
}

export const DEFAULT_GEMINI_SYSTEM_INSTRUCTION =
  'You are PixelKit, a concise hardware and AI assistant running on a Google Pixel 11 Pro. Answer in a few sentences unless asked for detail.';

export function useGemini() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const source: TelemetrySource = apiKey ? 'hardware' : 'unavailable';
  const [model, setModel] = useState<string>(GEMINI_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_MODELS);
  const [temperature, setTemperatureState] = useState<number>(0.4);
  const [topP, setTopPState] = useState<number>(0.95);
  const [topK, setTopKState] = useState<number>(40);
  const [maxOutputTokens, setMaxOutputTokensState] = useState<number>(2048);
  const [systemInstruction, setSystemInstructionState] = useState<string>(DEFAULT_GEMINI_SYSTEM_INSTRUCTION);
  const [thinkingBudget, setThinkingBudgetState] = useState<number>(0);
  const [safetyThreshold, setSafetyThreshold] = useState<SafetyThreshold>('default');
  const [searchGrounding, setSearchGrounding] = useState<boolean>(false);
  /** Text of the reply currently streaming in. Empty between turns. */
  const [partial, setPartial] = useState<string>('');
  const [lastGrounding, setLastGrounding] = useState<GroundingSummary | null>(null);
  /** Time to the first streamed chunk, which is what the wait actually feels like. */
  const [lastFirstChunkMs, setLastFirstChunkMs] = useState<number | null>(null);
  const [lastPromptTokens, setLastPromptTokens] = useState<number | null>(null);

  const chatRef = useRef<Chat | null>(null);

  useEffect(() => {
    getStoredApiKey().then(k => {
      setApiKeyState(k);
      logEvent(MODULE, 'api key', { configured: !!k });
      if (k) {
        listAvailableModels(k).then(models => {
          if (models.length > 0) setAvailableModels(models);
        });
      }
    });
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key);
    chatRef.current = null; // new key → new session
    if (key) {
      listAvailableModels(key).then(models => {
        if (models.length > 0) setAvailableModels(models);
      });
    }
  }, []);

  const setSelectedModel = useCallback((newModel: string) => {
    setModel(newModel);
    chatRef.current = null; // reset chat session for new model
  }, []);

  const sendMessage = useCallback(async (userPrompt: string): Promise<void> => {
    const prompt = userPrompt.trim();
    if (!prompt) return;

    setMessages(prev => [...prev, { id: `user_${Date.now()}`, role: 'user', content: prompt, timestamp: Date.now() }]);

    if (!apiKey) {
      setMessages(prev => [...prev, { id: `err_${Date.now()}`, role: 'system', content: NO_API_KEY_MESSAGE, timestamp: Date.now() }]);
      logEvent(MODULE, 'sendMessage without key', undefined, 'warn');
      return;
    }

    setIsLoading(true);
    const start = performance.now();
    try {
      if (!chatRef.current) {
        const config: any = {
          systemInstruction: systemInstruction.trim() || DEFAULT_GEMINI_SYSTEM_INSTRUCTION,
          temperature,
          topP,
          topK,
          maxOutputTokens,
        };
        if (thinkingBudget > 0) {
          config.thinkingConfig = { thinkingBudget };
        }
        if (safetyThreshold !== 'default') {
          // One threshold across every category: a demo control, not a policy engine.
          config.safetySettings = HARM_CATEGORIES.map(category => ({ category, threshold: safetyThreshold }));
        }
        if (searchGrounding) {
          // Grounding makes the model search before answering, and the reply carries the queries
          // it ran and the pages it used. Without it the model answers from training data alone.
          config.tools = [{ googleSearch: {} }];
        }
        chatRef.current = createGeminiClient(apiKey).chats.create({
          model,
          config,
        });
      }

      // Streaming, so the cloud reply appears as it arrives — the same behaviour Nano already had.
      const stream = await chatRef.current.sendMessageStream({ message: prompt });
      let text = '';
      let usage: { totalTokenCount?: number } | undefined;
      let grounding: GroundingSummary | null = null;
      let firstChunkMs: number | null = null;

      for await (const chunk of stream) {
        if (chunk.text) {
          if (firstChunkMs == null) firstChunkMs = Math.round(performance.now() - start);
          text += chunk.text;
          setPartial(text);
        }
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        const meta = chunk.candidates?.[0]?.groundingMetadata;
        if (meta) {
          grounding = {
            queries: meta.webSearchQueries ?? [],
            sources: (meta.groundingChunks ?? [])
              .map(c => c.web?.uri)
              .filter((u): u is string => typeof u === 'string'),
          };
        }
      }

      const elapsedMs = Math.round(performance.now() - start);
      const tokens = usage?.totalTokenCount;
      setMessages(prev => [...prev, {
        id: `model_${Date.now()}`,
        role: 'model',
        content: text || '(empty response)',
        timestamp: Date.now(),
        latencyMs: elapsedMs,
        tokenCount: tokens,
      }]);
      setLastGrounding(grounding);
      setLastFirstChunkMs(firstChunkMs);
      recordMetric(MODULE, 'latencyMs', elapsedMs, 'derived');
      if (firstChunkMs != null) recordMetric(MODULE, 'firstChunkMs', firstChunkMs, 'derived');
      logEvent(MODULE, 'reply', { model, latencyMs: elapsedMs, firstChunkMs, tokens, grounded: !!grounding });
    } catch (err: any) {
      const message = err?.message ?? 'Unknown error';
      setMessages(prev => [...prev, { id: `err_${Date.now()}`, role: 'system', content: `Gemini error: ${message}`, timestamp: Date.now() }]);
      logEvent(MODULE, 'error', { message }, 'error');
    } finally {
      setPartial('');
      setIsLoading(false);
    }
  }, [apiKey, model, temperature, topP, topK, maxOutputTokens, systemInstruction, thinkingBudget, safetyThreshold, searchGrounding]);

  /**
   * Counts a prompt against the model's tokenizer before sending it, so a caller can see the cost
   * of a long prompt rather than discovering it in the bill.
   */
  const countTokens = useCallback(async (text: string): Promise<number | null> => {
    if (!apiKey || !text.trim()) return null;
    try {
      const response = await createGeminiClient(apiKey).models.countTokens({ model, contents: text });
      const total = response.totalTokens ?? null;
      setLastPromptTokens(total);
      return total;
    } catch (e: any) {
      logEvent(MODULE, 'countTokens error', { message: e?.message }, 'warn');
      return null;
    }
  }, [apiKey, model]);

  const clearMessages = useCallback((): void => {
    setMessages([]);
    setPartial('');
    setLastGrounding(null);
    chatRef.current = null;
  }, []);

  /** Safety and grounding are fixed when the session is created, so both start a fresh one. */
  const setSafety = useCallback((threshold: SafetyThreshold) => {
    setSafetyThreshold(threshold);
    chatRef.current = null;
  }, []);

  const setSearchGroundingEnabled = useCallback((enabled: boolean) => {
    setSearchGrounding(enabled);
    chatRef.current = null;
  }, []);

  // The sampling, instruction and thinking settings are read when a chat session is created, so a
  // change drops the current session and the next message starts one with the new values.
  const setTemperature = useCallback((value: number) => {
    setTemperatureState(value);
    chatRef.current = null;
  }, []);
  const setTopP = useCallback((value: number) => {
    setTopPState(value);
    chatRef.current = null;
  }, []);
  const setTopK = useCallback((value: number) => {
    setTopKState(value);
    chatRef.current = null;
  }, []);
  const setMaxOutputTokens = useCallback((value: number) => {
    setMaxOutputTokensState(value);
    chatRef.current = null;
  }, []);
  const setSystemInstruction = useCallback((value: string) => {
    setSystemInstructionState(value);
    chatRef.current = null;
  }, []);
  const setThinkingBudget = useCallback((value: number) => {
    setThinkingBudgetState(value);
    chatRef.current = null;
  }, []);

  return {
    /** Conversation so far. `system` role entries are local errors, not model output. */
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    hasApiKey: !!apiKey,
    setApiKey,
    model,
    setSelectedModel,
    availableModels,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Cloud model: reachable only with a key and a network route. */
    source,
    temperature,
    setTemperature,
    topP,
    setTopP,
    topK,
    setTopK,
    maxOutputTokens,
    setMaxOutputTokens,
    systemInstruction,
    setSystemInstruction,
    thinkingBudget,
    setThinkingBudget,
    /** Text streamed so far for the in-flight reply; empty between turns. */
    partial,
    /** Time to the first streamed chunk of the last reply, in ms. */
    lastFirstChunkMs,
    /** Token count from the last countTokens call. */
    lastPromptTokens,
    /** What the last grounded reply searched for and used, or null when grounding was off. */
    lastGrounding,
    safetyThreshold,
    setSafety,
    searchGrounding,
    setSearchGroundingEnabled,
    countTokens,
  };
}
