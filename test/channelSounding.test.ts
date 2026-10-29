/**
 * @file channelSounding.test.ts
 * @description Unit tests for the pure logic behind useChannelSounding: every helper reports only
 * what the native module returned and turns anything else into an error, never a placeholder value.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ChannelSoundingMeasurementEvent,
  ChannelSoundingRangingResult,
} from '../packages/native/index.ts';
import {
  channelSoundingRangingAfterEvent,
  channelSoundingStartFailure,
  mergeChannelSoundingMeasurement,
} from '../packages/sdk/src/core/channelSoundingSession.ts';

function startResult(over: Partial<ChannelSoundingRangingResult>): ChannelSoundingRangingResult {
  return {
    success: false,
    status: 'open_failed',
    error: null,
    sessionId: null,
    peerAddress: null,
    technology: 'BLE_CS',
    serviceAvailable: true,
    serviceName: 'RangingManager',
    channelSoundingFeature: true,
    timestampMs: 0,
    ...over,
  };
}

function sample(deviceAddress: string, distanceMeters: number | null): ChannelSoundingMeasurementEvent {
  return {
    sessionId: 1,
    deviceAddress,
    distanceMeters,
    confidence: distanceMeters === null ? null : 'high',
    rssi: null,
    timestampMs: 0,
  };
}

describe('useChannelSounding: session state', () => {
  test('an opened session is not a failure', () => {
    assert.equal(channelSoundingStartFailure(startResult({ success: true, status: 'opened', sessionId: 3 })), null);
  });

  test('refusals keep the status code and the platform reason', () => {
    assert.equal(
      channelSoundingStartFailure(startResult({ status: 'needs_peer_address', error: 'peerAddress is required' })),
      'needs_peer_address: peerAddress is required',
    );
    assert.equal(channelSoundingStartFailure(startResult({ status: 'channel_sounding_unsupported', error: null })), 'channel_sounding_unsupported');
  });

  test('success without the opened status is still a failure', () => {
    assert.notEqual(channelSoundingStartFailure(startResult({ success: true, status: 'open_failed', error: 'x' })), null);
  });

  test('opened without success is still a failure', () => {
    assert.notEqual(channelSoundingStartFailure(startResult({ success: false, status: 'opened' })), null);
  });

  test('keeps the latest sample per peer address and preserves arrival order', () => {
    let list: ChannelSoundingMeasurementEvent[] = [];
    list = mergeChannelSoundingMeasurement(list, sample('AA:BB:CC:DD:EE:01', 1.5));
    list = mergeChannelSoundingMeasurement(list, sample('AA:BB:CC:DD:EE:02', 2.0));
    list = mergeChannelSoundingMeasurement(list, sample('AA:BB:CC:DD:EE:01', 1.2));
    assert.deepEqual(list.map((m) => [m.deviceAddress, m.distanceMeters]), [
      ['AA:BB:CC:DD:EE:01', 1.2],
      ['AA:BB:CC:DD:EE:02', 2.0],
    ]);
  });

  test('merging does not mutate the previous list', () => {
    const first = [sample('AA:BB:CC:DD:EE:01', 1)];
    mergeChannelSoundingMeasurement(first, sample('AA:BB:CC:DD:EE:01', 2));
    assert.equal(first[0].distanceMeters, 1);
  });

  test('a null distance stays null instead of becoming zero', () => {
    const list = mergeChannelSoundingMeasurement([], sample('AA:BB:CC:DD:EE:01', null));
    assert.equal(list[0].distanceMeters, null);
    assert.equal(list[0].confidence, null);
  });

  test('only a close or failed open ends the session; a peer stop does not', () => {
    assert.equal(channelSoundingRangingAfterEvent(false, { state: 'opened' }), true);
    assert.equal(channelSoundingRangingAfterEvent(false, { state: 'started' }), true);
    assert.equal(channelSoundingRangingAfterEvent(true, { state: 'stopped' }), true);
    assert.equal(channelSoundingRangingAfterEvent(false, { state: 'stopped' }), false);
    assert.equal(channelSoundingRangingAfterEvent(true, { state: 'closed' }), false);
    assert.equal(channelSoundingRangingAfterEvent(true, { state: 'open_failed' }), false);
  });
});
