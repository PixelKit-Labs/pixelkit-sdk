/**
 * @file systemLoad.test.ts
 * @description parseSystemMetrics and deriveSystemLoad: the daemon's JSON contract, partial
 * availability, malformed fields, and the null-plus-reason behaviour when no data can be trusted.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SYSTEM_METRICS_AGE_MS,
  SystemMetricsParseError,
  daemonUnreachableReason,
  deriveSystemLoad,
  parseSystemMetrics,
  unavailableSystemLoad,
} from '../packages/sdk/src/core/systemMetrics.ts';

/** Shape of a real /metrics response from the daemon on the Pixel 11 Pro (8-core Tensor, PowerVR GPU). */
function realisticResponse(): Record<string, any> {
  return {
    version: '1.0.0',
    uid: 2000,
    sampledAtMs: 1_790_000_000_000,
    windowMs: 1000,
    cpu: {
      source: 'hardware',
      error: null,
      utilizationPercent: 23.4,
      perCorePercent: [12.5, 18, 9.1, 40.2, 33, 61.7, 7.5, 5],
    },
    gpu: {
      source: 'derived',
      error: null,
      utilizationPercent: 17.9,
      frequencyHz: 460000000,
      memoryUsedBytes: 268435456,
      topProcesses: [
        { uid: 10219, activePercent: 11.2 },
        { uid: 1000, activePercent: 6.7 },
      ],
    },
    tpu: {
      source: 'unavailable',
      error: 'edgetpu trace events are not writable by shell; no command_start/command_end events were decoded',
      utilizationPercent: null,
      powerState: null,
    },
  };
}

function throwsField(input: unknown, field: string): void {
  assert.throws(
    () => parseSystemMetrics(input),
    (e: unknown) => e instanceof SystemMetricsParseError && e.field === field && e.message.includes(`"${field}"`),
    `expected a SystemMetricsParseError naming ${field}`,
  );
}

describe('parseSystemMetrics: valid responses', () => {
  test('a full response round-trips with every field typed', () => {
    const m = parseSystemMetrics(realisticResponse());
    assert.equal(m.version, '1.0.0');
    assert.equal(m.uid, 2000);
    assert.equal(m.windowMs, 1000);
    assert.equal(m.cpu.utilizationPercent, 23.4);
    assert.equal(m.cpu.perCorePercent.length, 8);
    assert.equal(m.gpu.source, 'derived');
    assert.equal(m.gpu.frequencyHz, 460000000);
    assert.deepEqual(m.gpu.topProcesses[0], { uid: 10219, activePercent: 11.2 });
    assert.equal(m.tpu.source, 'unavailable');
    assert.equal(m.tpu.utilizationPercent, null);
    assert.match(m.tpu.error ?? '', /command_start/);
  });

  test('a core with no jiffies in the window is a null entry, not zero', () => {
    const r = realisticResponse();
    r.cpu.perCorePercent[2] = null;
    assert.equal(parseSystemMetrics(r).cpu.perCorePercent[2], null);
  });

  test('a hardware TPU section with real utilisation and power state parses', () => {
    const r = realisticResponse();
    r.tpu = { source: 'hardware', error: null, utilizationPercent: 4.25, powerState: 'ON' };
    const m = parseSystemMetrics(r);
    assert.equal(m.tpu.utilizationPercent, 4.25);
    assert.equal(m.tpu.powerState, 'ON');
  });

  test('a partially readable GPU section keeps its readable values and states what is missing', () => {
    const r = realisticResponse();
    r.gpu = { source: 'hardware', error: 'dumpsys gpu returned no Global total', utilizationPercent: 0, frequencyHz: 460000000, memoryUsedBytes: null, topProcesses: [] };
    const m = parseSystemMetrics(r);
    assert.equal(m.gpu.memoryUsedBytes, null);
    assert.equal(m.gpu.utilizationPercent, 0);
    assert.match(m.gpu.error ?? '', /Global total/);
  });

  test('unknown extra fields are ignored', () => {
    const r = realisticResponse();
    r.future = { anything: true };
    assert.equal(parseSystemMetrics(r).version, '1.0.0');
  });
});

