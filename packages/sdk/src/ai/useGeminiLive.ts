/** Gemini Live with explicit per-session capabilities and trace ownership. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  runTool,
  probeCapabilityAdapter,
  toFunctionDeclarations,
  toToolFunctionResponse,
  type CapabilityAdapter,
} from './tools/registry';
import { getStoredApiKey } from './geminiClient';
import {
  beginTrace,
  withTraceContextFields,
  logError,
  logEvent,
  type ObservabilityOptions,
  type ObservabilitySink,
  type RedactionPolicy,
  type TelemetrySource,
  type TraceContext,
  type TraceScope,
} from '../core/observability';
import {
  DEFAULT_LIVE_MODEL,
  LIVE_WEBSOCKET_ENDPOINT,
  type LiveVoiceName,
  type LiveMessage,
  type LiveToolCall,
  type GeminiLiveConfig,
} from './liveConstants';

export {
  DEFAULT_LIVE_MODEL,
  LIVE_WEBSOCKET_ENDPOINT,
  type LiveVoiceName,
  type LiveMessage,
  type LiveToolCall,
  type GeminiLiveConfig,
};

const MODULE = 'useGeminiLive';

export interface GeminiLiveRunOptions {
  context: TraceContext;
  capabilityAdapter: CapabilityAdapter;
  apiKey?: string;
  sink?: ObservabilitySink;
  redaction?: RedactionPolicy;
}

export interface GeminiLiveConnectResult {
  status: 'connected' | 'unavailable' | 'error' | 'cancelled';
  context: TraceContext;
  reason?: string;
}

interface LiveSession {
  id: number;
  socket: WebSocket;
  run: GeminiLiveRunOptions;
  scope: TraceScope;
  firstResponseObserved: boolean;
  toolSequence: number;
  settle?: (result: GeminiLiveConnectResult) => void;
}

export interface GeminiLiveTelemetry {
  isConnected: boolean;
  isStreaming: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isStreamingMedia: boolean;
  transcript: LiveMessage[];
  currentThinking: string | null;
  activeToolCalls: LiveToolCall[];
  error: string | null;
  source: TelemetrySource;
  context: TraceContext | null;
  connect: (run: GeminiLiveRunOptions) => Promise<GeminiLiveConnectResult>;
  disconnect: () => void;
  sendText: (text: string) => void;
  sendAudioChunk: (pcmBase64: string) => void;
  sendImageChunk: (base64Data: string, mimeType?: string) => void;
  sendVideoFrame: (base64Jpeg: string) => void;
  sendMultimodalTurn: (text: string, images?: Array<{ data: string; mimeType?: string }>) => void;
  interrupt: () => void;
  clearTranscript: () => void;
}

export function useGeminiLive(config: GeminiLiveConfig = {}): GeminiLiveTelemetry {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isStreamingMedia, setIsStreamingMedia] = useState(false);
  const [transcript, setTranscript] = useState<LiveMessage[]>([]);
  const [currentThinking, setCurrentThinking] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<LiveToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<TraceContext | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const sessionSequence = useRef(0);

  const resetStreamingState = useCallback(() => {
    setIsConnected(false);
    setIsStreaming(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsStreamingMedia(false);
  }, []);

  const disconnect = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    sessionSequence.current += 1;
    if (session) {
      session.scope.event('cancelled', { reason: 'user_disconnect' }, 'warn');
      session.scope.end('cancelled');
      session.settle?.({ status: 'cancelled', context: session.run.context, reason: 'user_disconnect' });
      try { session.socket.close(1000, 'User closed connection'); }
      catch (closeError) { logError(MODULE, 'socket_close_failed', closeError, undefined, session.run); }
    }
    resetStreamingState();
  }, [resetStreamingState]);

  const connect = useCallback(async (run: GeminiLiveRunOptions): Promise<GeminiLiveConnectResult> => {
    disconnect();
    setContext(run.context);
    const adapter = run.capabilityAdapter;
    if (!adapter || adapter.tools.length === 0) {
      const reason = 'capability_adapter_empty';
      setError(reason);
      logEvent(MODULE, 'unavailable', { reason }, 'warn', run);
      return { status: 'unavailable', context: run.context, reason };
    }
    const probe = await probeCapabilityAdapter(adapter, run.context);
    if (probe.availableTools.length === 0) {
      const reason = 'capabilities_unavailable';
      setError(reason);
      logEvent(MODULE, 'unavailable', { reason, unavailableCapabilities: probe.unavailable }, 'warn', run);
      return { status: 'unavailable', context: run.context, reason };
    }
    const key = run.apiKey ?? await getStoredApiKey();
    if (!key) {
      const reason = 'gemini_api_key_unavailable';
      setError(reason);
      logEvent(MODULE, 'unavailable', { reason }, 'warn', run);
      return { status: 'unavailable', context: run.context, reason };
    }

    const scope = beginTrace(MODULE, 'live_session', 'hardware', {
      model: config.model ?? DEFAULT_LIVE_MODEL,
      capabilityProvider: adapter.provider,
    }, run);
    try {
      const socket = new WebSocket(`${LIVE_WEBSOCKET_ENDPOINT}?key=${encodeURIComponent(key)}`);
      const session: LiveSession = {
        id: ++sessionSequence.current,
        socket,
        run,
        scope,
        firstResponseObserved: false,
        toolSequence: 0,
      };
      sessionRef.current = session;
      const ownsSession = (): boolean => sessionRef.current === session && sessionSequence.current === session.id && session.scope.active;

      return await new Promise<GeminiLiveConnectResult>(resolve => {
        let settled = false;
        const settle = (result: GeminiLiveConnectResult): void => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        session.settle = settle;

        socket.onopen = () => {
          if (!ownsSession()) return;
          setIsConnected(true);
          setError(null);
          const model = config.model ?? DEFAULT_LIVE_MODEL;
          socket.send(JSON.stringify({
            setup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName ?? 'Aoede' } } },
                thinkingConfig: config.thinkingBudget ? { thinkingBudget: config.thinkingBudget } : undefined,
              },
              systemInstruction: {
                parts: [{ text: config.systemInstruction ?? 'You are PixelKit Live. Use only the explicitly supplied capabilities and report unavailable readings truthfully.' }],
              },
              tools: [{ functionDeclarations: toFunctionDeclarations(probe.availableTools) }],
            },
          }));
          scope.event('connection_ready', { model, capabilityProvider: adapter.provider });
          settle({ status: 'connected', context: run.context });
        };

        socket.onmessage = async event => {
          if (!ownsSession()) return;
          try {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) as Record<string, any> : null;
            if (!data || !ownsSession()) return;
            const providerRequestId = typeof data.requestId === 'string' ? data.requestId : undefined;
            const callbackContext = providerRequestId
              ? withTraceContextFields(scope.context, { providerRequestId })
              : scope.context;
            const observation: ObservabilityOptions = { ...run, context: callbackContext };
            if (!session.firstResponseObserved) {
              session.firstResponseObserved = true;
              logEvent(MODULE, 'first_response', { providerRequestId }, 'info', observation);
            }

            if (data.serverContent) {
              const parts = data.serverContent.modelTurn?.parts ?? [];
              let fullChunkText = '';
              for (const part of parts) {
                if (part.thought) setCurrentThinking(previous => previous ? previous + part.thought : part.thought);
                if (part.text) fullChunkText += part.text;
                if (part.inlineData?.mimeType?.includes('audio')) setIsSpeaking(true);
              }
              if (fullChunkText) {
                setIsStreaming(true);
                setTranscript(previous => {
                  const last = previous[previous.length - 1];
                  if (last?.role === 'model') return [...previous.slice(0, -1), { ...last, text: last.text + fullChunkText, timestamp: Date.now() }];
                  return [...previous, { id: `m-${Date.now()}`, role: 'model', text: fullChunkText, timestamp: Date.now() }];
                });
              }
              if (data.serverContent.interrupted) {
                setIsSpeaking(false);
                setIsStreaming(false);
                logEvent(MODULE, 'cancelled', { providerRequestId, reason: 'provider_interrupted' }, 'warn', observation);
              }
              if (data.serverContent.turnComplete) {
                setIsStreaming(false);
                setIsSpeaking(false);
                logEvent(MODULE, 'completed', {
                  providerRequestId,
                  finishReason: data.serverContent.finishReason,
                  ...(data.usageMetadata ? { usage: data.usageMetadata } : {}),
                }, 'info', observation);
              }
            }

            const calls = data.toolCall?.functionCalls;
            if (Array.isArray(calls)) {
              const responses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];
              for (const call of calls) {
                if (!ownsSession()) return;
                const toolCallId = call.id ?? `${run.context.runId ?? run.context.traceId}:live-tool:${++session.toolSequence}`;
                const callName = call.name ?? '';
                setActiveToolCalls(previous => [...previous, { id: toolCallId, name: callName, args: call.args ?? {}, status: 'calling' }]);
                const started = performance.now();
                const toolResult = await runTool(adapter, callName, call.args ?? {}, {
                  context: callbackContext,
                  sink: run.sink,
                  redaction: run.redaction,
                  toolCallId,
                });
                if (!ownsSession()) return;
                const durationMs = Math.round(performance.now() - started);
                setActiveToolCalls(previous => previous.map(item => item.id === toolCallId
                  ? { ...item, status: toolResult.ok ? 'executed' : 'failed', result: toolResult.result ?? toolResult.error, durationMs }
                  : item));
                responses.push({ id: toolCallId, name: callName, response: toToolFunctionResponse(toolResult) });
              }
              if (ownsSession() && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
              }
            }
          } catch (messageError) {
            if (ownsSession()) logError(MODULE, 'message_processing_failed', messageError, undefined, run);
          }
        };

        socket.onerror = event => {
          if (!ownsSession()) return;
          const reason = 'live_websocket_error';
          setError(reason);
          logError(MODULE, 'websocket_error', new Error(reason), { eventType: String(event.type) }, run);
          scope.end('error', undefined, reason);
          sessionRef.current = null;
          resetStreamingState();
          settle({ status: 'error', context: run.context, reason });
        };

        socket.onclose = closeEvent => {
          if (!ownsSession()) return;
          sessionRef.current = null;
          resetStreamingState();
          const normal = closeEvent.code === 1000;
          scope.event(normal ? 'completed' : 'connection_closed', { code: closeEvent.code }, normal ? 'info' : 'warn');
          scope.end(normal ? 'ok' : 'error', { code: closeEvent.code }, normal ? undefined : closeEvent.reason);
          settle({ status: normal ? 'connected' : 'error', context: run.context, ...(!normal ? { reason: closeEvent.reason || 'connection_closed' } : {}) });
        };
      });
    } catch (connectionError) {
      const reason = logError(MODULE, 'connection_failed', connectionError, undefined, run).message;
      scope.end('error', undefined, connectionError);
      return { status: 'error', context: run.context, reason };
    }
  }, [config, disconnect, resetStreamingState]);

  const sendText = useCallback((text: string) => {
    const session = sessionRef.current;
    const value = text.trim();
    if (!value || !session || session.socket.readyState !== WebSocket.OPEN) return;
    setTranscript(previous => [...previous, { id: `u-${Date.now()}`, role: 'user', text: value, timestamp: Date.now() }]);
    session.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: value }] }], turnComplete: true } }));
    session.scope.event('request_accepted', { modality: 'text', chars: value.length });
  }, []);

  const sendAudioChunk = useCallback((pcmBase64: string) => {
    const session = sessionRef.current;
    if (!pcmBase64 || !session || session.socket.readyState !== WebSocket.OPEN) return;
    setIsListening(true);
    session.socket.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: pcmBase64 }] } }));
  }, []);

  const sendImageChunk = useCallback((base64Data: string, mimeType = 'image/jpeg') => {
    const session = sessionRef.current;
    if (!base64Data || !session || session.socket.readyState !== WebSocket.OPEN) return;
    const clean = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    setIsStreamingMedia(true);
    session.socket.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType, data: clean }] } }));
    session.scope.event('media_sent', { mimeType, bytes: clean.length });
  }, []);

  const sendVideoFrame = useCallback((base64Jpeg: string) => sendImageChunk(base64Jpeg, 'image/jpeg'), [sendImageChunk]);

  const sendMultimodalTurn = useCallback((text: string, images?: Array<{ data: string; mimeType?: string }>) => {
    const session = sessionRef.current;
    const value = text.trim();
    if (!session || session.socket.readyState !== WebSocket.OPEN || (!value && !images?.length)) return;
    const parts: Array<Record<string, unknown>> = value ? [{ text: value }] : [];
    for (const image of images ?? []) {
      parts.push({ inlineData: { mimeType: image.mimeType ?? 'image/jpeg', data: image.data.replace(/^data:image\/[a-z]+;base64,/, '') } });
    }
    setTranscript(previous => [...previous, { id: `u-${Date.now()}`, role: 'user', text: value || '[Attached Image Frame]', timestamp: Date.now() }]);
    session.socket.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts }], turnComplete: true } }));
    session.scope.event('request_accepted', { modality: 'multimodal', chars: value.length, imageCount: images?.length ?? 0 });
  }, []);

  const interrupt = useCallback(() => {
    const session = sessionRef.current;
    setIsSpeaking(false);
    setIsStreaming(false);
    session?.scope.event('cancelled', { reason: 'user_interrupt' }, 'warn');
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setCurrentThinking(null);
    setActiveToolCalls([]);
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    isConnected, isStreaming, isSpeaking, isListening, isStreamingMedia,
    transcript, currentThinking, activeToolCalls, error,
    source: isConnected ? 'hardware' : 'unavailable', context,
    connect, disconnect, sendText, sendAudioChunk, sendImageChunk, sendVideoFrame,
    sendMultimodalTurn, interrupt, clearTranscript,
  };
}
