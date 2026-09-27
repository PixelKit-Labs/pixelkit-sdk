/**
 * @file observability.test.ts
 * @description Behavioural tests for the observability layer.
 *
 * This layer is what CLAUDE.md rule 10 is enforced by: every call that touches hardware, the
 * network, a native module or the file system goes through `traced` or `tracedSafe`, surfaces its
 * failure through an `error` field, and never disappears into an empty catch. Its doc comments make
 * promises — "the failure is still logged and counted, never swallowed", "counted so it is visible
 * in diagnostics, but not logged" — and a promise nothing executes is a comment, not a guarantee.
 *
 * The module holds process-wide state, so every test resets it first. `useObservability` is not
 * covered here: it is the one React-dependent export and needs a renderer.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  beginTrace,
  createTraceContext,
  getErrorCounts,
  getExpectedCounts,
  getHealthSummary,
  getRecentEvents,
  getSlowestTraces,
  getSourceSummary,
  getTrace,
  getTraces,
  logError,
  logEvent,
  noteExpected,
  normalizeError,
  recordMetric,
  resetObservability,
  traced,
  tracedSafe,
  type ObservabilitySink,
  type TelemetryEvent,
} from '../packages/sdk/src/core/observability.ts';

beforeEach(() => resetObservability());

describe('traced: the success path', () => {
  test('returns the value and records a trace that succeeded', async () => {
    const result = await traced('useCPU', 'read', () => 42);
    assert.equal(result, 42);

    const traces = getTraces();
    assert.equal(traces.length, 1);
    assert.equal(traces[0].module, 'useCPU');
    assert.equal(traces[0].op, 'read');
    assert.equal(traces[0].ok, true);
    assert.equal(traces[0].error, undefined);
  });

  test('accepts a synchronous function as well as a promise', async () => {
    assert.equal(await traced('useGPU', 'sync', () => 'value'), 'value');
    assert.equal(await traced('useGPU', 'async', async () => 'value'), 'value');
    assert.equal(getTraces().length, 2);
  });

  test('records the source against the metric, defaulting to hardware', async () => {
    await traced('useCPU', 'read', () => 1);
    await traced('useMemory', 'read', () => 1, undefined, 'derived');
    const summary = getSourceSummary();
    assert.deepEqual(summary.useCPU, ['hardware'], 'the default is hardware');
    assert.deepEqual(summary.useMemory, ['derived']);
  });
});

describe('traced: the failure path', () => {
  test('rethrows, so a caller cannot mistake a failure for a value', async () => {
    await assert.rejects(
      () => traced('useNFC', 'scan', () => { throw new Error('tag lost'); }),
      /tag lost/,
    );
  });

  test('records the failure on the trace and counts it against the module', async () => {
    await assert.rejects(() => traced('useNFC', 'scan', () => { throw new Error('tag lost'); }));

    const trace = getTraces()[0];
    assert.equal(trace.ok, false);
    assert.equal(trace.error?.message, 'tag lost');
    assert.equal(getErrorCounts().useNFC, 1);
  });

  test('logs the failure at error level, carrying the module and the op', async () => {
    await assert.rejects(() => traced('useBLE', 'connect', () => { throw new Error('gatt 133'); }));
    const errors = getRecentEvents().filter((e) => e.level === 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].module, 'useBLE');
    assert.equal(errors[0].data?.message, 'gatt 133', 'the message travels in data, not the event name');
    assert.match(errors[0].event, /connect failed/);
  });
});

describe('tracedSafe: survivable failures', () => {
  test('returns the fallback rather than throwing', async () => {
    const value = await tracedSafe('useTorch', 'read', () => { throw new Error('no camera'); }, null);
    assert.equal(value, null);
  });

  test('still counts and logs the failure — this is the "never swallowed" promise', async () => {
    await tracedSafe('useTorch', 'read', () => { throw new Error('no camera'); }, null);

    assert.equal(getErrorCounts().useTorch, 1, 'a survivable failure is still a failure');
    assert.equal(getTraces()[0].ok, false);
    assert.equal(
      getRecentEvents().filter((e) => e.level === 'error').length,
      1,
      'returning a fallback must not make the failure invisible',
    );
  });

  test('passes the value straight through when nothing fails', async () => {
    assert.equal(await tracedSafe('useTorch', 'read', () => true, false), true);
    assert.equal(getErrorCounts().useTorch, undefined);
  });
});

describe('noteExpected: counted, deliberately not logged', () => {
  test('counts under module:reason', () => {
    noteExpected('useCamera', 'released during teardown');
    noteExpected('useCamera', 'released during teardown');
    assert.equal(getExpectedCounts()['useCamera:released during teardown'], 2);
  });

  test('does not log, so a teardown path cannot flood the event log', () => {
    noteExpected('useCamera', 'released during teardown');
    assert.equal(getRecentEvents().length, 0);
  });

  test('is not counted as an error, because it is not one', () => {
    noteExpected('useCamera', 'released during teardown');
    assert.deepEqual(getErrorCounts(), {});
  });
});

describe('normalizeError: anything thrown becomes a message', () => {
  test('an Error keeps its message, name and code', () => {
    const e = Object.assign(new Error('binder died'), { code: 'DEAD_OBJECT' });
    const n = normalizeError(e);
    assert.equal(n.message, 'binder died');
    assert.equal(n.code, 'DEAD_OBJECT');
    assert.equal(n.name, 'Error');
  });

  test('a thrown string is its own message', () => {
    assert.equal(normalizeError('permission denied').message, 'permission denied');
  });

  test('null and undefined do not produce "undefined" as a message', () => {
    assert.equal(normalizeError(null).message, 'Unknown error');
    assert.equal(normalizeError(undefined).message, 'Unknown error');
  });

  test('an object with no message falls back rather than yielding an empty string', () => {
    assert.equal(normalizeError({}).message, '[object Object]');
    assert.equal(normalizeError({ message: '' }).message, '[object Object]', 'an empty message is not a message');
  });

  test('a non-string code is dropped rather than coerced', () => {
    assert.equal(normalizeError({ message: 'x', code: 42 }).code, undefined);
  });
});

describe('the diagnostics a reader actually looks at', () => {
  test('getSlowestTraces sorts by duration and honours the limit', async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await traced('a', 'fast', () => wait(1));
    await traced('b', 'slow', () => wait(80));
    await traced('c', 'middle', () => wait(12));

    const slowest = getSlowestTraces(2);
    assert.equal(slowest.length, 2, 'the limit is applied');
    assert.equal(slowest[0].module, 'b', 'slowest first');
    assert.ok(slowest[0].durationMs >= slowest[1].durationMs);
  });

  test('getTrace gathers the events sharing one correlation id', async () => {
    await traced('useUWB', 'range', () => 1);
    const id = getTraces()[0].id;
    const { trace, events } = getTrace(id);
    assert.equal(trace?.op, 'range');
    assert.ok(events.length >= 1);
    assert.ok(events.every((e) => e.spanId === id), 'only this span, not the whole log');
  });

  test('getHealthSummary puts the module with the most errors first', async () => {
    await traced('quiet', 'ok', () => 1);
    await assert.rejects(() => traced('noisy', 'a', () => { throw new Error('x'); }));
    await assert.rejects(() => traced('noisy', 'b', () => { throw new Error('y'); }));

    const summary = getHealthSummary();
    assert.equal(summary[0].module, 'noisy');
    assert.equal(summary[0].errors, 2);
    assert.equal(summary[0].traces, 2);
    assert.equal(summary.find((s) => s.module === 'quiet')?.errors, 0);
  });

  test('getSourceSummary reports every distinct source a module has claimed', () => {
    recordMetric('useCPU', 'freq', 1, 'hardware');
    recordMetric('useCPU', 'load', 1, 'derived');
    recordMetric('useCPU', 'freq', 2, 'hardware');
    assert.deepEqual(getSourceSummary().useCPU.sort(), ['derived', 'hardware'], 'distinct, not one per metric');
  });
});

describe('resetObservability', () => {
  test('clears events, traces, errors and expected counts', async () => {
    await assert.rejects(() => traced('m', 'op', () => { throw new Error('x'); }));
    noteExpected('m', 'reason');
    assert.ok(getTraces().length > 0);

    resetObservability();

    assert.deepEqual(getTraces(), []);
    assert.deepEqual(getRecentEvents(), []);
    assert.deepEqual(getErrorCounts(), {});
    assert.deepEqual(getExpectedCounts(), {});
    assert.deepEqual(getSourceSummary(), {});
  });
});

describe('logError', () => {
  test('returns the normalized error so a hook can put it straight into state', () => {
    const n = logError('useSecurity', 'unlock', new Error('user cancelled'));
    assert.equal(n.message, 'user cancelled');
    assert.equal(getErrorCounts().useSecurity, 1);
  });
});

describe('explicit trace ownership and privacy', () => {
  test('concurrent runs retain separate roots and correct child parents', async () => {
    const first = createTraceContext({ traceId: 'trace-a', spanId: 'root-a', runId: 'run-a' });
    const second = createTraceContext({ traceId: 'trace-b', spanId: 'root-b', runId: 'run-b' });
    let releaseFirst!: () => void;
    const blocked = new Promise<void>(resolve => { releaseFirst = resolve; });
    const firstRun = traced('ai', 'generate', async context => {
      await blocked;
      logEvent('ai', 'first-complete', undefined, 'info', { context });
    }, undefined, 'hardware', { context: first });
    await traced('ai', 'generate', context => {
      logEvent('ai', 'second-complete', undefined, 'info', { context });
    }, undefined, 'hardware', { context: second });
    releaseFirst();
    await firstRun;

    const records = getTraces();
    const a = records.find(record => record.traceId === 'trace-a');
    const b = records.find(record => record.traceId === 'trace-b');
    assert.equal(a?.parentSpanId, 'root-a');
    assert.equal(b?.parentSpanId, 'root-b');
    assert.notEqual(a?.context.spanId, b?.context.spanId);
    assert.equal(getRecentEvents().find(event => event.event === 'first-complete')?.traceId, 'trace-a');
    assert.equal(getRecentEvents().find(event => event.event === 'second-complete')?.traceId, 'trace-b');
  });

  test('redacts sensitive nested attributes before they reach an application sink', () => {
    const captured: TelemetryEvent[] = [];
    const sink: ObservabilitySink = {
      event: record => { captured.push(record as TelemetryEvent); },
      metric: () => undefined,
      span: () => undefined,
    };
    logEvent('ai', 'request', {
      apiKey: 'secret',
      nested: { prompt: 'private words', outputTokens: 12, message: 'failed for AIza1234567890abcdefghij' },
    }, 'info', { sink });
    assert.deepEqual(captured[0].data, {
      apiKey: '[REDACTED]',
      nested: { prompt: '[REDACTED]', outputTokens: 12, message: 'failed for [REDACTED]' },
    });
  });

  test('sink failure cannot change the observed operation result', async () => {
    const sink: ObservabilitySink = {
      event: () => { throw new Error('sink unavailable'); },
      metric: () => Promise.reject(new Error('backpressure')),
      span: () => { throw new Error('sink unavailable'); },
    };
    const value = await traced('ai', 'generate', () => 42, undefined, 'hardware', {
      context: createTraceContext({ runId: 'run' }),
      sink,
    });
    assert.equal(value, 42);
  });

  test('late callbacks are ignored after a callback-safe scope ends', () => {
    const captured: TelemetryEvent[] = [];
    const sink: ObservabilitySink = {
      event: record => { captured.push(record as TelemetryEvent); },
      metric: () => undefined,
      span: () => undefined,
    };
    const scope = beginTrace('speech', 'recognize', 'hardware', undefined, {
      context: createTraceContext({ nativeRequestId: 'native-1' }),
      sink,
    });
    scope.event('partial');
    scope.end('ok');
    const countAfterEnd = captured.length;
    scope.event('late-partial');
    assert.equal(captured.length, countAfterEnd);
    assert.equal(captured.some(event => event.event === 'late-partial'), false);
  });
});
