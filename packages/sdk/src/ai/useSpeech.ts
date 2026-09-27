/**
 * @file useSpeech.ts
 * @description Platform TTS plus exact, per-utterance Android engine selection.
 *
 * `useSpeechAI` turns speech into text; this hook turns text back into speech. The default path
 * uses `expo-speech`. An explicit Android package is accepted only when native initialization can
 * observe that exact active package, its installed version, and the selected voice/locale.
 *
 * External TTS apps own their installation and model files. PixelKit neither downloads those
 * assets nor infers an engine's internal execution provider from binding or playback callbacks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import PixelNative, {
  type AndroidTtsIdentity,
  type GeminiLiveAudioIdentity,
  type PlatformTtsIdentity,
  type SpeechEngineCallback,
  type SpeechEngineEvent,
  type SpeechEngineInfo,
  type SpeechEngineStatus,
  type SpeechEngineSynthesisRequest,
  type SpeechOutputIdentity,
  type SpeechSynthesisResult,
  type SpeechSynthesisStatus,
  type SpeechVoiceIdentity,
} from '@pixelkit-labs/native';
import {
  beginTrace,
  logError,
  logEvent,
  traced,
  type ObservabilityOptions,
  type TelemetrySource,
  type TraceContext,
  type TraceScope,
} from '../core/observability';
import { SpeechCallbackOwnership } from './speechCallbackOwnership';

const MODULE = 'useSpeech';
let speechUtteranceSequence = 0;

export type {
  AndroidTtsIdentity,
  GeminiLiveAudioIdentity,
  PlatformTtsIdentity,
  SpeechEngineCallback,
  SpeechEngineEvent,
  SpeechEngineInfo,
  SpeechEngineStatus,
  SpeechEngineSynthesisRequest,
  SpeechOutputIdentity,
  SpeechSynthesisResult,
  SpeechSynthesisStatus,
  SpeechVoiceIdentity,
};

export type SpeechPlaybackEvent = {
  callback: 'start' | 'done' | 'error' | 'stop' | 'replaced';
  callbackAt: number;
  utteranceId: string;
  status: 'preparing' | 'started' | 'completed' | 'failed' | 'cancelled' | 'replaced';
  identity: SpeechOutputIdentity | null;
  errorCode?: string;
  error?: string;
  synthesisErrorCode?: number;
};

export interface SpeakOptions {
  /** BCP-47 tag, for example 'en-GB'. Defaults to the engine's locale. */
  language?: string;
  /** Identifier from `voices`, or an explicit Android engine's Voice.name. */
  voice?: string;
  /** 1 is normal. Lower is slower. */
  rate?: number;
  /** 1 is normal. Higher is higher pitched. */
  pitch?: number;
  /** 0 to 1. */
  volume?: number;
  /** Android TTS service package to use for this utterance, without changing the system default. */
  enginePackage?: string;
  /** Runs after exact Android package/voice identity is resolved and before synthesis is requested. */
  onIdentityResolved?: (identity: AndroidTtsIdentity) => void;
  onStart?: (event: SpeechPlaybackEvent) => void;
  onDone?: (event: SpeechPlaybackEvent) => void;
  onError?: (event: SpeechPlaybackEvent) => void;
}

export interface SpeechVerificationOptions extends Omit<SpeakOptions, 'enginePackage'> {
  enginePackage: string;
}

export type SpeechVerificationResult = {
  /** This identity was delivered to onIdentityResolved before the phrase was submitted. */
  identity: AndroidTtsIdentity;
  synthesis: SpeechSynthesisResult;
};

export interface SpeechRunOptions extends ObservabilityOptions {
  context: TraceContext;
}

interface ActiveSpeech {
  scope: TraceScope;
  resolve?: () => void;
  callbacks?: Pick<SpeakOptions, 'onStart' | 'onDone' | 'onError'>;
  ownership: SpeechCallbackOwnership;
}

function traceIdentity(identity: AndroidTtsIdentity): Record<string, unknown> {
  return {
    requestedPackage: identity.requestedPackage,
    installedPackage: identity.installedPackage,
    installedVersionName: identity.installedVersionName,
    installedVersionCode: identity.installedVersionCode,
    resolvedEnginePackage: identity.resolvedEnginePackage,
    resolvedEngineName: identity.resolvedEngineName,
    initializationStatus: identity.initializationStatus,
    identityVerified: identity.identityVerified,
    bindingEvidence: identity.bindingEvidence,
    selectedVoice: identity.selectedVoice?.name,
    selectedLocale: identity.selectedLocale,
    executionProviderObserved: false,
  };
}

