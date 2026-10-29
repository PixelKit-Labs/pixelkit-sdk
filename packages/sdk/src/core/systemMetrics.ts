/**
 * @file systemMetrics.ts
 * @description Pure validation and derivation for the PixelKit system-metrics daemon.
 *
 * Android denies apps `/proc/stat`, `/proc/pressure/*` and the GPU/TPU tracefs events. The daemon in
 * `scripts/system-metrics-daemon` runs as the adb shell user (uid 2000), reads those kernel counters
 * and serves them as JSON on 127.0.0.1:11081. This module holds no I/O: `parseSystemMetrics` checks
 * that a response has the documented shape and throws, naming the offending field, when it does not;
 * `deriveSystemLoad` maps a parsed response (or the lack of one) to the values a hook returns.
 *
 * Nothing here substitutes a default. A section the daemon marks unavailable, a daemon that is not
 * running and a response too old to trust all produce null values and a stated reason.
 */

import type { TelemetrySource } from './observability';

/** Where the daemon listens. Loopback only; the daemon binds 127.0.0.1. */
export const SYSTEM_METRICS_URL = 'http://127.0.0.1:11081';

/** A response older than this is treated as a stalled sampler, not as a current reading. */
export const MAX_SYSTEM_METRICS_AGE_MS = 10_000;

export type SystemMetricsSectionSource = 'hardware' | 'derived' | 'unavailable';

export interface CpuMetrics {
  source: 'hardware' | 'unavailable';
  error: string | null;
  /** Non-idle jiffies / total jiffies over the window, from `/proc/stat`. iowait counts as idle. */
  utilizationPercent: number | null;
  /** One entry per `cpuN` line of `/proc/stat`; null for a core with no jiffies in the window. */
  perCorePercent: (number | null)[];
}

export interface GpuProcessLoad {
  uid: number;
  /** Share of the window this uid kept the GPU active, 0 to 100. */
  activePercent: number;
}

export interface GpuMetrics {
  source: SystemMetricsSectionSource;
  error: string | null;
  /** Sum of `total_active_duration_ns` over all uids in `power/gpu_work_period` / window length. */
  utilizationPercent: number | null;
  /** Latest `power/gpu_frequency` event or devfreq `cur_freq`. */
  frequencyHz: number | null;
  /** `Global total` from `dumpsys gpu`. */
  memoryUsedBytes: number | null;
  topProcesses: GpuProcessLoad[];
}

export interface TpuMetrics {
  source: 'hardware' | 'unavailable';
  error: string | null;
  /** Busy fraction from decoded `edgetpu_*_command_start/end` events; null unless real events were observed. */
  utilizationPercent: number | null;
  powerState: string | null;
}

export interface SystemMetrics {
  version: string;
  /** Uid the daemon runs as; 2000 (shell) when started through adb. */
  uid: number;
  /** Daemon wall clock, epoch milliseconds, when the window completed. */
  sampledAtMs: number;
  /** Length of the measurement window every percentage refers to. */
  windowMs: number;
  cpu: CpuMetrics;
  gpu: GpuMetrics;
  tpu: TpuMetrics;
}

