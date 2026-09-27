/**
 * Explicit, dependency-free observability for PixelKit operations.
 *
 * Context is always passed by the caller. PixelKit deliberately does not use an async-global
 * current span because React Native callbacks and concurrent promises cannot inherit one safely.
 * The default sink is bounded, local-only memory plus console output; it never exports data.
 */
import { useEffect, useState } from 'react';

export type TelemetrySource = 'hardware' | 'derived' | 'unavailable';
export type TraceStatus = 'ok' | 'error' | 'cancelled' | 'timeout' | 'unavailable';

/** Stable application and provider ownership carried across every asynchronous boundary. */
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly runId?: string;
  readonly turnId?: string;
  readonly toolCallId?: string;
  readonly workerRunId?: string;
  readonly providerRequestId?: string;
  readonly nativeRequestId?: string;
}

export type TraceContextFields = Omit<Partial<TraceContext>, 'traceId' | 'spanId' | 'parentSpanId'>;

export interface NormalizedError {
  message: string;
  code?: string;
  name?: string;
}

export interface TelemetryEvent {
  ts: number;
  module: string;
  event: string;
  data?: Record<string, unknown>;
  level: 'info' | 'warn' | 'error';
  traceId?: string;
  spanId?: string;
  context?: TraceContext;
}

export interface MetricRecord {
  module: string;
  metric: string;
  value: unknown;
  source: TelemetrySource;
  ts: number;
  traceId?: string;
  spanId?: string;
  context?: TraceContext;
}

export interface TraceRecord {
  /** Span id retained as `id` for diagnostics consumers. */
  id: string;
  module: string;
  op: string;
  startedAt: number;
  startedAtMonotonicMs: number;
  durationMs: number;
  ok: boolean;
  status: TraceStatus;
  error?: NormalizedError;
  data?: Record<string, unknown>;
  traceId: string;
  parentSpanId?: string;
  context: TraceContext;
  source: TelemetrySource;
}

/** Dependency-free field mapping for OpenTelemetry span exporters supplied by applications. */
export interface OpenTelemetrySpanMapping {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  start_time_unix_ms: number;
  start_time_monotonic_ms: number;
  duration_ms: number;
  status: TraceStatus;
  attributes: Record<string, unknown>;
}

/** A sink is passive: it cannot alter operation results or trigger network export implicitly. */
export interface ObservabilitySink {
  event(record: Readonly<TelemetryEvent>): void | Promise<void>;
  metric(record: Readonly<MetricRecord>): void | Promise<void>;
  span(record: Readonly<TraceRecord>): void | Promise<void>;
}

export interface RedactionPolicy {
  /** Additional case-insensitive keys whose values must be replaced with `[REDACTED]`. */
  sensitiveKeys?: readonly string[];
  /** Optional final application redactor. Returning undefined removes the field. */
  redact?: (key: string, value: unknown) => unknown;
}

export interface ObservabilityOptions {
  context?: TraceContext;
  sink?: ObservabilitySink;
  redaction?: RedactionPolicy;
}

export interface TraceScope {
  readonly context: TraceContext;
  readonly active: boolean;
  event(event: string, data?: Record<string, unknown>, level?: TelemetryEvent['level'], context?: TraceContext): void;
  metric(metric: string, value: unknown, source?: TelemetrySource): void;
  end(status?: TraceStatus, data?: Record<string, unknown>, error?: unknown): void;
}

const LOG_PREFIX = '[PixelKit]';
const MAX_EVENTS = 400;
const MAX_TRACES = 200;
const MAX_METRICS = 200;
const SLOW_OP_MS = 1500;
const DEFAULT_SENSITIVE_KEYS: Record<string, true> = {
  apikey: true, api_key: true, authorization: true, password: true, secret: true,
  credential: true, cookie: true, access_token: true, accesstoken: true,
  refresh_token: true, refreshtoken: true, id_token: true, private_key: true,
  client_secret: true, prompt: true, text: true, content: true, transcript: true,
  audio: true, image: true, base64: true, uri: true, raw: true,
};

