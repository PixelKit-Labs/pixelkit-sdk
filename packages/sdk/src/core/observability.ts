/**
 * @file observability.ts
 * @description Observability layer for PixelKit: provenance, events, metrics, traces and errors.
 *
 * Four things every hook is expected to do, and the helpers here that make each one a one-liner:
 *
 * 1. **Provenance.** Tag every reading with a `TelemetrySource` so the UI, the docs and an agent
 *    reading the logs can always answer "is this number real?".
 * 2. **Events.** `logEvent` records a lifecycle moment. Echoed to the console with a stable prefix,
 *    so `adb logcat -s ReactNativeJS | grep PixelKit` is a usable trace of a session.
 * 3. **Traces.** `traced` wraps an operation, times it, gives it a correlation id, records the
 *    duration as a metric and logs success or failure with that operation's id. Inline events
 *    inherit the synchronously executing operation; async continuations have no implicit owner.
 * 4. **Errors.** `normalizeError` gives every failure the same shape (message, code, name) whether
 *    it came from a native `CodedException`, a rejected promise or a thrown string. `logError`
 *    records it and increments a per-module counter, so a hook that is quietly failing is visible.
 *
 * The rule this file exists to enforce: a caught error is never discarded silently. If a hook
 * chooses to continue after a failure, it still says so.
 */

import { useEffect, useState } from 'react';

/**
 * Provenance of a telemetry value.
 * - 'hardware': read from a device API this run.
 * - 'derived': computed from hardware readings, and labelled as such.
 * - 'unavailable': could not be read; the value is null and renders as an em dash.
 *
 * There is deliberately no 'simulated' member. Nothing in this SDK fabricates a reading, so the
 * type makes that unrepresentable rather than relying on reviewers to catch it.
 */
export type TelemetrySource = 'hardware' | 'derived' | 'unavailable';

export interface TelemetryEvent {
  ts: number;
  module: string;
  event: string;
  data?: Record<string, unknown>;
  level: 'info' | 'warn' | 'error';
  /** Correlation id when the event happened inside a trace. */
  traceId?: string;
}

export interface MetricRecord {
  module: string;
  metric: string;
  value: unknown;
  source: TelemetrySource;
  ts: number;
}

/** A failure reduced to the same shape regardless of where it came from. */
export interface NormalizedError {
  message: string;
  /** Native `CodedException` code, for example `E_NANO_BUSY`. */
  code?: string;
  name?: string;
}

/** A completed operation: what ran, how long it took, and whether it worked. */
export interface TraceRecord {
  id: string;
  module: string;
  op: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  error?: NormalizedError;
  data?: Record<string, unknown>;
}

const LOG_PREFIX = '[PixelKit]';
const MAX_EVENTS = 400;
const MAX_TRACES = 200;
/** Operations slower than this are logged at warn level; they are usually worth looking at. */
const SLOW_OP_MS = 1500;

const events: TelemetryEvent[] = [];
const metrics = new Map<string, MetricRecord>();
const traces: TraceRecord[] = [];
const errorCounts = new Map<string, number>();
const expectedCounts = new Map<string, number>();
const listeners = new Set<() => void>();
let notifyScheduled = false;
let traceSeq = 0;
/** Synchronous scope only: never retain global context across an await. */
let activeTraceId: string | undefined;

function notify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    listeners.forEach(l => l());
  }, 250); // ≤4 Hz UI updates
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Record a lifecycle or diagnostic event. Always echoed to the console with the PixelKit prefix. */
export function logEvent(
  module: string,
  event: string,
  data?: Record<string, unknown>,
  level: TelemetryEvent['level'] = 'info',
): void {
  emitEvent(module, event, data, level, activeTraceId);
}