function nativeTraceContext(context: TraceContext): Record<string, string | null> {
  const mapped: Record<string, string | null> = {
    traceId: context.traceId,
    spanId: context.spanId,
  };
  if (context.parentSpanId) mapped.parentSpanId = context.parentSpanId;
  if (context.runId) mapped.runId = context.runId;
  if (context.turnId) mapped.turnId = context.turnId;
  if (context.toolCallId) mapped.toolCallId = context.toolCallId;
  if (context.workerRunId) mapped.workerRunId = context.workerRunId;
  if (context.providerRequestId) mapped.providerRequestId = context.providerRequestId;
  if (context.nativeRequestId) mapped.nativeRequestId = context.nativeRequestId;
  return mapped;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [speechEngines, setSpeechEngines] = useState<SpeechEngineInfo[]>([]);
  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);
  const [lastSpeechIdentity, setLastSpeechIdentity] = useState<SpeechOutputIdentity | null>(null);
  const [lastSynthesis, setLastSynthesis] = useState<SpeechSynthesisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [voice, setVoice] = useState<string | null>(null);
  const [hasReadVoices, setHasReadVoices] = useState<boolean>(false);

  const mounted = useRef(true);
  const explicitEngineRef = useRef(false);
  const ownsSpeechRef = useRef(false);
  const activeSpeechRef = useRef<ActiveSpeech | null>(null);

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
    const native = PixelNative;
    const speechEventSubscription = native?.addListener('onSpeechEngineEvent', nativeEvent => {
      const active = activeSpeechRef.current;
      if (
        !active?.scope.active
        || !active.ownership.accept(nativeEvent.utteranceId, nativeEvent.callback, nativeEvent.callbackAt)
      ) return;
      const event: SpeechPlaybackEvent = nativeEvent;
      if (nativeEvent.identity) setLastSpeechIdentity(nativeEvent.identity);
      if (nativeEvent.callback === 'start') {
        setIsSpeaking(true);
        setIsPaused(false);
        active.scope.event('first_response', {
          utteranceId: nativeEvent.utteranceId,
          callbackAt: nativeEvent.callbackAt,
          ...(nativeEvent.identity ? traceIdentity(nativeEvent.identity) : {}),
        });
        try { active.callbacks?.onStart?.(event); }
        catch (cause) { logError(MODULE, 'onStart callback', cause); }
      } else if (nativeEvent.callback === 'done') {
        setIsSpeaking(false);
        try { active.callbacks?.onDone?.(event); }
        catch (cause) { logError(MODULE, 'onDone callback', cause); }
      } else if (nativeEvent.callback === 'error') {
        setIsSpeaking(false);
        setError(nativeEvent.error ?? 'Speech engine failed');
        try { active.callbacks?.onError?.(event); }
        catch (cause) { logError(MODULE, 'onError callback', cause); }
      } else if (nativeEvent.callback === 'stop' || nativeEvent.callback === 'replaced') {
        setIsSpeaking(false);
      }
    });
    return () => {
      mounted.current = false;
      speechEventSubscription?.remove();
      activeSpeechRef.current?.scope.end('cancelled', { reason: 'unmounted' });
      activeSpeechRef.current?.resolve?.();
      activeSpeechRef.current = null;
      // Do not leave the engine talking after the screen goes away.
      if (ownsSpeechRef.current && !explicitEngineRef.current) {
        void traced(MODULE, 'stopOnUnmount', () => Speech.stop()).catch(e => { logError(MODULE, 'stopOnUnmount', e); });
      }
      if (ownsSpeechRef.current && explicitEngineRef.current && native?.stopSpeechEngine) {
        void traced(MODULE, 'stopSpeechEngineOnUnmount', () => native.stopSpeechEngine()).catch(e => { logError(MODULE, 'stopSpeechEngineOnUnmount', e); });
      }
    };
  }, [refreshVoices, refreshSpeechEngines]);

  const resolveSpeechEngineIdentity = useCallback(async (
    packageName: string,
    run: SpeechRunOptions,
    options?: Pick<SpeakOptions, 'language' | 'voice'>,
  ): Promise<AndroidTtsIdentity> => {
    const scope = beginTrace(MODULE, 'resolve_engine', 'hardware', { requestedPackage: packageName }, run);
    const native = PixelNative;
    if (!native?.resolveSpeechEngine) {
      const message = 'Explicit Android speech engine identity is unavailable in this build';
      scope.end('unavailable', { reason: 'explicit_engine_identity_unavailable' });
      throw new Error(message);
    }
    try {
      const identity = await native.resolveSpeechEngine(packageName, options?.language, options?.voice);
      setLastSpeechIdentity(identity);
      scope.end(identity.available ? 'ok' : 'unavailable', traceIdentity(identity), identity.error);
      return identity;
    } catch (cause) {
      scope.end('error', { requestedPackage: packageName }, cause);
      throw cause;
    }
  }, []);

  const performExplicitSpeech = useCallback(async (
    text: string,
    run: SpeechRunOptions,
    options: SpeakOptions & { enginePackage: string },
    operation: 'speak' | 'verify_engine',
  ): Promise<{ identity: AndroidTtsIdentity; synthesis: SpeechSynthesisResult }> => {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('A verification or speech phrase is required');
    if (activeSpeechRef.current?.scope.active) throw new Error('Speech is already active');
    const scope = beginTrace(MODULE, operation, 'hardware', {
      chars: trimmed.length,
      requestedPackage: options.enginePackage,
      audioSource: 'android_tts',
    }, run);
    if (trimmed.length > maxInputLength) {
      const message = `Text is ${trimmed.length} characters; the engine accepts ${maxInputLength}`;
      setError(message);
      scope.end('error', undefined, message);
      throw new Error(message);
    }

    const native = PixelNative;
    if (!native?.resolveSpeechEngine || !native.speakWithSpeechEngineDetails) {
      const message = 'Explicit Android speech engine identity is unavailable in this build';
      setError(message);
      scope.end('unavailable', { reason: 'explicit_engine_identity_unavailable' });
      throw new Error(message);
    }

    const utteranceId = `pixelkit-${Date.now()}-${++speechUtteranceSequence}`;
    const requestedAt = Date.now();
    const active: ActiveSpeech = {
      scope,
      callbacks: options,
      ownership: new SpeechCallbackOwnership(utteranceId),
    };
    activeSpeechRef.current = active;
    explicitEngineRef.current = true;
    ownsSpeechRef.current = true;
    setError(null);
    setIsPaused(false);
    setLastSynthesis(null);
    scope.event('request_accepted', { chars: trimmed.length, utteranceId });

    try {
      const identity = await native.resolveSpeechEngine(
        options.enginePackage,
        options.language ?? null,
        options.voice ?? voice ?? null,
      );
      if (!scope.active || activeSpeechRef.current !== active) {
        throw new Error('Speech was cancelled before engine identity resolved');
      }
      setLastSpeechIdentity(identity);
      scope.event('engine_identity_resolved', {
        utteranceId,
        ...traceIdentity(identity),
      }, identity.available ? 'info' : 'warn');
      try { options.onIdentityResolved?.(identity); }
      catch (cause) { logError(MODULE, 'onIdentityResolved callback', cause); }
      if (!identity.available || !identity.identityVerified) {
        const failedAt = Date.now();
        const message = identity.error ?? `Requested speech engine ${options.enginePackage} is unavailable`;
        const errorCode = identity.errorCode ?? 'ERR_TTS_ENGINE';
        const synthesis: SpeechSynthesisResult = {
          status: 'failed',
          identity,
          utteranceId,
          requestedAt,
          identityResolvedAt: failedAt,
          startedAt: null,
          completedAt: null,
          failedAt,
          cancelledAt: null,
          callbacks: [{ type: 'error', at: failedAt, errorCode }],
          errorCode,
          error: message,
          synthesisErrorCode: null,
          textLength: trimmed.length,
          traceContext: nativeTraceContext(scope.context),
        };
        setLastSynthesis(synthesis);
        setError(message);
        const errorEvent: SpeechPlaybackEvent = {
          callback: 'error',
          callbackAt: failedAt,
          utteranceId,
          status: 'failed',
          identity,
          errorCode,
          error: message,
        };
        active.ownership.accept(utteranceId, 'error', failedAt);
        try { options.onError?.(errorEvent); }
        catch (cause) { logError(MODULE, 'onError callback', cause); }
        scope.end('unavailable', {
          utteranceId,
          failedAt,
          ...traceIdentity(identity),
        }, message);
        throw Object.assign(new Error(message), { code: errorCode, identity, synthesis });
      }

      setLastSpokenText(trimmed);
      const synthesis = await native.speakWithSpeechEngineDetails({
        packageName: options.enginePackage,
        text: trimmed,
        rate: options.rate ?? rate,
        pitch: options.pitch ?? pitch,
        volume: options.volume ?? 1,
        language: options.language ?? null,
        voice: options.voice ?? voice ?? null,
        utteranceId,
        traceContext: nativeTraceContext(scope.context),
      });
      setLastSynthesis(synthesis);
      setLastSpeechIdentity(synthesis.identity ?? identity);

      // Native events are normally delivered in real time. Replay only callbacks not already
      // observed, so a bridge scheduling race cannot hide start/done/error from the caller.
      for (const callback of synthesis.callbacks) {
        if (!active.ownership.accept(utteranceId, callback.type, callback.at)) continue;
        const event: SpeechPlaybackEvent = {
          callback: callback.type,
          callbackAt: callback.at,
          utteranceId,
          status: callback.type === 'start'
            ? 'started'
            : callback.type === 'done'
              ? 'completed'
              : callback.type === 'error'
                ? 'failed'
                : callback.type === 'replaced'
                  ? 'replaced'
                  : 'cancelled',
          identity: synthesis.identity ?? identity,
          ...(callback.errorCode ? { errorCode: callback.errorCode } : {}),
          ...(callback.synthesisErrorCode != null ? { synthesisErrorCode: callback.synthesisErrorCode } : {}),
          ...(synthesis.error ? { error: synthesis.error } : {}),
        };
        if (callback.type === 'start') {
          try { options.onStart?.(event); } catch (cause) { logError(MODULE, 'onStart callback', cause); }
        } else if (callback.type === 'done') {
          try { options.onDone?.(event); } catch (cause) { logError(MODULE, 'onDone callback', cause); }
        } else if (callback.type === 'error') {
          try { options.onError?.(event); } catch (cause) { logError(MODULE, 'onError callback', cause); }
        }
      }

      if (synthesis.status === 'failed') {
        const message = synthesis.error ?? 'Speech engine failed';
        setError(message);
        scope.end('error', {
          utteranceId,
          errorCode: synthesis.errorCode,
          synthesisErrorCode: synthesis.synthesisErrorCode,
        }, message);
        throw Object.assign(new Error(message), { code: synthesis.errorCode, synthesis });
      }
      if (synthesis.status === 'cancelled' || synthesis.status === 'replaced') {
        scope.end('cancelled', { utteranceId, nativeStatus: synthesis.status });
      } else {
        scope.end('ok', {
          utteranceId,
          startedAt: synthesis.startedAt,
          completedAt: synthesis.completedAt,
          ...traceIdentity(synthesis.identity ?? identity),
        });
      }
      return { identity, synthesis };
    } catch (cause) {
      if (scope.active) scope.end('error', { utteranceId }, cause);
      throw cause;
    } finally {
      if (activeSpeechRef.current === active) activeSpeechRef.current = null;
      explicitEngineRef.current = false;
      ownsSpeechRef.current = false;
      setIsSpeaking(false);
      setIsPaused(false);
    }
  }, [maxInputLength, pitch, rate, voice]);

  /**
   * Resolves exact package identity, invokes onIdentityResolved, then speaks the caller's phrase.
   * The final result retains native start/done/error timestamps under the supplied trace context.
   */
  const verifySpeechEngine = useCallback(async (
    phrase: string,
    run: SpeechRunOptions,
    options: SpeechVerificationOptions,
  ): Promise<SpeechVerificationResult> => {
    return performExplicitSpeech(phrase, run, options, 'verify_engine');
  }, [performExplicitSpeech]);

  /**
   * Speaks the text. Resolves when the engine finishes, so it can be awaited in a sequence.
   * Text longer than `maxInputLength` is rejected rather than silently truncated.
   */
  const speak = useCallback((text: string, run: SpeechRunOptions, options?: SpeakOptions): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    if (options?.enginePackage) {
      return performExplicitSpeech(
        trimmed,
        run,
        { ...options, enginePackage: options.enginePackage },
        'speak',
      ).then(() => undefined);
    }
    if (activeSpeechRef.current?.scope.active) return Promise.reject(new Error('Speech is already active'));
    const scope = beginTrace(MODULE, 'speak', 'hardware', {
      chars: trimmed.length,
      audioSource: 'platform_tts',
    }, run);
    const utteranceId = `pixelkit-platform-${Date.now()}-${++speechUtteranceSequence}`;
    const active: ActiveSpeech = {
      scope,
      callbacks: options,
      ownership: new SpeechCallbackOwnership(utteranceId),
    };
    activeSpeechRef.current = active;
    if (trimmed.length > maxInputLength) {
      const message = `Text is ${trimmed.length} characters; the engine accepts ${maxInputLength}`;
      setError(message);
      scope.end('error', undefined, message);
      activeSpeechRef.current = null;
      return Promise.reject(new Error(message));
    }
    setError(null);
    scope.event('request_accepted', { chars: trimmed.length, utteranceId });
    const platformIdentity: PlatformTtsIdentity = {
      audioSource: 'platform_tts',
      requestedPackage: null,
      identityVerified: false,
      selectedVoice: options?.voice ?? voice,
      selectedLocale: options?.language ?? null,
    };
    setLastSpeechIdentity(platformIdentity);
    return new Promise<void>((resolve, reject) => {
      active.resolve = resolve;
      ownsSpeechRef.current = true;
      try {
        Speech.speak(trimmed, {
          language: options?.language,
          voice: options?.voice ?? voice ?? undefined,
          rate: options?.rate ?? rate,
          pitch: options?.pitch ?? pitch,
          volume: options?.volume,
          onStart: () => {
            if (!scope.active || activeSpeechRef.current !== active) return;
            const callbackAt = Date.now();
            setIsSpeaking(true);
            setIsPaused(false);
            setLastSpokenText(trimmed);
            scope.event('first_response', { utteranceId, audioSource: 'platform_tts', callbackAt });
            try {
              options?.onStart?.({ callback: 'start', callbackAt, utteranceId, status: 'started', identity: platformIdentity });
            } catch (cause) { logError(MODULE, 'onStart callback', cause); }
          },
          onDone: () => {
            if (!scope.active || activeSpeechRef.current !== active) return;
            const callbackAt = Date.now();
            setIsSpeaking(false);
            setIsPaused(false);
            ownsSpeechRef.current = false;
            activeSpeechRef.current = null;
            scope.end('ok', { utteranceId, completedAt: callbackAt });
            try {
              options?.onDone?.({ callback: 'done', callbackAt, utteranceId, status: 'completed', identity: platformIdentity });
            } catch (cause) { logError(MODULE, 'onDone callback', cause); }
            resolve();
          },
          onStopped: () => {
            if (!scope.active || activeSpeechRef.current !== active) return;
            setIsSpeaking(false);
            setIsPaused(false);
            ownsSpeechRef.current = false;
            activeSpeechRef.current = null;
            scope.end('cancelled', { utteranceId });
            resolve();
          },
          onError: (cause: Error) => {
            if (!scope.active || activeSpeechRef.current !== active) return;
            const callbackAt = Date.now();
            setIsSpeaking(false);
            setIsPaused(false);
            ownsSpeechRef.current = false;
            activeSpeechRef.current = null;
            setError(cause.message || 'Speech failed');
            scope.end('error', { utteranceId }, cause);
            try {
              options?.onError?.({
                callback: 'error',
                callbackAt,
                utteranceId,
                status: 'failed',
                identity: platformIdentity,
                error: cause.message,
              });
            } catch (callbackError) { logError(MODULE, 'onError callback', callbackError); }
            reject(cause);
          },
        });
      } catch (cause) {
        ownsSpeechRef.current = false;
        activeSpeechRef.current = null;
        scope.end('error', { utteranceId }, cause);
        reject(cause);
      }
    });
  }, [maxInputLength, performExplicitSpeech, pitch, rate, voice]);

  const stop = useCallback(async () => {
    const active = activeSpeechRef.current;
    activeSpeechRef.current = null;
    if (active?.scope.active) active.scope.end('cancelled', { reason: 'stop_requested' });
    active?.resolve?.();
    try {
      if (explicitEngineRef.current && PixelNative?.stopSpeechEngine) await PixelNative.stopSpeechEngine();
      else await Speech.stop();
      setIsSpeaking(false);
      setIsPaused(false);
      ownsSpeechRef.current = false;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not stop speech');
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

  /** Reads the native engine's current or last terminal state without inferring provider identity. */
  const getSpeechEngineStatus = useCallback((): SpeechEngineStatus | null => {
    if (!PixelNative?.getSpeechEngineStatus) return null;
    try {
      return PixelNative.getSpeechEngineStatus();
    } catch (cause) {
      logError(MODULE, 'getSpeechEngineStatus', cause);
      return null;
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
    /** Android TTS services observed on this phone, including installed package versions. */
    speechEngines,
    /** Last output identity; Gemini Live audio uses a distinct identity type and never appears as Android TTS. */
    lastSpeechIdentity,
    /** Last detailed explicit-engine terminal result with correlated callback timestamps. */
    lastSynthesis,
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
    /** Initializes and reports an explicit Android engine without speaking. */
    resolveSpeechEngineIdentity,
    /** Resolves identity before submitting a caller-supplied verification phrase. */
    verifySpeechEngine,
    stop,
    pause,
    resume,
    checkSpeaking,
    getSpeechEngineStatus,
    refreshVoices,
    refreshSpeechEngines,
    voicesForLanguage,
    /** Selects a voice by identifier; null returns to the system default. */
    setVoice,
    setRate,
    setPitch,
  };
}
