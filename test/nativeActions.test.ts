/**
 * @file nativeActions.test.ts
 * @description Unit tests for the pure logic behind useUWB, useWifiRTT, usePerfetto and
 * useAppFunctions: every helper reports only what the native module returned and turns anything
 * else into an error, never a placeholder value.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AppFunctionExecution,
  PerfettoStartResult,
  PerfettoStopResult,
  UwbMeasurementEvent,
  UwbRangingResult,
  WifiRttResult,
} from '../packages/native/index.ts';
import { mergeUwbMeasurement, uwbRangingAfterEvent, uwbStartFailure } from '../packages/sdk/src/core/uwbSession.ts';
import { isWifiRttMeasured, wifiRttDistanceMeters } from '../packages/sdk/src/core/wifiRtt.ts';
import { perfettoStartOutcome, perfettoStopOutcome } from '../packages/sdk/src/core/perfettoTrace.ts';
import { nativeAppFunctionError } from '../packages/sdk/src/core/appFunctionResult.ts';

function uwbResult(over: Partial<UwbRangingResult>): UwbRangingResult {
  return {
    success: false,
    status: 'open_failed',
    error: null,
    sessionId: null,
    technology: 'UWB',
    serviceAvailable: true,
    serviceName: 'RangingManager',
    rangingFeature: true,
    timestampMs: 0,
    ...over,
  };
}

function sample(deviceId: string, distanceMeters: number | null): UwbMeasurementEvent {
  return {
    sessionId: 1,
    deviceId,
    distanceMeters,
    distanceConfidence: distanceMeters === null ? null : 'high',
    azimuthDegrees: null,
    azimuthConfidence: null,
    elevationDegrees: null,
    elevationConfidence: null,
    rssi: null,
    technology: 'UWB',
    timestampMs: 0,
  };
}

describe('useUWB: session state', () => {
  test('an opened session is not a failure', () => {
    assert.equal(uwbStartFailure(uwbResult({ success: true, status: 'opened', sessionId: 7 })), null);
  });

  test('refusals keep the status code and the platform reason', () => {
    assert.equal(
      uwbStartFailure(uwbResult({ status: 'needs_peer_configuration', error: 'peerAddress must be hex address bytes' })),
      'needs_peer_configuration: peerAddress must be hex address bytes',
    );
    assert.equal(uwbStartFailure(uwbResult({ status: 'uwb_unsupported', error: null })), 'uwb_unsupported');
  });

  test('success without the opened status is still a failure', () => {
    assert.notEqual(uwbStartFailure(uwbResult({ success: true, status: 'open_failed', error: 'x' })), null);
  });

  test('keeps the latest sample per peer and preserves arrival order', () => {
    let list: UwbMeasurementEvent[] = [];
    list = mergeUwbMeasurement(list, sample('a', 1.5));
    list = mergeUwbMeasurement(list, sample('b', 2.0));
    list = mergeUwbMeasurement(list, sample('a', 1.2));
    assert.deepEqual(list.map((m) => [m.deviceId, m.distanceMeters]), [['a', 1.2], ['b', 2.0]]);
  });

  test('merging does not mutate the previous list', () => {
    const first = [sample('a', 1)];
    mergeUwbMeasurement(first, sample('a', 2));
    assert.equal(first[0].distanceMeters, 1);
  });

  test('a null distance stays null instead of becoming zero', () => {
    const list = mergeUwbMeasurement([], sample('a', null));
    assert.equal(list[0].distanceMeters, null);
  });

  test('only a close or failed open ends the session; a peer stop does not', () => {
    assert.equal(uwbRangingAfterEvent(false, { state: 'opened' }), true);
    assert.equal(uwbRangingAfterEvent(false, { state: 'started' }), true);
    assert.equal(uwbRangingAfterEvent(true, { state: 'stopped' }), true);
    assert.equal(uwbRangingAfterEvent(true, { state: 'closed' }), false);
    assert.equal(uwbRangingAfterEvent(true, { state: 'open_failed' }), false);
  });
});

function rtt(over: Partial<WifiRttResult>): WifiRttResult {
  return {
    bssid: '00:11:22:33:44:55',
    status: 0,
    statusName: 'success',
    distanceMm: 1850,
    distanceStdDevMm: 40,
    rssi: -52,
    numAttemptedMeasurements: 8,
    numSuccessfulMeasurements: 8,
    timestampMs: 1,
    ...over,
  };
}

describe('useWifiRTT: results', () => {
  test('a successful access point converts millimeters to meters', () => {
    assert.equal(wifiRttDistanceMeters(rtt({})), 1.85);
  });

  test('a failed access point has no distance', () => {
    const failed = rtt({ status: 1, statusName: 'fail', distanceMm: null, distanceStdDevMm: null, rssi: null });
    assert.equal(isWifiRttMeasured(failed), false);
    assert.equal(wifiRttDistanceMeters(failed), null);
  });

  test('a responder without 802.11mc has no distance', () => {
    const noMc = rtt({ status: 2, statusName: 'responder_no_80211mc', distanceMm: null });
    assert.equal(wifiRttDistanceMeters(noMc), null);
  });

  test('a success status without a distance is not measured', () => {
    assert.equal(isWifiRttMeasured(rtt({ distanceMm: null })), false);
  });

  test('a very close device may report a negative distance and keeps it', () => {
    assert.equal(wifiRttDistanceMeters(rtt({ distanceMm: -20 })), -0.02);
  });
});

describe('usePerfetto: start and stop outcomes', () => {
  const started: PerfettoStartResult = {
    started: true,
    backend: 'profiling_manager',
    activeCategories: [],
    categoriesApplied: false,
    error: null,
  };

  test('a started trace reports the categories the backend really applied', () => {
    assert.deepEqual(perfettoStartOutcome(started), { started: true, activeCategories: [], error: null });
    assert.deepEqual(
      perfettoStartOutcome({ ...started, backend: 'perfetto_binary', activeCategories: ['sched'], categoriesApplied: true }).activeCategories,
      ['sched'],
    );
  });

  test('a trace that did not start carries the reason and no categories', () => {
    const out = perfettoStartOutcome({
      started: false,
      backend: null,
      activeCategories: ['sched'],
      categoriesApplied: false,
      error: 'cannot execute /system/bin/perfetto from the app process',
    });
    assert.equal(out.started, false);
    assert.deepEqual(out.activeCategories, []);
    assert.equal(out.error, 'cannot execute /system/bin/perfetto from the app process');
  });

  test('a start failure without a reason still reports an error', () => {
    assert.ok(perfettoStartOutcome({ ...started, started: false }).error);
  });

  test('a saved trace returns its path and size', () => {
    const out = perfettoStopOutcome({ stopped: true, path: '/data/trace.perfetto-trace', sizeBytes: 4096, error: null });
    assert.deepEqual(out, { path: '/data/trace.perfetto-trace', sizeBytes: 4096, error: null });
  });

  test('an empty file is never reported as a path', () => {
    const out = perfettoStopOutcome({ stopped: true, path: '/data/trace.perfetto-trace', sizeBytes: 0, error: 'Trace file is empty' });
    assert.equal(out.path, null);
    assert.equal(out.error, 'Trace file is empty');
  });

  test('no session yields no path and the native reason', () => {
    const res: PerfettoStopResult = { stopped: false, path: null, sizeBytes: null, error: 'No trace session is running' };
    assert.deepEqual(perfettoStopOutcome(res), { path: null, sizeBytes: null, error: 'No trace session is running' });
  });

  test('a missing path without a reason still reports an error', () => {
    assert.ok(perfettoStopOutcome({ stopped: true, path: null, sizeBytes: null, error: null }).error);
  });
});

describe('useAppFunctions: native results', () => {
  test('success is not an error', () => {
    const res: AppFunctionExecution = { status: 'success', executed: true };
    assert.equal(nativeAppFunctionError('triggerHapticEffect', res), null);
  });

  test('an error status returns the native message', () => {
    const res: AppFunctionExecution = { status: 'error', message: 'This vibrator does not support primitive thud' };
    assert.equal(nativeAppFunctionError('triggerHapticEffect', res), 'This vibrator does not support primitive thud');
  });

  test('an error status without a message names the function and status', () => {
    assert.equal(
      nativeAppFunctionError('setTorchLevel', { status: 'error' }),
      'AppFunction setTorchLevel reported status error',
    );
  });

  test('an unrecognised status is an error, not a dispatch', () => {
    const res = { status: 'dispatched' } as unknown as AppFunctionExecution;
    assert.equal(nativeAppFunctionError('x', res), 'AppFunction x reported status dispatched');
  });
});
