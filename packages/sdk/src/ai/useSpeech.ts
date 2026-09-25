/**
 * @file useSpeech.ts
 * @description Text to speech on `expo-speech`, the output half of the voice story.
 *
 * `useSpeechAI` turns speech into text; this turns text back into speech, using the voices the
 * platform has installed. On a Pixel those come from the system speech service, so quality and
 * language coverage depend on what the user has downloaded rather than on this app.
 *
 * Nothing here is simulated: `voices` is whatever the platform reports, and `isSpeaking` reflects
 * the engine rather than a local guess.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import PixelNative from '@pixelkit-labs/native';
import { logError, logEvent, traced, type TelemetrySource } from '../core/observability';

const MODULE = 'useSpeech';

export interface SpeakOptions {
  /** BCP-47 tag, for example 'en-GB'. Defaults to the system language. */
  language?: string;
  /** Identifier from `voices`. Overrides `language` when both are given. */
  voice?: string;
  /** 1 is normal. Lower is slower. */
  rate?: number;
  /** 1 is normal. Higher is higher pitched. */
  pitch?: number;
  /** 0 to 1. */
  volume?: number;
  /** Android TTS service package to use for this utterance, without changing the system default. */
  enginePackage?: string;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [speechEngines, setSpeechEngines] = useState<{ packageName: string; label: string }[]>([]);
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [voice, setVoice] = useState<string | null>(null);
  const [hasReadVoices, setHasReadVoices] = useState<boolean>(false);

  const mounted = useRef(true);
  const explicitEngineRef = useRef(false);
  const ownsSpeechRef = useRef(false);

  /** Longest string the engine accepts in one call. */
  const maxInputLength = Speech.maxSpeechInputLength;
  const source: TelemetrySource = hasReadVoices ? 'hardware' : 'unavailable';

  const refreshVoices = useCallback(async (): Promise<Speech.Voice[]> => {
    try {
      const list = await traced(MODULE, 'getAvailableVoices', () => Speech.getAvailableVoicesAsync());
      if (!mounted.current) return list;
      setVoices(list);
      setHasReadVoices(true);
      logEvent(MODULE, 'voices', { count: list.length });
      return list;
    } catch (e: any) {
      setError(e?.message ?? 'Could not read installed voices');
      return [];
    }
  }, []);

  const refreshSpeechEngines = useCallback(async () => {
    if (!PixelNative?.listSpeechEngines) { setSpeechEngines([]); return []; }
    try {
      const engines = await traced(MODULE, 'listSpeechEngines', () => PixelNative!.listSpeechEngines());
      setSpeechEngines(engines);
      logEvent(MODULE, 'speech engines', { count: engines.length });
      return engines;
    } catch (e: any) {
      setSpeechEngines([]);
      setError(e?.message ?? 'Could not read installed speech engines');
      return [];
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshVoices();
    void refreshSpeechEngines();
    return () => {
      mounted.current = false;
      // Do not leave the engine talking after the screen goes away.
      if (ownsSpeechRef.current && !explicitEngineRef.current) {
        void traced(MODULE, 'stopOnUnmount', () => Speech.stop()).catch(e => { logError(MODULE, 'stopOnUnmount', e); });
      }
      if (ownsSpeechRef.current && explicitEngineRef.current && PixelNative?.stopSpeechEngine) {
        void traced(MODULE, 'stopSpeechEngineOnUnmount', () => PixelNative!.stopSpeechEngine()).catch(e => { logError(MODULE, 'stopSpeechEngineOnUnmount', e); });
      }
    };
  }, [refreshVoices, refreshSpeechEngines]);

  /**
   * Speaks the text. Resolves when the engine finishes, so it can be awaited in a sequence.
   * Text longer than `maxInputLength` is rejected rather than silently truncated.
   */
  const speak = useCallback((text: string, options?: SpeakOptions): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    if (trimmed.length > maxInputLength) {
      const message = `Text is ${trimmed.length} characters; the engine accepts ${maxInputLength}`;
      setError(message);
      return Promise.reject(new Error(message));
    }
    setError(null);
    if (options?.enginePackage) {
      const native = PixelNative;
      if (!native?.speakWithSpeechEngine) {
        const message = 'Explicit Android speech engine is unavailable in this build';
        setError(message);
        return Promise.reject(new Error(message));
      }
      const enginePackage = options.enginePackage;
      explicitEngineRef.current = true;
      ownsSpeechRef.current = true;
      setIsSpeaking(true);
      setIsPaused(false);
      setLastSpokenText(trimmed);
      return traced(MODULE, 'speakWithEngine', () => native.speakWithSpeechEngine(
        enginePackage, trimmed, options.rate ?? rate, options.pitch ?? pitch, options.volume ?? 1,
      ), { enginePackage, chars: trimmed.length }).catch((e: any) => {
        setError(e?.message ?? 'Speech engine failed');
        throw e;
      }).finally(() => {
        explicitEngineRef.current = false;
        ownsSpeechRef.current = false;
        setIsSpeaking(false);
        setIsPaused(false);
      });
    }
    return new Promise<void>((resolve, reject) => {
      const started = Date.now();
      ownsSpeechRef.current = true;
      void traced(MODULE, 'startPlatformSpeech', () => Speech.speak(trimmed, {
        language: options?.language,
        voice: options?.voice ?? voice ?? undefined,
        rate: options?.rate ?? rate,
        pitch: options?.pitch ?? pitch,
        volume: options?.volume,
        onStart: () => {
          setIsSpeaking(true);
          setIsPaused(false);
          setLastSpokenText(trimmed);
        },
        onDone: () => {
          setIsSpeaking(false);
          setIsPaused(false);
          ownsSpeechRef.current = false;
          logEvent(MODULE, 'spoken', { chars: trimmed.length, ms: Date.now() - started });
          resolve();
        },
        onStopped: () => {
          setIsSpeaking(false);
          setIsPaused(false);
          ownsSpeechRef.current = false;
          resolve();
        },
        onError: (e: Error) => {
          setIsSpeaking(false);
          setIsPaused(false);
          ownsSpeechRef.current = false;
          setError(e?.message ?? 'Speech failed');
          logEvent(MODULE, 'speak error', { message: e?.message }, 'error');
          reject(e);
        },
      })).catch(e => { ownsSpeechRef.current = false; reject(e); });
    });
  }, [maxInputLength, pitch, rate, voice]);

  const stop = useCallback(async () => {
    try {
      if (explicitEngineRef.current && PixelNative?.stopSpeechEngine) {
        await traced(MODULE, 'stopSpeechEngine', () => PixelNative!.stopSpeechEngine());
      } else {
        await traced(MODULE, 'stop', () => Speech.stop());
      }
      setIsSpeaking(false);
      setIsPaused(false);
      ownsSpeechRef.current = false;
    } catch (e: any) {
      setError(e?.message ?? 'Could not stop speech');
    }
  }, []);

  const pause = useCallback(async () => {
    if (explicitEngineRef.current) { setError('Pause is unavailable for the selected Android speech engine'); return; }
    try { await traced(MODULE, 'pause', () => Speech.pause()); setIsPaused(true); } catch (e: any) { setError(e?.message ?? 'Pause is unsupported here'); }
  }, []);

  const resume = useCallback(async () => {
    if (explicitEngineRef.current) { setError('Resume is unavailable for the selected Android speech engine'); return; }
    try { await traced(MODULE, 'resume', () => Speech.resume()); setIsPaused(false); } catch (e: any) { setError(e?.message ?? 'Resume is unsupported here'); }
  }, []);

  /** Asks the engine directly rather than trusting the local flag. */
  const checkSpeaking = useCallback(async (): Promise<boolean> => {
    try {
      if (explicitEngineRef.current && PixelNative?.isSpeechEngineSpeaking) {
        const speaking = await traced(MODULE, 'isSpeechEngineSpeaking', () => PixelNative!.isSpeechEngineSpeaking());
        setIsSpeaking(speaking);
        return speaking;
      }
      const speaking = await traced(MODULE, 'isSpeaking', () => Speech.isSpeakingAsync());
      setIsSpeaking(speaking);
      return speaking;
    } catch (e) {
      logError(MODULE, 'checkSpeaking', e);
      return false;
    }
  }, []);

  /** Voices for one language tag, for example every 'en' voice installed. */
  const voicesForLanguage = useCallback(
    (languageTag: string) => voices.filter(v => v.language.toLowerCase().startsWith(languageTag.toLowerCase())),
    [voices],
  );

  return {
    /** Whether the engine is currently speaking. */
    isSpeaking,
    /** Whether speech is paused rather than stopped. */
    isPaused,
    /** Voices the platform has installed, each with an identifier, name, language and quality. */
    voices,
    /** Android TTS services installed on this phone. */
    speechEngines,
    /** Identifier of the selected voice, or null for the system default. */
    voice,
    /** Speaking speed; 1 is normal. */
    rate,
    /** Voice pitch; 1 is normal. */
    pitch,
    /** Longest string the engine accepts in one call. */
    maxInputLength,
    /** Text of the most recent utterance. */
    lastSpokenText,
    error,
    source,

    speak,
    stop,
    pause,
    resume,
    checkSpeaking,
    refreshVoices,
    refreshSpeechEngines,
    voicesForLanguage,
    /** Selects a voice by identifier; null returns to the system default. */
    setVoice,
    setRate,
    setPitch,
  };
}