/** Thrown by `parseSystemMetrics`; `field` is the dotted path of the offending value. */
export class SystemMetricsParseError extends Error {
  readonly field: string;
  constructor(field: string, problem: string) {
    super(`system metrics: invalid field "${field}": ${problem}`);
    this.name = 'SystemMetricsParseError';
    this.field = field;
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value === 'number' && !Number.isFinite(value) ? String(value) : typeof value;
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new SystemMetricsParseError(field, `expected an object, got ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SystemMetricsParseError(field, `expected a non-empty string, got ${describe(value)}`);
  }
  return value;
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new SystemMetricsParseError(field, `expected a string or null, got ${describe(value)}`);
  }
  return value;
}

function asNumber(value: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SystemMetricsParseError(field, `expected a finite number, got ${describe(value)}`);
  }
  if (value < min || value > max) {
    throw new SystemMetricsParseError(field, `${value} is outside ${min}..${max}`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new SystemMetricsParseError(field, `expected an integer, got ${value}`);
  }
  return value;
}

function asNullableNumber(value: unknown, field: string, min: number, max: number): number | null {
  return value === null ? null : asNumber(value, field, min, max);
}

const PERCENT_MAX = 100;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function asSource<T extends SystemMetricsSectionSource>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new SystemMetricsParseError(field, `expected one of ${allowed.join(' | ')}, got ${typeof value === 'string' ? JSON.stringify(value) : describe(value)}`);
  }
  return value as T;
}

/** An unavailable section must say why, and must not carry a measured value. */
function requireReasonWhenUnavailable(source: string, error: string | null, section: string): void {
  if (source === 'unavailable' && (error === null || error.length === 0)) {
    throw new SystemMetricsParseError(`${section}.error`, 'a section with source "unavailable" must state its reason');
  }
}

function requireNullWhenUnavailable(source: string, value: unknown, field: string): void {
  if (source === 'unavailable' && value !== null) {
    throw new SystemMetricsParseError(field, 'must be null when the section source is "unavailable"');
  }
}

function parseCpu(raw: unknown): CpuMetrics {
  const o = asObject(raw, 'cpu');
  const source = asSource(o.source, 'cpu.source', ['hardware', 'unavailable'] as const);
  const error = asNullableString(o.error, 'cpu.error');
  const utilizationPercent = asNullableNumber(o.utilizationPercent, 'cpu.utilizationPercent', 0, PERCENT_MAX);
  if (!Array.isArray(o.perCorePercent)) {
    throw new SystemMetricsParseError('cpu.perCorePercent', `expected an array, got ${describe(o.perCorePercent)}`);
  }
  const perCorePercent = o.perCorePercent.map((v, i) => asNullableNumber(v, `cpu.perCorePercent[${i}]`, 0, PERCENT_MAX));
  requireReasonWhenUnavailable(source, error, 'cpu');
  requireNullWhenUnavailable(source, utilizationPercent, 'cpu.utilizationPercent');
  if (source === 'unavailable' && perCorePercent.some(v => v !== null)) {
    throw new SystemMetricsParseError('cpu.perCorePercent', 'entries must be null when the section source is "unavailable"');
  }
  if (source === 'hardware' && utilizationPercent === null) {
    throw new SystemMetricsParseError('cpu.utilizationPercent', 'must be a number when the section source is "hardware"');
  }
  return { source, error, utilizationPercent, perCorePercent };
}

function parseGpu(raw: unknown): GpuMetrics {
  const o = asObject(raw, 'gpu');
  const source = asSource(o.source, 'gpu.source', ['hardware', 'derived', 'unavailable'] as const);
  const error = asNullableString(o.error, 'gpu.error');
  const utilizationPercent = asNullableNumber(o.utilizationPercent, 'gpu.utilizationPercent', 0, PERCENT_MAX);
  const frequencyHz = asNullableNumber(o.frequencyHz, 'gpu.frequencyHz', 0, MAX_SAFE);
  const memoryUsedBytes = asNullableNumber(o.memoryUsedBytes, 'gpu.memoryUsedBytes', 0, MAX_SAFE);
  if (!Array.isArray(o.topProcesses)) {
    throw new SystemMetricsParseError('gpu.topProcesses', `expected an array, got ${describe(o.topProcesses)}`);
  }
  const topProcesses = o.topProcesses.map((p, i) => {
    const po = asObject(p, `gpu.topProcesses[${i}]`);
    return {
      uid: asNumber(po.uid, `gpu.topProcesses[${i}].uid`, 0, 2_147_483_647, true),
      activePercent: asNumber(po.activePercent, `gpu.topProcesses[${i}].activePercent`, 0, PERCENT_MAX),
    };
  });
  requireReasonWhenUnavailable(source, error, 'gpu');
  requireNullWhenUnavailable(source, utilizationPercent, 'gpu.utilizationPercent');
  requireNullWhenUnavailable(source, frequencyHz, 'gpu.frequencyHz');
  requireNullWhenUnavailable(source, memoryUsedBytes, 'gpu.memoryUsedBytes');
  if (source === 'unavailable' && topProcesses.length > 0) {
    throw new SystemMetricsParseError('gpu.topProcesses', 'must be empty when the section source is "unavailable"');
  }
  return { source, error, utilizationPercent, frequencyHz, memoryUsedBytes, topProcesses };
}

function parseTpu(raw: unknown): TpuMetrics {
  const o = asObject(raw, 'tpu');
  const source = asSource(o.source, 'tpu.source', ['hardware', 'unavailable'] as const);
  const error = asNullableString(o.error, 'tpu.error');
  const utilizationPercent = asNullableNumber(o.utilizationPercent, 'tpu.utilizationPercent', 0, PERCENT_MAX);
  const powerState = asNullableString(o.powerState, 'tpu.powerState');
  requireReasonWhenUnavailable(source, error, 'tpu');
  requireNullWhenUnavailable(source, utilizationPercent, 'tpu.utilizationPercent');
  requireNullWhenUnavailable(source, powerState, 'tpu.powerState');
  if (source === 'hardware' && utilizationPercent === null) {
    throw new SystemMetricsParseError('tpu.utilizationPercent', 'must be a number when the section source is "hardware"');
  }
  return { source, error, utilizationPercent, powerState };
}

/**
 * Validates a `/metrics` response from the daemon and returns it typed.
 * Throws `SystemMetricsParseError` naming the first offending field. Unknown extra fields are ignored.
 */
export function parseSystemMetrics(json: unknown): SystemMetrics {
  const o = asObject(json, '$');
  return {
    version: asString(o.version, 'version'),
    uid: asNumber(o.uid, 'uid', 0, 2_147_483_647, true),
    sampledAtMs: asNumber(o.sampledAtMs, 'sampledAtMs', 0, MAX_SAFE),
    windowMs: asNumber(o.windowMs, 'windowMs', 1, MAX_SAFE),
    cpu: parseCpu(o.cpu),
    gpu: parseGpu(o.gpu),
    tpu: parseTpu(o.tpu),
  };
}

/** Values `useSystemLoad` returns, derived from one daemon response or from its absence. */
export interface SystemLoadValues {
  isDaemonConnected: boolean;
  windowMs: number | null;
  sampledAtMs: number | null;
  daemonVersion: string | null;
  cpuUtilizationPercent: number | null;
  cpuPerCorePercent: (number | null)[];
  cpuSource: TelemetrySource;
  cpuError: string | null;
  gpuUtilizationPercent: number | null;
  gpuFrequencyHz: number | null;
  gpuMemoryUsedMB: number | null;
  gpuTopProcesses: GpuProcessLoad[];
  gpuSource: TelemetrySource;
  gpuError: string | null;
  tpuUtilizationPercent: number | null;
  tpuPowerState: string | null;
  tpuSource: TelemetrySource;
  tpuError: string | null;
  /** Why no (or stale) data is being returned, or null when the daemon answered with a current sample. */
  error: string | null;
  source: TelemetrySource;
}

const NOT_RUNNING_HINT =
  'build and start it from the SDK repository: powershell -File scripts/system-metrics-daemon/build.ps1, then powershell -File scripts/system-metrics-daemon/run.ps1';

/** Values with the daemon absent: everything null, `reason` stated on the hook and on every section. */
export function unavailableSystemLoad(reason: string): SystemLoadValues {
  return {
    isDaemonConnected: false,
    windowMs: null,
    sampledAtMs: null,
    daemonVersion: null,
    cpuUtilizationPercent: null,
    cpuPerCorePercent: [],
    cpuSource: 'unavailable',
    cpuError: reason,
    gpuUtilizationPercent: null,
    gpuFrequencyHz: null,
    gpuMemoryUsedMB: null,
    gpuTopProcesses: [],
    gpuSource: 'unavailable',
    gpuError: reason,
    tpuUtilizationPercent: null,
    tpuPowerState: null,
    tpuSource: 'unavailable',
    tpuError: reason,
    error: reason,
    source: 'unavailable',
  };
}

/** Reason string for a daemon that did not answer. */
export function daemonUnreachableReason(detail: string): string {
  return `system metrics daemon not reachable at ${SYSTEM_METRICS_URL} (${detail}); ${NOT_RUNNING_HINT}`;
}

/**
 * Maps a parsed response to hook values. A response older than `MAX_SYSTEM_METRICS_AGE_MS` is a
 * stalled sampler: its numbers describe the past, so they are withheld rather than shown as current.
 */
export function deriveSystemLoad(metrics: SystemMetrics, nowMs: number): SystemLoadValues {
  const ageMs = nowMs - metrics.sampledAtMs;
  if (ageMs > MAX_SYSTEM_METRICS_AGE_MS) {
    const reason = `system metrics daemon answered but its latest sample is ${Math.round(ageMs / 1000)} s old (limit ${MAX_SYSTEM_METRICS_AGE_MS / 1000} s); the sampler has stalled`;
    return { ...unavailableSystemLoad(reason), isDaemonConnected: true, daemonVersion: metrics.version, sampledAtMs: metrics.sampledAtMs, windowMs: metrics.windowMs };
  }

  const { cpu, gpu, tpu } = metrics;
  const sections: TelemetrySource[] = [cpu.source, gpu.source, tpu.source];
  const available = sections.filter(s => s !== 'unavailable');
  const source: TelemetrySource =
    available.length === 0 ? 'unavailable' : available.includes('hardware') ? 'hardware' : 'derived';

  return {
    isDaemonConnected: true,
    windowMs: metrics.windowMs,
    sampledAtMs: metrics.sampledAtMs,
    daemonVersion: metrics.version,
    cpuUtilizationPercent: cpu.utilizationPercent,
    cpuPerCorePercent: cpu.perCorePercent,
    cpuSource: cpu.source,
    cpuError: cpu.error,
    gpuUtilizationPercent: gpu.utilizationPercent,
    gpuFrequencyHz: gpu.frequencyHz,
    gpuMemoryUsedMB: gpu.memoryUsedBytes === null ? null : gpu.memoryUsedBytes / (1024 * 1024),
    gpuTopProcesses: gpu.topProcesses,
    gpuSource: gpu.source,
    gpuError: gpu.error,
    tpuUtilizationPercent: tpu.utilizationPercent,
    tpuPowerState: tpu.powerState,
    tpuSource: tpu.source,
    tpuError: tpu.error,
    error: available.length === 0 ? 'system metrics daemon is running but every section is unavailable; see cpuError, gpuError and tpuError' : null,
    source,
  };
}
