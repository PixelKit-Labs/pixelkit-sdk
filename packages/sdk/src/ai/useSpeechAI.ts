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
import { logEvent, recordMetric, traced, type TelemetrySource } from '../core/observability';
import PixelNative from '@pixelkit-labs/native';

const MODULE = 'useSpeechAI';
const SPEECH_FINAL_RESULT_TIMEOUT_MS = 15_000;
let nativeSpeechOwner: symbol | null = null;
let speechRequestSequence = 0;

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
    const s1 = PixelNative.addListener('onSpeechPartial', e => {
      if (e.requestId === currentRequestIdRef.current) {
        setStreamingPartial(e.text);
      }
    });
    const s2 = PixelNative.addListener('onSpeechResult', e => {
      if (e.requestId === currentRequestIdRef.current) {
        const durationSeconds = startTimeRef.current ? Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)) : 0;
        const latencyMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
        const result: SpeechTranscriptionResult = {
          transcript: e.text,
          confidence: null,
          durationSeconds,
          latencyMs,
          language: 'auto (on-device ASI)',
        };
        setLastTranscript(result);
        if (pendingFinalRef.current?.requestId === e.requestId) {
          clearTimeout(pendingFinalRef.current.timeout);
          pendingFinalRef.current.resolve(result);
          pendingFinalRef.current = null;
        }
        currentRequestIdRef.current = null;
        if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
        setStreamingPartial('');
        setIsListening(false);
        recordMetric(MODULE, 'onDeviceLatencyMs', latencyMs, 'hardware');
        logEvent(MODULE, 'onDeviceResult', { chars: e.text.length, latencyMs });
      }
    });
    const s3 = PixelNative.addListener('onSpeechRms', e => {
      if (e.requestId === currentRequestIdRef.current) {
        setVoiceRms(e.rmsdB);
      }
    });
    const s4 = PixelNative.addListener('onSpeechError', e => {
      if (e.requestId === currentRequestIdRef.current) {
        setError(e.error);
        if (pendingFinalRef.current?.requestId === e.requestId) {
          clearTimeout(pendingFinalRef.current.timeout);
          pendingFinalRef.current.resolve(null);
          pendingFinalRef.current = null;
        }
        currentRequestIdRef.current = null;
        if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
        setIsListening(false);
        logEvent(MODULE, 'speechError', { error: e.error, code: e.code }, 'warn');
      }
    });

    return () => {
      mountedRef.current = false;
      if (pendingFinalRef.current) {
        clearTimeout(pendingFinalRef.current.timeout);
        pendingFinalRef.current.resolve(null);
        pendingFinalRef.current = null;
      }
      currentRequestIdRef.current = null;
      if (nativeSpeechOwner === ownerRef.current) {
        nativeSpeechOwner = null;
        void traced(MODULE, 'cancelSpeechRecognition', async () => native.cancelSpeechRecognition())
          .catch((e: any) => logEvent(MODULE, 'recognizer cleanup failed', { message: e?.message }, 'warn'));
      }
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    };
  }, []);

  const startListening = async (): Promise<boolean> => {
    setError(null);
    setStreamingPartial('');

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
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            if (final) {
              webTranscriptRef.current = (webTranscriptRef.current ? webTranscriptRef.current + ' ' : '') + final;
            }
            const currentFull = (webTranscriptRef.current + (interim ? ' ' + interim : '')).trim();
            setStreamingPartial(currentFull);
          };

          recognition.onerror = (event: any) => {
            setError(`Web Speech error: ${event.error}`);
            setIsListening(false);
          };

          recognition.onend = () => {
            // Native speech recognition session ended
          };

          recognition.start();
          webRecognitionRef.current = recognition;
          setIsListening(true);
          logEvent(MODULE, 'startWebSpeech');
          return true;
        } catch (e: any) {
          setError(e?.message ?? 'Could not start browser speech recognition');
          setIsListening(false);
          return false;
        }
      }
    }

    if (recognitionMode === 'on-device' && !PixelNative) {
      setError('On-device speech recognition unavailable; cloud recognition was not started');
      return false;
    }
    if (recognitionMode === 'on-device' && PixelNative) {
      const native = PixelNative;
      if (nativeSpeechOwner !== null) {
        setError('Speech recognition is already active');
        return false;
      }
      nativeSpeechOwner = ownerRef.current;
      const reqId = `speech_${Date.now()}_${++speechRequestSequence}`;
      currentRequestIdRef.current = reqId;
      startTimeRef.current = Date.now();
      try {
        const ready = await traced(MODULE, 'startSpeechRecognition', async () => native.startSpeechRecognition(reqId, true), { reqId });
        if (!mountedRef.current || currentRequestIdRef.current !== reqId) return false;
        if (!ready) throw new Error('Speech recognizer did not become ready');
        setIsListening(true);
        logEvent(MODULE, 'startOnDeviceSpeech', { reqId });
        return true;
      } catch (e: any) {
        if (currentRequestIdRef.current === reqId) {
          currentRequestIdRef.current = null;
          if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
          if (mountedRef.current) {
            setError(e?.message ?? 'Failed to start on-device recognizer');
            setIsListening(false);
            logEvent(MODULE, 'speech startup failed', { message: e?.message, code: e?.code }, 'warn');
          }
        }
        return false;
      }
    } else {
      // Cloud recording mode
      const ok = await audio.startRecording();
      if (ok) {
        setRecordingStartedAt(Date.now());
        setIsListening(true);
      } else {
        setError('Microphone unavailable or permission denied');
      }
      return ok;
    }
  };

  const stopListeningAndTranscribe = async (): Promise<SpeechTranscriptionResult | null> => {
    if (Platform.OS === 'web' && webRecognitionRef.current) {
      try {
        webRecognitionRef.current.stop();
      } catch {}
      webRecognitionRef.current = null;
      setIsListening(false);
      const text = (webTranscriptRef.current || streamingPartial).trim();
      const durationSeconds = startTimeRef.current ? Number(((Date.now() - startTimeRef.current) / 1000).toFixed(1)) : 0;
      const latencyMs = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
      const result: SpeechTranscriptionResult = {
        transcript: text,
        confidence: null,
        durationSeconds,
        latencyMs,
        language: 'Web Speech API',
      };
      setLastTranscript(result);
      setStreamingPartial('');
      logEvent(MODULE, 'webSpeechResult', { chars: text.length, latencyMs });
      return result;
    }

    if (recognitionMode === 'on-device' && PixelNative) {
      const native = PixelNative;
      if (pendingFinalRef.current) return pendingFinalRef.current.promise;
      const requestId = currentRequestIdRef.current;
      if (!requestId) return null;
      let resolveFinal!: (result: SpeechTranscriptionResult | null) => void;
      const finalResult = new Promise<SpeechTranscriptionResult | null>(resolve => { resolveFinal = resolve; });
      const timeout = setTimeout(() => {
          if (pendingFinalRef.current?.requestId !== requestId) return;
          pendingFinalRef.current = null;
          currentRequestIdRef.current = null;
          if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
          setError('Speech recognition timed out waiting for a final result');
          setIsListening(false);
          logEvent(MODULE, 'speech final result timed out', { requestId }, 'warn');
          void traced(MODULE, 'cancelSpeechRecognition', async () => native.cancelSpeechRecognition())
            .catch((e: any) => logEvent(MODULE, 'recognizer cleanup failed', { message: e?.message }, 'warn'));
          resolveFinal(null);
      }, SPEECH_FINAL_RESULT_TIMEOUT_MS);
      pendingFinalRef.current = { requestId, promise: finalResult, resolve: resolveFinal, timeout };
      try {
        await traced(MODULE, 'stopSpeechRecognition', async () => native.stopSpeechRecognition(), { requestId });
      } catch (e: any) {
        if (pendingFinalRef.current?.requestId === requestId) {
          clearTimeout(pendingFinalRef.current.timeout);
          pendingFinalRef.current.resolve(null);
          pendingFinalRef.current = null;
        }
        currentRequestIdRef.current = null;
        if (nativeSpeechOwner === ownerRef.current) nativeSpeechOwner = null;
        setError(e?.message ?? 'Could not stop speech recognition');
        logEvent(MODULE, 'speech stop failed', { message: e?.message }, 'warn');
        void traced(MODULE, 'cancelSpeechRecognition', async () => native.cancelSpeechRecognition())
          .catch((cancelError: any) => logEvent(MODULE, 'recognizer cleanup failed', { message: cancelError?.message }, 'warn'));
      }
      setIsListening(false);
      return finalResult;
    }

    // Cloud mode: stop recording and send to Gemini
    setIsListening(false);
    const uri = await audio.stopRecording();
    const durationSeconds = recordingStartedAt ? Number(((Date.now() - recordingStartedAt) / 1000).toFixed(1)) : 0;
    setRecordingStartedAt(null);
    if (!uri) { setError('No recording captured'); return null; }
    setLastRecordingUri(uri);
    logEvent(MODULE, 'recorded', { uri, durationSeconds });

    const apiKey = await getStoredApiKey();
    if (!apiKey) { setError(NO_API_KEY_MESSAGE); return null; }

    setIsTranscribing(true);
    const start = performance.now();
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
      const latencyMs = Math.round(performance.now() - start);
      const result: SpeechTranscriptionResult = {
        transcript,
        confidence: null,
        durationSeconds,
        latencyMs,
        language: 'cloud Gemini',
      };
      setLastTranscript(result);
      recordMetric(MODULE, 'latencyMs', latencyMs, 'hardware');
      logEvent(MODULE, 'transcribed', { chars: transcript.length, latencyMs });
      return result;
    } catch (e: any) {
      const message = e?.message ?? 'transcription failed';
      setError(message);
      logEvent(MODULE, 'error', { message }, 'error');
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