let idSequence = 0;
const nextId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(++idSequence).toString(36)}`;

/** Creates an immutable root context. Supplying application ids makes cross-system joins deterministic. */
export function createTraceContext(
  fields: TraceContextFields & { traceId?: string; spanId?: string } = {},
): TraceContext {
  return Object.freeze({
    traceId: fields.traceId ?? nextId('tr'),
    spanId: fields.spanId ?? nextId('sp'),
    ...(fields.runId ? { runId: fields.runId } : {}),
    ...(fields.turnId ? { turnId: fields.turnId } : {}),
    ...(fields.toolCallId ? { toolCallId: fields.toolCallId } : {}),
    ...(fields.workerRunId ? { workerRunId: fields.workerRunId } : {}),
    ...(fields.providerRequestId ? { providerRequestId: fields.providerRequestId } : {}),
    ...(fields.nativeRequestId ? { nativeRequestId: fields.nativeRequestId } : {}),
  });
}

/** Derives one immutable child span without mutating or replacing application ownership. */
export function createChildTraceContext(parent: TraceContext, fields: TraceContextFields = {}): TraceContext {
  return Object.freeze({
    ...parent,
    ...fields,
    traceId: parent.traceId,
    spanId: nextId('sp'),
    parentSpanId: parent.spanId,
  });
}

/** Adds correlation fields without creating an unrecorded span. */
export function withTraceContextFields(parent: TraceContext, fields: TraceContextFields): TraceContext {
  return Object.freeze({ ...parent, ...fields });
}

function isSensitiveKey(key: string, policy?: RedactionPolicy): boolean {
  const normalized = key.replace(/[-\s]/g, '_').toLowerCase();
  if (normalized in DEFAULT_SENSITIVE_KEYS) return true;
  return policy?.sensitiveKeys?.some(item => item.replace(/[-\s]/g, '_').toLowerCase() === normalized) ?? false;
}

function redactSensitiveString(value: string): string {
  return value
    .replace(/\bAIza[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

/** Redacts nested attributes and handles cycles. Payload text/media is never retained by default. */
export function redactAttributes(
  attributes: Record<string, unknown> | undefined,
  policy?: RedactionPolicy,
): Record<string, unknown> | undefined {
  if (!attributes) return undefined;
  const seen = new WeakSet<object>();
  const visit = (value: unknown, key: string, depth: number): unknown => {
    if (isSensitiveKey(key, policy)) return '[REDACTED]';
    const applicationValue = policy?.redact ? policy.redact(key, value) : value;
    if (applicationValue === undefined) return undefined;
    if (applicationValue === null || typeof applicationValue !== 'object') {
      return typeof applicationValue === 'string' ? redactSensitiveString(applicationValue) : applicationValue;
    }
    if (depth >= 6) return '[REDACTED_DEPTH]';
    if (seen.has(applicationValue as object)) return '[REDACTED_CYCLE]';
    seen.add(applicationValue as object);
    if (Array.isArray(applicationValue)) {
      return applicationValue.slice(0, 100).map(item => visit(item, key, depth + 1));
    }
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(applicationValue as Record<string, unknown>)) {
      const redacted = visit(childValue, childKey, depth + 1);
      if (redacted !== undefined) output[childKey] = redacted;
    }
    return output;
  };
  return visit(attributes, '', 0) as Record<string, unknown>;
}

const events: TelemetryEvent[] = [];
const metrics = new Map<string, MetricRecord>();
const traces: TraceRecord[] = [];
const errorCounts = new Map<string, number>();
const expectedCounts = new Map<string, number>();
const listeners = new Set<() => void>();
let notifyScheduled = false;

function notify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    listeners.forEach(listener => listener());
  }, 250);
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value); } catch { return '"[UNSERIALIZABLE]"'; }
}

const defaultSink: ObservabilitySink = Object.freeze({
  event(record: Readonly<TelemetryEvent>): void {
    events.push(record as TelemetryEvent);
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    const owner = record.traceId ? ` <${record.traceId}/${record.spanId}>` : '';
    const line = `${LOG_PREFIX} ${record.module}${owner}: ${record.event}${record.data ? ` ${safeJson(record.data)}` : ''}`;
    if (record.level === 'error') console.error(line);
    else if (record.level === 'warn') console.warn(line);
    else console.log(line);
    notify();
  },
  metric(record: Readonly<MetricRecord>): void {
    const key = `${record.module}.${record.metric}`;
    if (metrics.has(key)) metrics.delete(key);
    else if (metrics.size >= MAX_METRICS) {
      const oldest = metrics.keys().next().value;
      if (oldest !== undefined) metrics.delete(oldest);
    }
    metrics.set(key, record as MetricRecord);
    notify();
  },
  span(record: Readonly<TraceRecord>): void {
    traces.push(record as TraceRecord);
    if (traces.length > MAX_TRACES) traces.splice(0, traces.length - MAX_TRACES);
    notify();
  },
});

export function getDefaultObservabilitySink(): ObservabilitySink { return defaultSink; }

export function toOpenTelemetrySpan(record: TraceRecord): OpenTelemetrySpanMapping {
  return {
    trace_id: record.traceId,
    span_id: record.id,
    parent_span_id: record.parentSpanId,
    name: `${record.module}.${record.op}`,
    start_time_unix_ms: record.startedAt,
    start_time_monotonic_ms: record.startedAtMonotonicMs,
    duration_ms: record.durationMs,
    status: record.status,
    attributes: {
      ...record.data,
      'pixelkit.source': record.source,
      ...(record.context.runId ? { 'pixelkit.run_id': record.context.runId } : {}),
      ...(record.context.turnId ? { 'pixelkit.turn_id': record.context.turnId } : {}),
      ...(record.context.toolCallId ? { 'pixelkit.tool_call_id': record.context.toolCallId } : {}),
      ...(record.context.workerRunId ? { 'pixelkit.worker_run_id': record.context.workerRunId } : {}),
      ...(record.context.providerRequestId ? { 'pixelkit.provider_request_id': record.context.providerRequestId } : {}),
      ...(record.context.nativeRequestId ? { 'pixelkit.native_request_id': record.context.nativeRequestId } : {}),
    },
  };
}

/** Sink failures are isolated from the observed operation and never recursively reported to that sink. */
function deliver<T>(sink: ObservabilitySink, method: 'event' | 'metric' | 'span', record: T): void {
  try {
    const pending = (sink[method] as (item: T) => void | Promise<void>)(record);
    if (pending && typeof (pending as Promise<void>).catch === 'function') {
      void (pending as Promise<void>).catch(() => noteExpected('observability', 'sink rejected record'));
    }
  } catch {
    noteExpected('observability', 'sink threw while recording');
  }
}

function sinkFor(options?: ObservabilityOptions): ObservabilitySink {
  return options?.sink ?? defaultSink;
}

export function logEvent(
  module: string,
  event: string,
  data?: Record<string, unknown>,
  level: TelemetryEvent['level'] = 'info',
  options?: ObservabilityOptions,
): void {
  const context = options?.context;
  const record: TelemetryEvent = Object.freeze({
    ts: Date.now(), module, event, data: redactAttributes(data, options?.redaction), level,
    traceId: context?.traceId, spanId: context?.spanId, context,
  });
  deliver(sinkFor(options), 'event', record);
}

export function recordMetric(
  module: string,
  metric: string,
  value: unknown,
  source: TelemetrySource,
  options?: ObservabilityOptions,
): void {
  const context = options?.context;
  const redactedValue = redactAttributes({ value }, options?.redaction)?.value;
  const record: MetricRecord = Object.freeze({
    module, metric, value: redactedValue, source, ts: Date.now(),
    traceId: context?.traceId, spanId: context?.spanId, context,
  });
  deliver(sinkFor(options), 'metric', record);
}

export function normalizeError(error: unknown): NormalizedError {
  if (error == null) return { message: 'Unknown error' };
  if (typeof error === 'string') return { message: redactSensitiveString(error) };
  const candidate = error as { message?: unknown; code?: unknown; name?: unknown; toString?: () => string };
  const message = typeof candidate.message === 'string' && candidate.message.length > 0
    ? candidate.message
    : typeof candidate.toString === 'function' ? String(candidate.toString()) : 'Unknown error';
  return {
    message: redactSensitiveString(message),
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
    ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
  };
}

export function logError(
  module: string,
  event: string,
  error: unknown,
  data?: Record<string, unknown>,
  options?: ObservabilityOptions,
): NormalizedError {
  const normalized = normalizeError(error);
  errorCounts.set(module, (errorCounts.get(module) ?? 0) + 1);
  logEvent(module, event, {
    ...data,
    message: normalized.message,
    ...(normalized.code ? { code: normalized.code } : {}),
  }, 'error', options);
  return normalized;
}

/** Opens a callback-safe span. Calls after `end` are ignored, isolating late native/provider callbacks. */
export function beginTrace(
  module: string,
  op: string,
  source: TelemetrySource = 'hardware',
  data?: Record<string, unknown>,
  options?: ObservabilityOptions,
): TraceScope {
  const context = options?.context
    ? createChildTraceContext(options.context)
    : createTraceContext();
  const scopedOptions: ObservabilityOptions = { ...options, context };
  const startedAt = Date.now();
  const start = performance.now();
  let active = true;
  const scope: TraceScope = {
    context,
    get active() { return active; },
    event(event, attributes, level = 'info', eventContext) {
      if (!active) return;
      logEvent(module, event, attributes, level, eventContext ? { ...scopedOptions, context: eventContext } : scopedOptions);
    },
    metric(metric, value, metricSource = source) {
      if (!active) return;
      recordMetric(module, metric, value, metricSource, scopedOptions);
    },
    end(status = 'ok', endData, thrown) {
      if (!active) return;
      active = false;
      const durationMs = performance.now() - start;
      const error = thrown === undefined ? undefined : normalizeError(thrown);
      const attributes = redactAttributes({ ...data, ...endData }, options?.redaction);
      const record: TraceRecord = Object.freeze({
        id: context.spanId,
        module,
        op,
        startedAt,
        startedAtMonotonicMs: start,
        durationMs,
        ok: status === 'ok',
        status,
        ...(error ? { error } : {}),
        data: attributes,
        traceId: context.traceId,
        parentSpanId: context.parentSpanId,
        context,
        source,
      });
      if (status === 'error') errorCounts.set(module, (errorCounts.get(module) ?? 0) + 1);
      deliver(sinkFor(options), 'span', record);
      recordMetric(module, `${op}Ms`, durationMs, source, scopedOptions);
      logEvent(module, status === 'ok' ? op : status === 'error' ? `${op} failed` : `${op} ${status}`, {
        ...attributes,
        ms: durationMs,
        ...(error ? { message: error.message, ...(error.code ? { code: error.code } : {}) } : {}),
      }, status === 'error' ? 'error' : durationMs > SLOW_OP_MS ? 'warn' : 'info', scopedOptions);
    },
  };
  return scope;
}

export async function traced<T>(
  module: string,
  op: string,
  fn: (context: TraceContext) => Promise<T> | T,
  data?: Record<string, unknown>,
  source: TelemetrySource = 'hardware',
  options?: ObservabilityOptions,
): Promise<T> {
  const scope = beginTrace(module, op, source, data, options);
  try {
    const result = await fn(scope.context);
    scope.end('ok');
    return result;
  } catch (error) {
    scope.end('error', undefined, error);
    throw error;
  }
}

export async function tracedSafe<T>(
  module: string,
  op: string,
  fn: (context: TraceContext) => Promise<T> | T,
  fallback: T,
  data?: Record<string, unknown>,
  source: TelemetrySource = 'hardware',
  options?: ObservabilityOptions,
): Promise<T> {
  try { return await traced(module, op, fn, data, source, options); }
  catch { return fallback; }
}

export function noteExpected(module: string, reason: string): void {
  const key = `${module}:${reason}`;
  expectedCounts.set(key, (expectedCounts.get(key) ?? 0) + 1);
}

export function getExpectedCounts(): Record<string, number> { return Object.fromEntries(expectedCounts); }
export function getRecentEvents(): TelemetryEvent[] { return events.slice(); }
export function getMetrics(): MetricRecord[] { return [...metrics.values()]; }
export function getTraces(): TraceRecord[] { return traces.slice(); }
export function getErrorCounts(): Record<string, number> { return Object.fromEntries(errorCounts); }
export function getSlowestTraces(limit = 10): TraceRecord[] {
  return traces.slice().sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
}
export function getTrace(id: string): { trace?: TraceRecord; events: TelemetryEvent[] } {
  return {
    trace: traces.find(trace => trace.id === id || trace.traceId === id),
    events: events.filter(event => event.spanId === id || event.traceId === id),
  };
}
export function getSourceSummary(): Record<string, TelemetrySource[]> {
  const output: Record<string, Set<TelemetrySource>> = {};
  for (const metric of metrics.values()) (output[metric.module] ??= new Set()).add(metric.source);
  return Object.fromEntries(Object.entries(output).map(([module, sources]) => [module, [...sources]]));
}
export function getHealthSummary(): { module: string; errors: number; traces: number; slowestMs: number }[] {
  const modules = new Set<string>([...errorCounts.keys(), ...traces.map(trace => trace.module)]);
  return [...modules].map(module => {
    const moduleTraces = traces.filter(trace => trace.module === module);
    return {
      module,
      errors: errorCounts.get(module) ?? 0,
      traces: moduleTraces.length,
      slowestMs: moduleTraces.reduce((maximum, trace) => Math.max(maximum, trace.durationMs), 0),
    };
  }).sort((a, b) => b.errors - a.errors || b.slowestMs - a.slowestMs);
}
export function resetObservability(): void {
  events.length = 0;
  traces.length = 0;
  metrics.clear();
  errorCounts.clear();
  expectedCounts.clear();
  notify();
}

export function useObservability() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(value => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return {
    events: getRecentEvents(), metrics: getMetrics(), traces: getTraces(), sources: getSourceSummary(),
    errorCounts: getErrorCounts(), expected: getExpectedCounts(), health: getHealthSummary(), slowest: getSlowestTraces(),
  };
}
