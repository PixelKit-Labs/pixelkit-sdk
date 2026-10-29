/**
 * @file usePerfetto.ts
 * @description Android system trace control and trace markers.
 * `startTrace` asks the platform for a real Perfetto system trace: through `android.os.ProfilingManager`
 * on Android 15+ (a trace of this app, delivered as a .perfetto-trace file), or by running the
 * `/system/bin/perfetto` binary when the app is allowed to execute it. When neither can start, the
 * call returns false with the reason in `error`. `stopTrace` returns a path only when the file
 * exists on disk with a non-zero size. Markers use android.os.Trace and appear in a trace only
 * while one is recording.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type PerfettoBackend, type PerfettoInfo } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { perfettoStartOutcome, perfettoStopOutcome } from '../core/perfettoTrace';

const MODULE = 'usePerfetto';

export { type PerfettoBackend, type PerfettoInfo };

export interface PerfettoState {
  /** Whether a system trace backend can be started on this device (ProfilingManager or an executable perfetto binary) */
  isSupported: boolean;
  /** Whether an active system trace session is currently recording */
  isTracing: boolean;
  /** Version parsed from `perfetto --version`; null when the app cannot execute the binary (see perfettoVersionReason) */
  perfettoVersion: string | null;
  /** Why perfettoVersion is null; null when the version was read */
  perfettoVersionReason: string | null;
  /** Which backend records traces: 'profiling_manager', 'perfetto_binary', or null when none is available */
  backend: PerfettoBackend | null;
  /** atrace categories the perfetto binary accepts; empty with the ProfilingManager backend, which chooses its own */
  availableCategories: string[];
  /** Categories the running trace was configured with; empty when the backend ignores the request */
  activeCategories: string[];
  /** Absolute path of the last saved .perfetto-trace file; set only when the file exists and is not empty */
  lastTraceUri: string | null;
  /** Size in bytes of the last saved trace file */
  lastTraceSizeBytes: number | null;
  /** Duration of the last completed trace session in milliseconds */
  traceDurationMs: number | null;
  /** Error message if tracing failed */
  error: string | null;
  /** Telemetry provenance */
  source: TelemetrySource;
  /** Start a system trace; false with `error` set when no backend could start one */
  startTrace: (categories?: string[], bufferSizeKb?: number) => Promise<boolean>;
  /** Stop the active trace; the file path, or null with `error` set when no trace file exists */
  stopTrace: () => Promise<string | null>;
  /** Emit an android.os.Trace beginSection marker */
  beginSection: (name: string) => void;
  /** Emit an android.os.Trace endSection marker */
  endSection: () => void;
  /** Emit an android.os.Trace setCounter metric */
  setCounter: (name: string, value: number) => void;
  /** Re-probe the trace backends */
  refresh: () => PerfettoInfo | null;
}

/**
 * Hook to control Android system tracing and emit trace markers.
 *
 * @example
 * ```typescript
 * const { isSupported, isTracing, startTrace, stopTrace, beginSection, endSection, error } = usePerfetto();
 *
 * const onBenchmark = async () => {
 *   if (!(await startTrace())) return; // `error` says why
 *   beginSection("MatrixMultiplication");
 *   runComputeHeavyTask();
 *   endSection();
 *   const path = await stopTrace(); // null unless a non-empty file was written
 *   console.log("Open in ui.perfetto.dev:", path);
 * };
 * ```
 */
