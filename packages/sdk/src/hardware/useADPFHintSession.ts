/**
 * @file useADPFHintSession.ts
 * @description `PerformanceHintManager` hint session (ADPF): the app reports how long a unit of work took
 * against a target duration for the threads in the session, and the platform may use that when
 * scheduling them. Whether and how it changes CPU frequency is up to the platform and is not observed here.
 * The session covers the app's main thread unless `threadIds` is passed. The native module keeps one
 * session per app; creating a new one closes the previous one.
 *
 * `isSupported` is true only when `createHintSession` returned a session; otherwise it is false and
 * `error` says so.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import PixelNative from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useADPFHintSession';
export const DEFAULT_TARGET_FRAME_DURATION_MS = 16.67; // 60 FPS budget default

export interface ADPFHintSessionTelemetry {
  /** Whether `createHintSession` returned a session (Android 12+). */
  isSupported: boolean;
  /** Current target frame render budget in milliseconds (e.g. 16.67ms for 60Hz, 8.33ms for 120Hz). */
  targetFrameDurationMs: number;
  /** Error message if hint session creation or reporting failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Reports the time the session's threads took for one unit of work, in nanoseconds (1ms = 1,000,000ns). True when the platform accepted the call. */
  reportWorkDuration: (actualDurationNanos: number) => boolean;
  /** Updates the target work budget in nanoseconds (e.g. dynamically switching between 60/90/120Hz). */
  updateTargetWorkDuration: (targetNanos: number) => boolean;
  /** Closes the active ADPF hint session. True when the platform closed it; `isSupported` is unchanged. */
  closeSession: () => boolean;
}

export function useADPFHintSession(
  initialTargetDurationMs: number = DEFAULT_TARGET_FRAME_DURATION_MS,
  threadIds?: number[]
): ADPFHintSessionTelemetry {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [targetFrameDurationMs, setTargetFrameDurationMs] = useState<number>(initialTargetDurationMs);
  const [error, setError] = useState<string | null>(null);
  const sessionActiveRef = useRef<boolean>(false);

  const source: TelemetrySource = PixelNative && isSupported ? 'hardware' : 'unavailable';

  const threadKey = threadIds?.join(',') ?? null;

  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      if (!PixelNative) {
        setIsSupported(false);
        setError('PixelNative module unavailable');
        return;
      }

      try {
        const targetNanos = Math.round(initialTargetDurationMs * 1_000_000);
        const tids = threadKey ? threadKey.split(',').map(Number) : undefined;
        const created = await PixelNative.createADPFHintSession(targetNanos, tids);
        if (cancelled) return;

        setIsSupported(created);
        sessionActiveRef.current = created;
        if (created) {
          logEvent(MODULE, 'created ADPF hint session', { targetMs: initialTargetDurationMs });
          recordMetric(MODULE, 'targetFrameDurationMs', initialTargetDurationMs, 'hardware');
        } else {
          setError('PerformanceHintManager returned no hint session');
        }
      } catch (e) {
        if (cancelled) return;
        setIsSupported(false);
        setError(logError(MODULE, 'createADPFHintSession failed', e).message);
      }
    };

    void initSession();

    return () => {
      cancelled = true;
      if (PixelNative && sessionActiveRef.current) {
        PixelNative.closeADPFHintSession();
        sessionActiveRef.current = false;
        logEvent(MODULE, 'closed ADPF hint session');
      }
    };
  }, [initialTargetDurationMs, threadKey]);

  const reportWorkDuration = useCallback((actualDurationNanos: number): boolean => {
    if (!PixelNative || !sessionActiveRef.current) return false;
    try {
      const ok = PixelNative.reportADPFWorkDuration(actualDurationNanos);
      if (ok) {
        recordMetric(MODULE, 'reportedWorkDurationNanos', actualDurationNanos, 'hardware');
      }
      return ok;
    } catch (e) {
      logError(MODULE, 'reportADPFWorkDuration failed', e);
      return false;
    }
  }, []);

  const updateTargetWorkDuration = useCallback((targetNanos: number): boolean => {
    if (!PixelNative || !sessionActiveRef.current) return false;
    try {
      const ok = PixelNative.updateADPFWorkDuration(targetNanos);
      if (ok) {
        const ms = targetNanos / 1_000_000;
        setTargetFrameDurationMs(Number(ms.toFixed(2)));
        logEvent(MODULE, 'updated target work duration', { targetMs: ms });
      }
      return ok;
    } catch (e) {
      logError(MODULE, 'updateADPFWorkDuration failed', e);
      return false;
    }
  }, []);

  const closeSession = useCallback((): boolean => {
    if (!PixelNative || !sessionActiveRef.current) return false;
    try {
      const ok = PixelNative.closeADPFHintSession();
      if (ok) {
        sessionActiveRef.current = false;
        logEvent(MODULE, 'manually closed ADPF hint session');
      }
      return ok;
    } catch (e) {
      logError(MODULE, 'closeADPFHintSession failed', e);
      return false;
    }
  }, []);

  return {
    isSupported,
    targetFrameDurationMs,
    error,
    source,
    reportWorkDuration,
    updateTargetWorkDuration,
    closeSession,
  };
}
