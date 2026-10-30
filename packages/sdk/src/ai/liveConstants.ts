/**
 * @file liveConstants.ts
 * @description Constants, endpoint URIs, and types for Gemini Multimodal Live streaming.
 */

export const DEFAULT_LIVE_MODEL = 'models/gemini-2.0-flash-exp';
export const LIVE_WEBSOCKET_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

export type LiveVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';

export interface LiveMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LiveToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'calling' | 'executed' | 'failed';
  result?: unknown;
  durationMs?: number;
}

export interface GeminiLiveConfig {
  /** Gemini model identifier supporting live streaming. Defaults to 'models/gemini-2.0-flash-exp'. */
  model?: string;
  /** Natural sounding voice name for audio generation. Defaults to 'Aoede'. */
  voiceName?: LiveVoiceName;
  /** Custom system instruction guiding conversational behavior and hardware actions. */
  systemInstruction?: string;
  /** Extended thinking budget in tokens. Sent only when it is a non-zero number; when omitted no thinkingConfig is sent. */
  thinkingBudget?: number;
}

/**
 * The `clientContent` frame for background context. `turnComplete: false` makes the model read the text
 * with the next completed turn instead of replying to it. Returns null when the text is empty after trimming.
 */
export function buildLiveContextFrame(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  return JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: value }] }], turnComplete: false } });
}
