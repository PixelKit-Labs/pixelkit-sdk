/**
 * @file useADPF.ts
 * @description Android Dynamic Performance Framework telemetry, all real:
 * - `PowerManager.getThermalHeadroom(0)` (0.0 cool … 1.0 severe throttling), sampled every 10 s as
 *   Google recommends (faster polling returns NaN), plus the device's status thresholds.
 * - `PowerManager` thermal status via a live listener (NONE…SHUTDOWN).
 * - Android 16+ `SystemHealthManager` CPU/GPU available-capacity estimates and reasons when absent.
 * - Display refresh rate as the FPS target and Choreographer-measured FPS as the current value.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type ThermalInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, traced, type TelemetrySource, noteExpected } from '../core/observability';
import type { PerformanceHeadroom } from '../core/types';

const MODULE = 'useADPF';
const HEADROOM_POLL_MS = 10_000;

/** Android PowerManager.THERMAL_STATUS_* → PixelKit label */
export function thermalStatusLabel(status: number): PerformanceHeadroom['thermalStatus'] {
  switch (status) {
    case 0: return 'nominal';
    case 1: return 'light';
    case 2: return 'moderate';
    case 3: return 'severe';
    default: return 'critical'; // 4 critical, 5 emergency, 6 shutdown
  }
}

/**
 * Hook exposing ADPF thermal and headroom telemetry.
 *
 * @example
 * ```typescript
 * const { thermalHeadroom, thermalStatus, cpuHeadroom, currentFps, targetFps } = useADPF();
 * if (thermalStatus !== 'nominal') reduceWorkload();
 * ```
 */
export function useADPF() {
  const [thermal, setThermal] = useState<ThermalInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number>(0);
  const [currentFps, setCurrentFps] = useState<number | null>(null);
  const [targetFps, setTargetFps] = useState<number | null>(null);

  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    const native = PixelNative;
    if (!native) { logEvent(MODULE, 'native module absent; ADPF telemetry unavailable', undefined, 'warn'); return; }
    let active = true;
    const readThermal = () => {
      void traced(MODULE, 'getThermal', () => native.getThermal()).then(t => {
        if (!active) return;
        setThermal(t);
        setStatus(t.thermalStatus);
        setError(null);
        recordMetric(MODULE, 'thermalHeadroom', t.thermalHeadroom, t.thermalHeadroom == null ? 'unavailable' : 'hardware');
        recordMetric(MODULE, 'cpuHeadroom', t.cpuHeadroom, t.cpuHeadroom == null ? 'unavailable' : 'hardware');
        recordMetric(MODULE, 'gpuHeadroom', t.gpuHeadroom, t.gpuHeadroom == null ? 'unavailable' : 'hardware');
      }).catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    };
    readThermal();
    void traced(MODULE, 'getDisplayInfo', () => native.getDisplayInfo()).then(info => {
      if (active) setTargetFps(Math.round(info.refreshRate));
    }).catch(() => noteExpected(MODULE, 'display info unavailable; useDisplay owns it'));
    const t = setInterval(readThermal, HEADROOM_POLL_MS);
    const s1 = native.addListener('onThermalStatus', e => {
      setStatus(e.status);
      logEvent(MODULE, 'thermal status changed', { status: e.status, label: thermalStatusLabel(e.status) }, e.status >= 3 ? 'warn' : 'info');
    });
    const s2 = native.addListener('onFrameStats', f => {
      setCurrentFps(Math.round(f.fps));
      setTargetFps(Math.round(1000 / f.expectedFrameMs));
    });
    return () => { active = false; clearInterval(t); s1.remove(); s2.remove(); };
  }, []);

  /** Compare a measured work duration against the frame budget. Pure helper. */
  const reportWorkDuration = useCallback((actualWorkDurationMs: number, targetDurationMs: number = targetFps ? 1000 / targetFps : 8.33): 'WITHIN_BUDGET' | 'BOOST_REQUESTED' =>
    actualWorkDurationMs / targetDurationMs > 1.0 ? 'BOOST_REQUESTED' : 'WITHIN_BUDGET', [targetFps]);
  const beforeSampleReason: PerformanceHeadroom['cpuHeadroomUnavailableReason'] =
    PixelNative ? (error ? 'read_failed' : 'not_sampled') : 'api_unavailable';

  return {
    /** 0.0 (cool) → 1.0 (severe throttling), from PowerManager.getThermalHeadroom */
    thermalHeadroom: thermal?.thermalHeadroom ?? null,
    /** Device-specific headroom values at which each status begins (keys = status codes) */
    thermalThresholds: thermal?.thresholds ?? null,
    thermalStatus: thermalStatusLabel(status),
    thermalStatusCode: status,
    /** Android 16+ SystemHealthManager CPU available capacity (0..1), not thermal headroom or utilization */
    cpuHeadroom: thermal?.cpuHeadroom ?? null,
    gpuHeadroom: thermal?.gpuHeadroom ?? null,
    cpuHeadroomUnavailableReason: thermal ? thermal.cpuHeadroomUnavailableReason : beforeSampleReason,
    gpuHeadroomUnavailableReason: thermal ? thermal.gpuHeadroomUnavailableReason : beforeSampleReason,
    /** Display mode refresh rate (Hz) */
    targetFps,
    /** Choreographer-measured frames per second */
    currentFps,
    reportWorkDuration,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Telemetry provenance */
    source,
  };
}