describe('parseSystemMetrics: unavailable sections', () => {
  test('every section unavailable with reasons parses and carries only nulls', () => {
    const reason = 'tracefs not writable';
    const r = realisticResponse();
    r.cpu = { source: 'unavailable', error: '/proc/stat unreadable', utilizationPercent: null, perCorePercent: [] };
    r.gpu = { source: 'unavailable', error: reason, utilizationPercent: null, frequencyHz: null, memoryUsedBytes: null, topProcesses: [] };
    const m = parseSystemMetrics(r);
    assert.equal(m.cpu.utilizationPercent, null);
    assert.equal(m.gpu.utilizationPercent, null);
    assert.equal(m.gpu.error, reason);
  });

  test('an unavailable section without a reason is rejected', () => {
    const r = realisticResponse();
    r.tpu.error = null;
    throwsField(r, 'tpu.error');
    r.tpu.error = '';
    throwsField(r, 'tpu.error');
  });

  test('an unavailable section that still carries a number is rejected', () => {
    const r = realisticResponse();
    r.tpu.utilizationPercent = 0;
    throwsField(r, 'tpu.utilizationPercent');
    const g = realisticResponse();
    g.gpu = { ...g.gpu, source: 'unavailable', error: 'x', utilizationPercent: null, frequencyHz: 460000000 };
    throwsField(g, 'gpu.frequencyHz');
    const c = realisticResponse();
    c.cpu = { source: 'unavailable', error: 'x', utilizationPercent: null, perCorePercent: [10] };
    throwsField(c, 'cpu.perCorePercent');
  });

  test('a hardware CPU or TPU section must carry its utilisation', () => {
    const c = realisticResponse();
    c.cpu.utilizationPercent = null;
    throwsField(c, 'cpu.utilizationPercent');
    const t = realisticResponse();
    t.tpu = { source: 'hardware', error: null, utilizationPercent: null, powerState: 'ON' };
    throwsField(t, 'tpu.utilizationPercent');
  });
});

describe('parseSystemMetrics: malformed responses name the offending field', () => {
  test('non-object roots', () => {
    for (const bad of [null, undefined, 'metrics', 42, [], [1]]) throwsField(bad, '$');
  });

  test('missing or wrong-typed top-level fields', () => {
    for (const key of ['version', 'uid', 'sampledAtMs', 'windowMs']) {
      const r = realisticResponse();
      delete r[key];
      throwsField(r, key);
    }
    const r = realisticResponse();
    r.version = 100;
    throwsField(r, 'version');
    const u = realisticResponse();
    u.uid = 2000.5;
    throwsField(u, 'uid');
    const w = realisticResponse();
    w.windowMs = 0;
    throwsField(w, 'windowMs');
    const s = realisticResponse();
    s.sampledAtMs = '1790000000000';
    throwsField(s, 'sampledAtMs');
  });

  test('missing sections', () => {
    for (const key of ['cpu', 'gpu', 'tpu']) {
      const r = realisticResponse();
      delete r[key];
      throwsField(r, key);
    }
  });

  test('percentages must be finite and within 0..100', () => {
    const over = realisticResponse();
    over.cpu.utilizationPercent = 100.5;
    throwsField(over, 'cpu.utilizationPercent');
    const neg = realisticResponse();
    neg.gpu.utilizationPercent = -1;
    throwsField(neg, 'gpu.utilizationPercent');
    const nan = realisticResponse();
    nan.cpu.utilizationPercent = Number.NaN;
    throwsField(nan, 'cpu.utilizationPercent');
    const str = realisticResponse();
    str.cpu.utilizationPercent = '23.4';
    throwsField(str, 'cpu.utilizationPercent');
  });

  test('per-core and per-process entries are located by index', () => {
    const core = realisticResponse();
    core.cpu.perCorePercent[3] = 'busy';
    throwsField(core, 'cpu.perCorePercent[3]');
    const notArray = realisticResponse();
    notArray.cpu.perCorePercent = {};
    throwsField(notArray, 'cpu.perCorePercent');
    const proc = realisticResponse();
    proc.gpu.topProcesses[1].activePercent = 140;
    throwsField(proc, 'gpu.topProcesses[1].activePercent');
    const uid = realisticResponse();
    uid.gpu.topProcesses[0].uid = '10219';
    throwsField(uid, 'gpu.topProcesses[0].uid');
  });

  test('source must be one of the documented values for that section', () => {
    const sim = realisticResponse();
    sim.cpu.source = 'simulated';
    throwsField(sim, 'cpu.source');
    const derivedCpu = realisticResponse();
    derivedCpu.cpu.source = 'derived';
    throwsField(derivedCpu, 'cpu.source');
    const derivedTpu = realisticResponse();
    derivedTpu.tpu.source = 'derived';
    throwsField(derivedTpu, 'tpu.source');
    const missing = realisticResponse();
    delete missing.gpu.source;
    throwsField(missing, 'gpu.source');
  });

  test('negative byte counts and frequencies are rejected', () => {
    const f = realisticResponse();
    f.gpu.frequencyHz = -460000000;
    throwsField(f, 'gpu.frequencyHz');
    const m = realisticResponse();
    m.gpu.memoryUsedBytes = '256MB';
    throwsField(m, 'gpu.memoryUsedBytes');
  });

  test('error must be a string or null', () => {
    const r = realisticResponse();
    r.cpu.error = { code: 1 };
    throwsField(r, 'cpu.error');
  });
});

