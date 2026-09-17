/**
 * @file useGeminiLive.ts
 * @description Real-time bidirectional streaming audio, text, and hardware tool execution
 * with Gemini 3.8 Multimodal Live API via WebSockets.
 *
 * Adheres to the Zero-Simulation Principle: reports source: 'unavailable' and null states
 * when disconnected or without a valid Gemini API key.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  listTools,
  toFunctionDeclarations,
  runTool,
  type ToolDef,
} from './tools/registry';
import { getStoredApiKey } from './geminiClient';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';
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

export interface GeminiLiveTelemetry {
  /** Whether the WebSocket session to Gemini Live is active and ready. */
  isConnected: boolean;
  /** Whether the model is actively streaming an audio or text response. */
  isStreaming: boolean;
  /** Whether synthesized speech audio is currently playing. */
  isSpeaking: boolean;
  /** Whether the client is streaming microphone audio chunks to the server. */
  isListening: boolean;
  /** Whether the client is actively streaming media (camera video frames or images) to the server. */
  isStreamingMedia: boolean;
  /** Real-time transcript of conversational dialogue. */
  transcript: LiveMessage[];
  /** Latest reasoning thoughts emitted by the model during extended thinking. */
  currentThinking: string | null;
  /** Real-time hardware tool invocations executed during the session. */
  activeToolCalls: LiveToolCall[];
  /** Error message if connection or streaming protocol encountered a failure. */
  error: string | null;
  /** Provenance of the data: 'hardware' when connected with valid key, or 'unavailable'. */
  source: TelemetrySource;
  /** Establishes the bidirectional WebSocket session to the Gemini Live endpoint. */
  connect: (customApiKey?: string) => Promise<boolean>;
  /** Closes the active live streaming session. */
  disconnect: () => void;
  /** Sends a text prompt through the live duplex session. */
  sendText: (text: string) => void;
  /** Streams a base64 PCM audio chunk (16kHz 16-bit mono) from the microphone array. */
  sendAudioChunk: (pcmBase64: string) => void;
  /** Streams a base64 camera image/video frame into the real-time multimodal live session. */
  sendImageChunk: (base64Data: string, mimeType?: string) => void;
  /** Streams a continuous camera video frame (JPEG base64) into the real-time live session. */
  sendVideoFrame: (base64Jpeg: string) => void;
  /** Sends a multimodal user turn containing both text and image attachments. */
  sendMultimodalTurn: (text: string, images?: Array<{ data: string; mimeType?: string }>) => void;
  /** Signals the model to interrupt speech immediately. */
  interrupt: () => void;
  /** Clears the transcript and active tool calls. */
  clearTranscript: () => void;
}

