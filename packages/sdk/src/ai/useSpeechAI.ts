/**
 * @file useSpeechAI.ts
 * @description Android on-device streaming recognition, or explicitly selected cloud recording
 * and Gemini transcription. Native startup waits for recognition-service readiness; an unavailable
 * on-device recognizer never silently switches to the default/cloud recognition service.
 */

import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useAudio } from '../hardware/useAudio';
import { SpeechTranscriptionResult } from '../core/types';
import { getStoredApiKey, createGeminiClient, GEMINI_MODEL, NO_API_KEY_MESSAGE } from './geminiClient';
import {
  beginTrace,
  withTraceContextFields,
  type ObservabilityOptions,
  type TelemetrySource,
  type TraceContext,
  type TraceScope,
} from '../core/observability';
import PixelNative from '@pixelkit-labs/native';

const MODULE = 'useSpeechAI';
const SPEECH_FINAL_RESULT_TIMEOUT_MS = 15_000;
let nativeSpeechOwner: symbol | null = null;
let speechRequestSequence = 0;

export interface SpeechRecognitionRunOptions extends ObservabilityOptions {
  context: TraceContext;
}

export function useSpeechAI() {
  const audio = useAudio();
  const [recognitionMode, setRecognitionMode] = useState<'on-device' | 'cloud'>('on-device');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [streamingPartial, setStreamingPartial] = useState<string>('');
  const [lastTranscript, setLastTranscript] = useState<SpeechTranscriptionResult | null>(null);
  const [lastRecordingUri, setLastRecordingUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [voiceRms, setVoiceRms] = useState<number | null>(null);
  const [isOfflineAvailable, setIsOfflineAvailable] = useState<boolean>(false);

  /** On-device recognition being installed is what makes a transcript possible without a network. */
  const source: TelemetrySource = isOfflineAvailable ? 'hardware' : 'unavailable';

  const currentRequestIdRef = useRef<string | null>(null);
  const pendingFinalRef = useRef<{ requestId: string; promise: Promise<SpeechTranscriptionResult | null>; resolve: (result: SpeechTranscriptionResult | null) => void; timeout: ReturnType<typeof setTimeout> } | null>(null);
  const ownerRef = useRef(Symbol('speech-recognition'));
  const mountedRef = useRef(true);
  const startTimeRef = useRef<number | null>(null);
  const webRecognitionRef = useRef<any>(null);
  const webTranscriptRef = useRef<string>('');
  const currentScopeRef = useRef<TraceScope | null>(null);
  const firstSpeechResponseRef = useRef(false);

  useEffect(() => {
    if (PixelNative) {
      try {
        const avail = PixelNative.isOfflineSpeechAvailable();
        setIsOfflineAvailable(avail);
      } catch {
        setIsOfflineAvailable(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!PixelNative) return;
    const native = PixelNative;
    const s1 = PixelNative.addListener('onSpeechPartial', event => {
      const scope = currentScopeRef.current;
      if (scope?.active && event.requestId === currentRequestIdRef.current) {
        if (!firstSpeechResponseRef.current) {
          firstSpeechResponseRef.current = true;
          scope.event('first_response', { nativeRequestId: event.requestId });
        }
        setStreamingPartial(event.text);
      }
    });
    const s2 = PixelNative.addListener('onSpeechResult', event => {
      const scope = currentScopeRef.current;
      if (!scope?.active || event.requestId !== currentRequestIdRef.current) return;
      const durationSeconds = startTimeRef.current ? Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)) : 0;
      const latencyMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const result: SpeechTranscriptionResult = {
        transcript: event.text,
        confidence: null,
        durationSeconds,
        latencyMs,
        language: 'auto (on-device ASI)',
      };
      setLastTranscript(result);
      if (pendingFinalRef.current?.requestId === event.requestId) {
        clearTimeout(pendingFinalRef.current.timeout);
        pendingFinalRef.current.resolve(result);
        pendingFinalRef.current = null;
      }
      scope.metric('onDeviceLatencyMs', latencyMs);
      scope.end('ok', { nativeRequestId: event.requestId, chars: event.text.length, latencyMs });
      currentScopeRef.current = null;
      currentRequestIdRef.current = null;
      if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
      setStreamingPartial('');
      setIsListening(false);
    });
    const s3 = PixelNative.addListener('onSpeechRms', event => {
      const scope = currentScopeRef.current;
      if (scope?.active && event.requestId === currentRequestIdRef.current) setVoiceRms(event.rmsdB);
    });
    const s4 = PixelNative.addListener('onSpeechError', event => {
      const scope = currentScopeRef.current;
      if (!scope?.active || event.requestId !== currentRequestIdRef.current) return;
      setError(event.error);
      if (pendingFinalRef.current?.requestId === event.requestId) {
        clearTimeout(pendingFinalRef.current.timeout);
        pendingFinalRef.current.resolve(null);
        pendingFinalRef.current = null;
      }
      scope.end('error', { nativeRequestId: event.requestId, code: event.code }, event.error);
      currentScopeRef.current = null;
      currentRequestIdRef.current = null;
      if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
      setIsListening(false);
    });

    return () => {
      mountedRef.current = false;
      if (pendingFinalRef.current) {
        clearTimeout(pendingFinalRef.current.timeout);
        pendingFinalRef.current.resolve(null);
        pendingFinalRef.current = null;
      }
      const scope = currentScopeRef.current;
      if (scope?.active) scope.end('cancelled', { reason: 'unmounted' });
      currentScopeRef.current = null;
      currentRequestIdRef.current = null;
      if (nativeSpeechOwner === ownerRef.current) {
        nativeSpeechOwner = null;
        try { native.cancelSpeechRecognition(); } catch { /* best-effort native cancellation */ }
      }
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    };
  }, []);

  const startListening = async (run: SpeechRecognitionRunOptions): Promise<boolean> => {
    setError(null);
    setStreamingPartial('');
    const requestId = `speech_${Date.now()}_${++speechRequestSequence}`;
    const requestContext = withTraceContextFields(run.context, { nativeRequestId: requestId });
    const scope = beginTrace(MODULE, recognitionMode === 'cloud' ? 'cloud_recognition' : 'on_device_recognition', 'hardware', {
      nativeRequestId: requestId,
      mode: recognitionMode,
    }, { ...run, context: requestContext });
    currentScopeRef.current = scope;
    firstSpeechResponseRef.current = false;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';
          webTranscriptRef.current = '';
          startTimeRef.current = Date.now();
          recognition.onresult = (event: any) => {
            if (!scope.active) return;
            if (!firstSpeechResponseRef.current) {
              firstSpeechResponseRef.current = true;
              scope.event('first_response', { nativeRequestId: requestId });
            }
            let interim = '';
            let final = '';
            for (let index = event.resultIndex; index < event.results.length; index++) {
              if (event.results[index].isFinal) final += event.results[index][0].transcript;
              else interim += event.results[index][0].transcript;
            }
            if (final) webTranscriptRef.current = `${webTranscriptRef.current}${webTranscriptRef.current ? ' ' : ''}${final}`;
            setStreamingPartial(`${webTranscriptRef.current}${interim ? ` ${interim}` : ''}`.trim());
          };
          recognition.onerror = (event: any) => {
            if (!scope.active) return;
            const message = `Web Speech error: ${event.error}`;
            setError(message);
            setIsListening(false);
            scope.end('error', { nativeRequestId: requestId }, message);
            if (currentScopeRef.current === scope) currentScopeRef.current = null;
          };
          recognition.start();
          webRecognitionRef.current = recognition;
          startTimeRef.current = Date.now();
          setIsListening(true);
          scope.event('request_accepted', { nativeRequestId: requestId, provider: 'web-speech' });
          return true;
        } catch (cause: any) {
          const message = cause?.message ?? 'Could not start browser speech recognition';
          setError(message);
          setIsListening(false);
          scope.end('error', { nativeRequestId: requestId }, cause);
          currentScopeRef.current = null;
          return false;
        }
      }
    }

    if (recognitionMode === 'on-device' && !PixelNative) {
      setError('On-device speech recognition unavailable; cloud recognition was not started');
      scope.end('unavailable', { reason: 'native_recognizer_unavailable' });
      currentScopeRef.current = null;
      return false;
    }
    if (recognitionMode === 'on-device' && PixelNative) {
      const native = PixelNative;
      if (nativeSpeechOwner !== null) {
        setError('Speech recognition is already active');
        scope.end('unavailable', { reason: 'recognizer_busy' });
        currentScopeRef.current = null;
        return false;
      }
      nativeSpeechOwner = ownerRef.current;
      currentRequestIdRef.current = requestId;
      startTimeRef.current = Date.now();
      try {
        const ready = await native.startSpeechRecognition(requestId, true);
        if (!mountedRef.current || currentRequestIdRef.current !== requestId || !scope.active) return false;
        if (!ready) throw new Error('Speech recognizer did not become ready');
        setIsListening(true);
        scope.event('request_accepted', { nativeRequestId: requestId, provider: 'android-system-intelligence' });
        return true;
      } catch (cause: any) {
        if (currentRequestIdRef.current === requestId) {
          currentRequestIdRef.current = null;
          if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
          if (mountedRef.current) {
            setError(cause?.message ?? 'Failed to start on-device recognizer');
            setIsListening(false);
          }
        }
        scope.end('error', { nativeRequestId: requestId }, cause);
        if (currentScopeRef.current === scope) currentScopeRef.current = null;
        return false;
      }
    }

    const started = await audio.startRecording();
    if (started) {
      setRecordingStartedAt(Date.now());
      setIsListening(true);
      scope.event('request_accepted', { nativeRequestId: requestId, provider: 'gemini-cloud' });
    } else {
      setError('Microphone unavailable or permission denied');
      scope.end('unavailable', { reason: 'microphone_unavailable' });
      currentScopeRef.current = null;
    }
    return started;
  };

  const stopListeningAndTranscribe = async (): Promise<SpeechTranscriptionResult | null> => {
    const scope = currentScopeRef.current;
    if (Platform.OS === 'web' && webRecognitionRef.current) {
      try { webRecognitionRef.current.stop(); }
      catch (cause) { scope?.event('stop_failed', { error: String(cause) }, 'warn'); }
      webRecognitionRef.current = null;
      setIsListening(false);
      const text = (webTranscriptRef.current || streamingPartial).trim();
      const durationSeconds = startTimeRef.current ? Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)) : 0;
      const latencyMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const result: SpeechTranscriptionResult = {
        transcript: text, confidence: null, durationSeconds, latencyMs, language: 'Web Speech API',
      };
      setLastTranscript(result);
      setStreamingPartial('');
      scope?.end('ok', { chars: text.length, latencyMs });
      if (currentScopeRef.current === scope) currentScopeRef.current = null;
      return result;
    }

    if (recognitionMode === 'on-device' && PixelNative) {
      const native = PixelNative;
      if (pendingFinalRef.current) return pendingFinalRef.current.promise;
      const requestId = currentRequestIdRef.current;
      if (!requestId || !scope?.active) return null;
      let resolveFinal!: (result: SpeechTranscriptionResult | null) => void;
      const finalResult = new Promise<SpeechTranscriptionResult | null>(resolve => { resolveFinal = resolve; });
      const timeout = setTimeout(() => {
        if (pendingFinalRef.current?.requestId !== requestId || !scope.active) return;
        pendingFinalRef.current = null;
        currentRequestIdRef.current = null;
        currentScopeRef.current = null;
        if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
        setError('Speech recognition timed out waiting for a final result');
        setIsListening(false);
        scope.end('timeout', { nativeRequestId: requestId });
        try { native.cancelSpeechRecognition(); } catch { /* best-effort native cancellation */ }
        resolveFinal(null);
      }, SPEECH_FINAL_RESULT_TIMEOUT_MS);
      pendingFinalRef.current = { requestId, promise: finalResult, resolve: resolveFinal, timeout };
      try {
        await native.stopSpeechRecognition();
      } catch (cause: any) {
        if (pendingFinalRef.current?.requestId === requestId) {
          clearTimeout(pendingFinalRef.current.timeout);
          pendingFinalRef.current.resolve(null);
          pendingFinalRef.current = null;
        }
        currentRequestIdRef.current = null;
        currentScopeRef.current = null;
        if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
        setError(cause?.message ?? 'Could not stop speech recognition');
        scope.end('error', { nativeRequestId: requestId }, cause);
        try { native.cancelSpeechRecognition(); } catch { /* best-effort native cancellation */ }
      }
      setIsListening(false);
      return finalResult;
    }

    setIsListening(false);
    const uri = await audio.stopRecording();
    const durationSeconds = recordingStartedAt ? Number(((Date.now() - recordingStartedAt) / 1000).toFixed(1)) : 0;
    setRecordingStartedAt(null);
    if (!uri) {
      setError('No recording captured');
      scope?.end('unavailable', { reason: 'recording_unavailable' });
      currentScopeRef.current = null;
      return null;
    }
    setLastRecordingUri(uri);
    scope?.event('recording_completed', { durationSeconds });
    const apiKey = await getStoredApiKey();
    if (!apiKey) {
      setError(NO_API_KEY_MESSAGE);
      scope?.end('unavailable', { reason: 'gemini_api_key_unavailable' });
      currentScopeRef.current = null;
      return null;
    }

    setIsTranscribing(true);
    const started = performance.now();
    try {
      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const client = createGeminiClient(apiKey);
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcribe this speech verbatim. Return only the transcript text; if there is no speech return an empty string.' },
            { inlineData: { mimeType: 'audio/mp4', data: base64Audio } },
          ],
        }],
      });
      const transcript = (response.text ?? '').trim();
      const latencyMs = Math.round(performance.now() - started);
      const responseRecord = response as unknown as Record<string, unknown>;
      const providerRequestId = typeof responseRecord.responseId === 'string' ? responseRecord.responseId : undefined;
      const usage = responseRecord.usageMetadata;
      const result: SpeechTranscriptionResult = {
        transcript, confidence: null, durationSeconds, latencyMs, language: 'cloud Gemini',
      };
      setLastTranscript(result);
      if (scope) {
        scope.event(
          'first_response',
          { providerRequestId },
          'info',
          providerRequestId
            ? withTraceContextFields(scope.context, { providerRequestId })
            : scope.context,
        );
      }
      scope?.metric('latencyMs', latencyMs);
      scope?.end('ok', {
        chars: transcript.length,
        latencyMs,
        providerRequestId,
        finishReason: response.candidates?.[0]?.finishReason,
        ...(usage ? { usage } : {}),
      });
      currentScopeRef.current = null;
      return result;
    } catch (cause: any) {
      const message = cause?.message ?? 'transcription failed';
      setError(message);
      scope?.end('error', undefined, cause);
      currentScopeRef.current = null;
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isListening: isListening || audio.isRecording,
    isTranscribing,
    recognitionMode,
    setRecognitionMode,
    isOfflineAvailable,
    streamingPartial,
    /** Live microphone level in dBFS */
    voiceDecibels: voiceRms != null ? voiceRms : audio.meteringDecibels,
    lastTranscript,
    lastRecordingUri,
    error,
    /** Provenance of the transcript: on-device or cloud, unavailable before either is ready. */
    source,
    startListening,
    stopListeningAndTranscribe,
    model: recognitionMode === 'on-device' ? 'Android System Intelligence (On-Device)' : GEMINI_MODEL,
  };
}
