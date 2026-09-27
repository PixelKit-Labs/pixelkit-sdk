export type OwnedSpeechCallbackType = 'start' | 'done' | 'error' | 'stop' | 'replaced';

/** Correlates native callbacks to one utterance and permanently closes after its terminal callback. */
export class SpeechCallbackOwnership {
  private readonly seen = new Set<string>();
  private terminal = false;

  constructor(readonly utteranceId: string) {}

  accept(callbackUtteranceId: string, type: OwnedSpeechCallbackType, at: number): boolean {
    if (this.terminal || callbackUtteranceId !== this.utteranceId) return false;
    const key = `${type}:${at}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (type === 'done' || type === 'error' || type === 'stop' || type === 'replaced') {
      this.terminal = true;
    }
    return true;
  }
}