export function usePerfetto(): PerfettoState {
  const [data, setData] = useState<PerfettoInfo | null>(null);
  const [isTracing, setIsTracing] = useState<boolean>(false);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [lastTraceUri, setLastTraceUri] = useState<string | null>(null);
  const [lastTraceSizeBytes, setLastTraceSizeBytes] = useState<number | null>(null);
  const [traceDurationMs, setTraceDurationMs] = useState<number | null>(null);
  const [traceStartMs, setTraceStartMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): PerfettoInfo | null => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; perfetto unavailable', undefined, 'warn');
      return null;
    }
    try {
      const info = PixelNative.getPerfettoInfo();
      setData(info);
      if (info.error) {
        setError(info.error);
      } else {
        setError(null);
      }
      setIsTracing(info.isTracing);
      recordMetric(MODULE, 'isSupported', info.isSupported ? 1 : 0, info.isSupported ? 'hardware' : 'unavailable');
      logEvent(MODULE, 'perfetto queried', {
        isSupported: info.isSupported,
        backend: info.backend,
        perfettoVersion: info.perfettoVersion,
        perfettoVersionReason: info.perfettoVersionReason,
        isTracing: info.isTracing,
      });
      return info;
    } catch (e) {
      const msg = logError(MODULE, 'getPerfettoInfo failed', e).message;
      setError(msg);
      return null;
    }
  }, []);

  const startTrace = useCallback(
    async (categories?: string[], bufferSizeKb?: number): Promise<boolean> => {
      if (!PixelNative) {
        setError('Native module not available');
        return false;
      }
      try {
        setError(null);
        const res = await traced(MODULE, 'startTrace', () => PixelNative!.startPerfettoTrace(categories, bufferSizeKb), {
          categories: categories?.length ?? 0,
          bufferSizeKb,
        });
        const outcome = perfettoStartOutcome(res);
        if (!outcome.started) {
          setError(outcome.error);
          logEvent(MODULE, 'trace not started', { backend: res.backend, error: outcome.error }, 'warn');
          return false;
        }
        setIsTracing(true);
        setActiveCategories(outcome.activeCategories);
        setTraceStartMs(Date.now());
        recordMetric(MODULE, 'traceStarted', 1, 'hardware');
        logEvent(MODULE, 'trace started', {
          backend: res.backend,
          categoriesApplied: res.categoriesApplied,
          requestedCategories: categories?.length ?? 0,
          bufferSizeKb,
        });
        return true;
      } catch (e) {
        setError(logError(MODULE, 'startPerfettoTrace failed', e).message);
        return false;
      }
    },
    []
  );

  const stopTrace = useCallback(async (): Promise<string | null> => {
    if (!PixelNative) {
      setError('Native module not available');
      return null;
    }
    try {
      const res = await traced(MODULE, 'stopTrace', () => PixelNative!.stopPerfettoTrace());
      const outcome = perfettoStopOutcome(res);
      setIsTracing(false);
      setActiveCategories([]);
      if (outcome.path === null) {
        setError(outcome.error);
        logEvent(MODULE, 'trace produced no file', { stopped: res.stopped, error: outcome.error }, 'warn');
        return null;
      }
      setError(null);
      setLastTraceUri(outcome.path);
      setLastTraceSizeBytes(outcome.sizeBytes);
      if (traceStartMs) {
        const dur = Date.now() - traceStartMs;
        setTraceDurationMs(dur);
        recordMetric(MODULE, 'traceDurationMs', dur, 'hardware');
      }
      recordMetric(MODULE, 'traceSizeBytes', outcome.sizeBytes, 'hardware');
      recordMetric(MODULE, 'traceStopped', 1, 'hardware');
      logEvent(MODULE, 'trace stopped', { path: outcome.path, sizeBytes: outcome.sizeBytes });
      return outcome.path;
    } catch (e) {
      setError(logError(MODULE, 'stopPerfettoTrace failed', e).message);
      return null;
    }
  }, [traceStartMs]);

  const beginSection = useCallback((name: string) => {
    if (!PixelNative) return;
    try {
      PixelNative.beginTraceSection(name);
    } catch (e) {
      // A failed marker must not crash the traced code; it is logged and counted.
      logError(MODULE, 'beginTraceSection failed', e);
    }
  }, []);

  const endSection = useCallback(() => {
    if (!PixelNative) return;
    try {
      PixelNative.endTraceSection();
    } catch (e) {
      logError(MODULE, 'endTraceSection failed', e);
    }
  }, []);

  const setCounter = useCallback((name: string, value: number) => {
    if (!PixelNative) return;
    try {
      if (!PixelNative.setTraceCounter(name, value)) {
        logEvent(MODULE, 'trace counter not emitted', { name, reason: 'platform requires Android 10 (API 29)' }, 'warn');
      }
    } catch (e) {
      logError(MODULE, 'setTraceCounter failed', e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isHardware = Boolean(PixelNative && data?.isSupported);

  return {
    isSupported: data?.isSupported ?? false,
    isTracing,
    perfettoVersion: data?.perfettoVersion ?? null,
    perfettoVersionReason: data?.perfettoVersionReason ?? null,
    backend: data?.backend ?? null,
    availableCategories: data?.availableCategories ?? [],
    activeCategories,
    lastTraceUri,
    lastTraceSizeBytes,
    traceDurationMs,
    error,
    source: isHardware ? 'hardware' : 'unavailable',
    startTrace,
    stopTrace,
    beginSection,
    endSection,
    setCounter,
    refresh,
  };
}
