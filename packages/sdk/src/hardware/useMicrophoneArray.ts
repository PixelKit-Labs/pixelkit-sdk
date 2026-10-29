/**
 * @file useMicrophoneArray.ts
 * @description Microphone inventory read from `AudioManager.getMicrophones()`: id, description,
 * type, directionality, location, group, position and orientation of each microphone the platform
 * lists. The hook does not steer or focus the array: `MediaRecorder` and `AudioRecord` take a
 * preferred direction per recorder instance, and this hook owns no recorder.
 *
 * Zero-Simulation Principle: the list is empty and source is 'unavailable' if the platform lists no
 * microphones (Android below 9) or the native module is absent.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, { type MicrophoneInfo } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useMicrophoneArray';

export interface MicrophoneArrayTelemetry {
  /** Microphones the platform lists for this device. */
  microphones: MicrophoneInfo[];
  /** Whether the platform can list microphones (Android 9+). */
  isSupported: boolean;
  /** Error message if the microphone query failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Re-queries the platform microphone list. */
  refresh: () => void;
}

export function useMicrophoneArray(): MicrophoneArrayTelemetry {
  const [microphones, setMicrophones] = useState<MicrophoneInfo[]>([]);
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = PixelNative && isSupported ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setIsSupported(false);
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getMicrophoneArray();
      setIsSupported(res.isSupported);
      setMicrophones(res.microphones ?? []);
      setError(res.error ?? null);

      recordMetric(MODULE, 'microphoneCount', res.microphones?.length ?? 0, 'hardware');
      logEvent(MODULE, 'queried microphone array', {
        count: res.microphones?.length ?? 0,
      });
    } catch (e) {
      const err = logError(MODULE, 'getMicrophoneArray failed', e);
      setError(err.message);
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    microphones,
    isSupported,
    error,
    source,
    refresh,
  };
}