export function useGeminiLive(config: GeminiLiveConfig = {}): GeminiLiveTelemetry {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isStreamingMedia, setIsStreamingMedia] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<LiveMessage[]>([]);
  const [currentThinking, setCurrentThinking] = useState<string | null>(null);
  const [activeToolCalls, setActiveToolCalls] = useState<LiveToolCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const apiKeyRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close(1000, 'User closed connection');
      } catch {}
      socketRef.current = null;
    }
    setIsConnected(false);
    setIsStreaming(false);
    setIsSpeaking(false);
    setIsListening(false);
    setIsStreamingMedia(false);
    logEvent(MODULE, 'disconnected', {});
  }, []);

  const connect = useCallback(
    async (customApiKey?: string): Promise<boolean> => {
      disconnect();

      const key = customApiKey || (await getStoredApiKey());
      if (!key) {
        const msg = 'No Gemini API key available. Configure an API key to connect to Gemini Live.';
        setError(msg);
        logError(MODULE, 'missing_api_key', { message: msg });
        return false;
      }
      apiKeyRef.current = key;

      try {
        const url = `${LIVE_WEBSOCKET_ENDPOINT}?key=${encodeURIComponent(key)}`;
        const ws = new WebSocket(url);
        socketRef.current = ws;

        return new Promise<boolean>((resolve) => {
          ws.onopen = () => {
            setIsConnected(true);
            setError(null);
            logEvent(MODULE, 'connected', { endpoint: LIVE_WEBSOCKET_ENDPOINT });

            // 1. Send Setup Handshake Message
            const modelName = config.model ?? DEFAULT_LIVE_MODEL;
            const toolsPayload =
              config.enableHardwareTools !== false
                ? [{ functionDeclarations: toFunctionDeclarations(listTools()) }]
                : [];

            const setupMsg: Record<string, unknown> = {
              setup: {
                model: modelName,
                generationConfig: {
                  responseModalities: ['AUDIO', 'TEXT'],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName: config.voiceName ?? 'Aoede',
                      },
                    },
                  },
                  thinkingConfig: config.thinkingBudget
                    ? { thinkingBudget: config.thinkingBudget }
                    : undefined,
                },
                systemInstruction: {
                  parts: [
                    {
                      text:
                        config.systemInstruction ??
                        'You are PixelKit Live, a real-time voice and hardware assistant running on a Google Pixel 11 Pro. You have full access to device hardware tools (thermals, sensors, battery, torch, radios). Execute tools when requested.',
                    },
                  ],
                },
                tools: toolsPayload,
              },
            };

            ws.send(JSON.stringify(setupMsg));
            logEvent(MODULE, 'setup_sent', { model: modelName });
            resolve(true);
          };

          ws.onmessage = async (event) => {
            try {
              const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;
              if (!data) return;

              // Handle server content turns
              if (data.serverContent) {
                const parts = data.serverContent.modelTurn?.parts ?? [];
                let fullChunkText = '';

                for (const part of parts) {
                  // Thinking thoughts
                  if (part.thought) {
                    setCurrentThinking(prev => (prev ? prev + part.thought : part.thought));
                  }
                  // Model text output
                  if (part.text) {
                    fullChunkText += part.text;
                  }
                  // Model audio stream chunk
                  if (part.inlineData && part.inlineData.mimeType?.includes('audio')) {
                    setIsSpeaking(true);
                  }
                }

                if (fullChunkText) {
                  setIsStreaming(true);
                  setTranscript(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'model') {
                      return [
                        ...prev.slice(0, -1),
                        { ...last, text: last.text + fullChunkText, timestamp: Date.now() },
                      ];
                    }
                    return [
                      ...prev,
                      { id: `m-${Date.now()}`, role: 'model', text: fullChunkText, timestamp: Date.now() },
                    ];
                  });
                }

                if (data.serverContent.interrupted) {
                  setIsSpeaking(false);
                  setIsStreaming(false);
                  logEvent(MODULE, 'interrupted', {});
                }

                if (data.serverContent.turnComplete) {
                  setIsStreaming(false);
                  setIsSpeaking(false);
                  logEvent(MODULE, 'turn_complete', {});
                }
              }

              // Handle model tool call requests
              if (data.toolCall && Array.isArray(data.toolCall.functionCalls)) {
                const calls = data.toolCall.functionCalls;
                const responses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];

                for (const call of calls) {
                  const callId = call.id ?? `call-${Date.now()}`;
                  const callName = call.name ?? '';
                  const callArgs = call.args ?? {};

                  setActiveToolCalls(prev => [
                    ...prev,
                    { id: callId, name: callName, args: callArgs, status: 'calling' },
                  ]);

                  const start = performance.now();
                  const toolResult = await runTool(callName, callArgs);
                  const durationMs = Math.round(performance.now() - start);

                  setActiveToolCalls(prev =>
                    prev.map(t =>
                      t.id === callId
                        ? {
                            ...t,
                            status: toolResult.ok ? 'executed' : 'failed',
                            result: toolResult.result ?? toolResult.error,
                            durationMs,
                          }
                        : t,
                    ),
                  );

                  responses.push({
                    id: callId,
                    name: callName,
                    response: { output: toolResult.result ?? { error: toolResult.error } },
                  });
                }

                // Send toolResponse back to server
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      toolResponse: {
                        functionResponses: responses,
                      },
                    }),
                  );
                  logEvent(MODULE, 'tool_responses_sent', { count: responses.length });
                }
              }
            } catch (err: any) {
              logError(MODULE, 'message_processing_failed', { message: err?.message || String(err) });
            }
          };

          ws.onerror = (evt) => {
            const msg = 'WebSocket connection to Gemini Live encountered an error.';
            setError(msg);
            logError(MODULE, 'websocket_error', { event: String(evt) });
            resolve(false);
          };

          ws.onclose = () => {
            setIsConnected(false);
            setIsStreaming(false);
            setIsSpeaking(false);
            setIsListening(false);
            setIsStreamingMedia(false);
            logEvent(MODULE, 'socket_closed', {});
          };
        });
      } catch (err: any) {
        const msg = err?.message || String(err);
        setError(msg);
        logError(MODULE, 'connection_failed', { message: msg });
        return false;
      }
    },
    [config, disconnect],
  );

  const sendText = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      setTranscript(prev => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', text: q, timestamp: Date.now() },
      ]);

      const clientMsg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: q }],
            },
          ],
          turnComplete: true,
        },
      };

      socketRef.current.send(JSON.stringify(clientMsg));
      logEvent(MODULE, 'text_sent', { text: q });
    },
    [],
  );

  const sendAudioChunk = useCallback(
    (pcmBase64: string) => {
      if (!pcmBase64 || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      setIsListening(true);
      const audioMsg = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: 'audio/pcm;rate=16000',
              data: pcmBase64,
            },
          ],
        },
      };

      socketRef.current.send(JSON.stringify(audioMsg));
    },
    [],
  );

  const sendImageChunk = useCallback(
    (base64Data: string, mimeType: string = 'image/jpeg') => {
      if (!base64Data || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

      setIsStreamingMedia(true);
      const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageMsg = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType,
              data: cleanBase64,
            },
          ],
        },
      };

      socketRef.current.send(JSON.stringify(imageMsg));
      logEvent(MODULE, 'image_chunk_sent', { mimeType, bytes: cleanBase64.length });
    },
    [],
  );

  const sendVideoFrame = useCallback(
    (base64Jpeg: string) => {
      sendImageChunk(base64Jpeg, 'image/jpeg');
    },
    [sendImageChunk],
  );

  const sendMultimodalTurn = useCallback(
    (text: string, images?: Array<{ data: string; mimeType?: string }>) => {
      const q = text.trim();
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
      if (!q && (!images || images.length === 0)) return;

      setTranscript(prev => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', text: q || '[Attached Image Frame]', timestamp: Date.now() },
      ]);

      const parts: Array<Record<string, unknown>> = [];
      if (q) parts.push({ text: q });
      if (images && images.length > 0) {
        for (const img of images) {
          const clean = img.data.replace(/^data:image\/[a-z]+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: clean,
            },
          });
        }
      }

      const clientMsg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts,
            },
          ],
          turnComplete: true,
        },
      };

      socketRef.current.send(JSON.stringify(clientMsg));
      logEvent(MODULE, 'multimodal_turn_sent', { text: q, imageCount: images?.length ?? 0 });
    },
    [],
  );

  const interrupt = useCallback(() => {
    setIsSpeaking(false);
    setIsStreaming(false);
    logEvent(MODULE, 'interrupt_triggered', {});
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setCurrentThinking(null);
    setActiveToolCalls([]);
    logEvent(MODULE, 'transcript_cleared', {});
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  const source: TelemetrySource = isConnected ? 'hardware' : 'unavailable';

  return {
    isConnected,
    isStreaming,
    isSpeaking,
    isListening,
    isStreamingMedia,
    transcript,
    currentThinking,
    activeToolCalls,
    error,
    source,
    connect,
    disconnect,
    sendText,
    sendAudioChunk,
    sendImageChunk,
    sendVideoFrame,
    sendMultimodalTurn,
    interrupt,
    clearTranscript,
  };
}