describe('deriveSystemLoad', () => {
  const now = 1_790_000_000_500;

  test('maps a current response to hook values and converts GPU bytes to MiB', () => {
    const v = deriveSystemLoad(parseSystemMetrics(realisticResponse()), now);
    assert.equal(v.isDaemonConnected, true);
    assert.equal(v.cpuUtilizationPercent, 23.4);
    assert.equal(v.cpuSource, 'hardware');
    assert.equal(v.gpuMemoryUsedMB, 256);
    assert.equal(v.gpuFrequencyHz, 460000000);
    assert.equal(v.gpuSource, 'derived');
    assert.equal(v.tpuUtilizationPercent, null);
    assert.equal(v.tpuSource, 'unavailable');
    assert.match(v.tpuError ?? '', /command_start/);
    assert.equal(v.windowMs, 1000);
    assert.equal(v.error, null);
    assert.equal(v.source, 'hardware');
  });

  test('overall source is derived when only derived sections are available', () => {
    const r = realisticResponse();
    r.cpu = { source: 'unavailable', error: '/proc/stat unreadable', utilizationPercent: null, perCorePercent: [] };
    const v = deriveSystemLoad(parseSystemMetrics(r), now);
    assert.equal(v.source, 'derived');
    assert.equal(v.cpuUtilizationPercent, null);
    assert.equal(v.cpuError, '/proc/stat unreadable');
  });

  test('all sections unavailable: source unavailable and an error stating why', () => {
    const r = realisticResponse();
    r.cpu = { source: 'unavailable', error: 'a', utilizationPercent: null, perCorePercent: [] };
    r.gpu = { source: 'unavailable', error: 'b', utilizationPercent: null, frequencyHz: null, memoryUsedBytes: null, topProcesses: [] };
    const v = deriveSystemLoad(parseSystemMetrics(r), now);
    assert.equal(v.source, 'unavailable');
    assert.equal(v.isDaemonConnected, true);
    assert.match(v.error ?? '', /every section is unavailable/);
  });

  test('a stalled sampler withholds every number', () => {
    const stale = now + MAX_SYSTEM_METRICS_AGE_MS + 1;
    const v = deriveSystemLoad(parseSystemMetrics(realisticResponse()), stale);
    assert.equal(v.isDaemonConnected, true);
    assert.equal(v.cpuUtilizationPercent, null);
    assert.equal(v.gpuUtilizationPercent, null);
    assert.equal(v.gpuMemoryUsedMB, null);
    assert.equal(v.source, 'unavailable');
    assert.match(v.error ?? '', /sampler has stalled/);
    assert.match(v.cpuError ?? '', /stalled/);
  });
});

describe('daemon not running', () => {
  test('unavailableSystemLoad has no numbers and states the reason on every section', () => {
    const v = unavailableSystemLoad(daemonUnreachableReason('connection refused'));
    assert.equal(v.isDaemonConnected, false);
    assert.equal(v.cpuUtilizationPercent, null);
    assert.deepEqual(v.cpuPerCorePercent, []);
    assert.equal(v.gpuUtilizationPercent, null);
    assert.equal(v.gpuMemoryUsedMB, null);
    assert.equal(v.tpuUtilizationPercent, null);
    assert.equal(v.windowMs, null);
    assert.equal(v.source, 'unavailable');
    assert.equal(v.cpuSource, 'unavailable');
    assert.equal(v.gpuSource, 'unavailable');
    assert.equal(v.tpuSource, 'unavailable');
    for (const reason of [v.error, v.cpuError, v.gpuError, v.tpuError]) {
      assert.match(reason ?? '', /127\.0\.0\.1:11081.*connection refused/);
    }
  });
});