/** Explicit ownership for completion events, independent of concurrent operations. */
function emitEvent(
  module: string,
  event: string,
  data: Record<string, unknown> | undefined,
  level: TelemetryEvent['level'],
  traceId: string | undefined,
): void {
  const e: TelemetryEvent = { ts: Date.now(), module, event, data, level, traceId };
  events.push(e);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  const trace = traceId ? ` <${traceId}>` : '';
  const line = `${LOG_PREFIX} ${module}${trace}: ${event}${data ? ' ' + safeJson(data) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  notify();
}

/** Latest value of a metric with its provenance. Not logged per sample; visible in the debug panel. */
export function recordMetric(module: string, metric: string, value: unknown, source: TelemetrySource): void {
  metrics.set(`${module}.${metric}`, { module, metric, value, source, ts: Date.now() });
  notify();
}

/**
 * Reduces anything thrown into a consistent shape. Handles native `CodedException`s (which carry a
 * `code`), `Error`s, rejected promises with string reasons, and plain objects.
 */
export function normalizeError(e: unknown): NormalizedError {
  if (e == null) return { message: 'Unknown error' };
  if (typeof e === 'string') return { message: e };
  const any = e as { message?: unknown; code?: unknown; name?: unknown; toString?: () => string };
  const message =
    typeof any.message === 'string' && any.message.length > 0
      ? any.message
      : typeof any.toString === 'function'
        ? String(any.toString())
        : 'Unknown error';
  const code = typeof any.code === 'string' ? any.code : undefined;
  const name = typeof any.name === 'string' ? any.name : undefined;
  return { message, code, name };
}

/**
 * Records a failure: logs it at error level and increments the module's error counter.
 * Returns the normalized error so a caller can put the message straight into state.
 */
export function logError(
  module: string,
  event: string,
  e: unknown,
  data?: Record<string, unknown>,
): NormalizedError {
  const err = normalizeError(e);
  errorCounts.set(module, (errorCounts.get(module) ?? 0) + 1);
  logEvent(module, event, { ...data, message: err.message, ...(err.code ? { code: err.code } : {}) }, 'error');
  return err;
}

/**
 * Times an operation, gives it a correlation id and records the outcome.
 *
 * On success: records `<op>Ms` as a metric and logs at info, or at warn when it took longer than
 * {@link SLOW_OP_MS}. On failure: logs the error and rethrows, so control flow is unchanged and the
 * caller still decides what to do.
 * Inline logEvent/logError calls inherit this operation only until fn returns its promise.
 * Events after an await require application-level request identifiers in their data;
 * JavaScript global state cannot infer their async owner safely.
 *
 * @example
 * const photo = await traced(MODULE, 'takePicture', () => camera.takePictureAsync(), { quality });
 */
export async function traced<T>(
  module: string,
  op: string,
  fn: () => Promise<T> | T,
  data?: Record<string, unknown>,
  source: TelemetrySource = 'hardware',
): Promise<T> {
  const id = `t${(++traceSeq).toString(36)}`;
  const startedAt = Date.now();
  const start = performance.now();
  try {
    let pending: Promise<T> | T;
    const parent = activeTraceId;
    activeTraceId = id;
    try { pending = fn(); }
    finally { activeTraceId = parent; }
    const result = await pending;
    const durationMs = performance.now() - start;
    pushTrace({ id, module, op, startedAt, durationMs, ok: true, data });
    recordMetric(module, `${op}Ms`, durationMs, source);
    emitEvent(module, op, { ...data, ms: durationMs }, durationMs > SLOW_OP_MS ? 'warn' : 'info', id);
    return result;
  } catch (e) {
    const durationMs = performance.now() - start;
    const error = normalizeError(e);
    pushTrace({ id, module, op, startedAt, durationMs, ok: false, error, data });
    errorCounts.set(module, (errorCounts.get(module) ?? 0) + 1);
    emitEvent(
      module,
      `${op} failed`,
      { ...data, ms: durationMs, message: error.message, ...(error.code ? { code: error.code } : {}) },
      'error',
      id,
    );
    throw e;
  }
}

/**
 * Same as {@link traced} but returns `fallback` instead of throwing. Use where a failure is
 * survivable and the hook keeps going; the failure is still logged and counted, never swallowed.
 */
export async function tracedSafe<T>(
  module: string,
  op: string,
  fn: () => Promise<T> | T,
  fallback: T,
  data?: Record<string, unknown>,
): Promise<T> {
  try {
    return await traced(module, op, fn, data);
  } catch {
    return fallback;
  }
}

/**
 * Records a failure that is expected and harmless, such as calling a native object that has already
 * been released during teardown. Counted so it is visible in diagnostics, but not logged, because a
 * teardown path would otherwise flood the log. This is the only sanctioned alternative to handling
 * an error: an empty catch is not.
 */
export function noteExpected(module: string, reason: string): void {
  const key = `${module}:${reason}`;
  expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
}

/** How often each expected-failure path has been taken. */
export function getExpectedCounts(): Record<string, number> {
  return Object.fromEntries(expectedCounts);
}

function pushTrace(t: TraceRecord) {
  traces.push(t);
  if (traces.length > MAX_TRACES) traces.splice(0, traces.length - MAX_TRACES);
  notify();
}

/** Snapshot helpers for non-React consumers (tests, agents). */
export function getRecentEvents(): TelemetryEvent[] { return events.slice(); }
export function getMetrics(): MetricRecord[] { return [...metrics.values()]; }
export function getTraces(): TraceRecord[] { return traces.slice(); }
export function getErrorCounts(): Record<string, number> { return Object.fromEntries(errorCounts); }

/** Slowest completed operations, for finding what is making the app feel heavy. */
export function getSlowestTraces(limit = 10): TraceRecord[] {
  return traces.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}

/** Every event and trace sharing one correlation id, in order. */
export function getTrace(id: string): { trace?: TraceRecord; events: TelemetryEvent[] } {
  return { trace: traces.find(t => t.id === id), events: events.filter(e => e.traceId === id) };
}

/** Summarise provenance per module: which sources each module currently reports. */
export function getSourceSummary(): Record<string, TelemetrySource[]> {
  const out: Record<string, Set<TelemetrySource>> = {};
  for (const m of metrics.values()) (out[m.module] ??= new Set()).add(m.source);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/** One line per module: how many errors, how many traces, and how slow the worst one was. */
export function getHealthSummary(): { module: string; errors: number; traces: number; slowestMs: number }[] {
  const modules = new Set<string>([...errorCounts.keys(), ...traces.map(t => t.module)]);
  return [...modules]
    .map(module => {
      const mine = traces.filter(t => t.module === module);
      return {
        module,
        errors: errorCounts.get(module) ?? 0,
        traces: mine.length,
        slowestMs: mine.reduce((max, t) => Math.max(max, t.durationMs), 0),
      };
    })
    .sort((a, b) => b.errors - a.errors || b.slowestMs - a.slowestMs);
}

/** Clears everything. Intended for tests and for a "reset diagnostics" control. */
export function resetObservability(): void {
  events.length = 0;
  traces.length = 0;
  metrics.clear();
  errorCounts.clear();
  expectedCounts.clear();
  notify();
}

/** React hook: live view of events, metrics, traces and per-module health, throttled to ≤4 Hz. */
export function useObservability() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(n => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    events: getRecentEvents(),
    metrics: getMetrics(),
    traces: getTraces(),
    sources: getSourceSummary(),
    errorCounts: getErrorCounts(),
    expected: getExpectedCounts(),
    health: getHealthSummary(),
    slowest: getSlowestTraces(),
  };
}
