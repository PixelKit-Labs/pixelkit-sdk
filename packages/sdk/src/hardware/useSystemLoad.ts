/**
 * @file useSystemLoad.ts
 * @description Whole-system CPU, GPU and TPU load from kernel counters Android denies to apps.
 *
 * `/proc/stat`, the `power/gpu_work_period` tracepoint, `dumpsys gpu` and the Edge TPU trace events
 * are readable only by the adb shell user (uid 2000). The PixelKit system-metrics daemon
 * (`scripts/system-metrics-daemon`) runs as that user and serves rolling-window measurements as JSON
 * on 127.0.0.1:11081; this hook polls it every 2 s. It follows the same split as `useHiLight`:
 *
 * 1. Daemon running: values are the kernel's own counters (source 'hardware', or 'derived' where the
 *    daemon sums raw trace events).
 * 2. No daemon, or a section the daemon could not read: the values are null and the reason is in
 *    `error` / `cpuError` / `gpuError` / `tpuError`. Nothing is estimated or defaulted.
 *
 * TPU utilisation is reported only when the daemon decoded real `edgetpu` command events; otherwise
 * `tpuSource` is 'unavailable' with the reason.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logError, logEvent, recordMetric, type TelemetrySource } from '../core/observability';
import {
  SYSTEM_METRICS_URL,
  daemonUnreachableReason,
  deriveSystemLoad,
  parseSystemMetrics,
  unavailableSystemLoad,
  type GpuProcessLoad,
  type SystemLoadValues,
  type SystemMetrics,
} from '../core/systemMetrics';

export { parseSystemMetrics, SystemMetricsParseError } from '../core/systemMetrics';
export type { SystemMetrics, CpuMetrics, GpuMetrics, GpuProcessLoad, TpuMetrics } from '../core/systemMetrics';

const MODULE = 'useSystemLoad';
const POLL_MS = 2000;
const FETCH_TIMEOUT_MS = 800;

export interface SystemLoadState {
  /** True when the daemon answered the last poll with a parseable response. */
  isDaemonConnected: boolean;
  /** Length of the measurement window the percentages refer to, ms. Null without a current sample. */
  windowMs: number | null;
  /** Daemon wall-clock time (epoch ms) the current window completed. Null without a sample. */
  sampledAtMs: number | null;
  /** Daemon version string, null until it answers. */
  daemonVersion: string | null;
  /** Whole-system CPU use, 0 to 100, from `/proc/stat` jiffies (iowait counted as idle). */
  cpuUtilizationPercent: number | null;
  /** Per-core use, 0 to 100, in `cpuN` order; an entry is null when that core had no jiffies in the window. */
  cpuPerCorePercent: (number | null)[];
  cpuSource: TelemetrySource;
  /** Why the CPU values are null, or null when they were read. */
  cpuError: string | null;
  /** GPU active time over the window, 0 to 100, from `power/gpu_work_period` summed over all uids. */
  gpuUtilizationPercent: number | null;
  /** Current GPU clock in Hz. */
  gpuFrequencyHz: number | null;
  /** System-wide GPU memory in MiB from `dumpsys gpu`. */
  gpuMemoryUsedMB: number | null;
  /** Uids keeping the GPU busiest in the window, highest first. */
  gpuTopProcesses: GpuProcessLoad[];
  gpuSource: TelemetrySource;
  /** Why GPU values are null, or null when they were read. */
  gpuError: string | null;
  /** Edge TPU busy share, 0 to 100. Null unless the daemon decoded real edgetpu command events. */
  tpuUtilizationPercent: number | null;
  /** Edge TPU power state from `edgetpu_power_state` events. */
  tpuPowerState: string | null;
  tpuSource: TelemetrySource;
  /** Why TPU values are null, or null when they were read. */
  tpuError: string | null;
  /** Latest failure or the reason no current data is returned, or null. Failures are also logged and counted. */
  error: string | null;
  /** 'hardware'/'derived' while the daemon supplies at least one section; 'unavailable' otherwise. */
  source: TelemetrySource;
}

const INITIAL: SystemLoadState = unavailableSystemLoad('system metrics daemon has not been polled yet');

/** One poll. Throws with the reason when the daemon is unreachable or answers with something invalid. */
async function fetchSystemMetrics(): Promise<SystemMetrics> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SYSTEM_METRICS_URL}/metrics`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseSystemMetrics(await res.json());
  } finally {
    clearTimeout(timeoutId);
  }
}

function recordSectionMetrics(v: SystemLoadValues): void {
  recordMetric(MODULE, 'cpuUtilizationPercent', v.cpuUtilizationPercent, v.cpuSource);
  recordMetric(MODULE, 'gpuUtilizationPercent', v.gpuUtilizationPercent, v.gpuSource);
  recordMetric(MODULE, 'gpuFrequencyHz', v.gpuFrequencyHz, v.gpuSource);
  recordMetric(MODULE, 'gpuMemoryUsedMB', v.gpuMemoryUsedMB, v.gpuSource);
  recordMetric(MODULE, 'tpuUtilizationPercent', v.tpuUtilizationPercent, v.tpuSource);
}

/**
 * Whole-system CPU, GPU and TPU load from the PixelKit system-metrics daemon.
 *
 * @example
 * ```typescript
 * const { cpuUtilizationPercent, gpuUtilizationPercent, tpuSource, error } = useSystemLoad();
 * // null + error text while the daemon is not running; never a default value
 * ```
 */
export function useSystemLoad(): SystemLoadState {
  const [state, setState] = useState<SystemLoadState>(INITIAL);
  // Last failure text already logged: the poll repeats every 2 s and a steady failure is one event.
  const lastLoggedError = useRef<string | null>(null);
  const connected = useRef<boolean | null>(null);

  const poll = useCallback(async () => {
    let values: SystemLoadValues;
    try {
      values = deriveSystemLoad(await fetchSystemMetrics(), Date.now());
    } catch (e) {
      const detail = e instanceof Error && e.name === 'AbortError' ? `no answer within ${FETCH_TIMEOUT_MS} ms` : e instanceof Error ? e.message : String(e);
      const reason = daemonUnreachableReason(detail);
      values = unavailableSystemLoad(reason);
      // A parse error means a daemon answered with an unexpected shape: that is a defect, not an absent daemon.
      if (e instanceof Error && e.name === 'SystemMetricsParseError') {
        values = { ...values, isDaemonConnected: true, error: e.message, cpuError: e.message, gpuError: e.message, tpuError: e.message };
      }
    }

    if (connected.current !== values.isDaemonConnected) {
      connected.current = values.isDaemonConnected;
      logEvent(MODULE, values.isDaemonConnected ? 'daemon connected' : 'daemon lost', values.error ? { reason: values.error } : undefined, values.isDaemonConnected ? 'info' : 'warn');
    }
    if (values.error !== lastLoggedError.current) {
      lastLoggedError.current = values.error;
      if (values.error && values.isDaemonConnected) logError(MODULE, 'daemon response unusable', new Error(values.error));
    }
    recordSectionMetrics(values);
    setState(values);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => { if (!cancelled) void poll(); };
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll]);

  return state;
}
