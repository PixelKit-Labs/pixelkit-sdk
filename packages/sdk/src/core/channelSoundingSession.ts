/**
 * @file channelSoundingSession.ts
 * @description Pure state helpers for BLE Channel Sounding ranging sessions. They only fold what the
 * native module reported (start result, session events, measurement events); they never produce a
 * value of their own.
 */

import type {
  ChannelSoundingMeasurementEvent,
  ChannelSoundingRangingResult,
  ChannelSoundingSessionEvent,
} from '@pixelkit-labs/native';

/**
 * The message to show when a start request did not open a session, or null when it did. Always
 * carries the status code so callers can tell `needs_peer_address` from `permission_denied`.
 */
export function channelSoundingStartFailure(
  result: Pick<ChannelSoundingRangingResult, 'success' | 'status' | 'error'>,
): string | null {
  if (result.success && result.status === 'opened') return null;
  return result.error ? `${result.status}: ${result.error}` : result.status;
}

/** Keeps the latest sample per peer address, in first-seen order. */
export function mergeChannelSoundingMeasurement(
  previous: readonly ChannelSoundingMeasurementEvent[],
  sample: ChannelSoundingMeasurementEvent,
): ChannelSoundingMeasurementEvent[] {
  const index = previous.findIndex((m) => m.deviceAddress === sample.deviceAddress);
  if (index === -1) return [...previous, sample];
  const next = previous.slice();
  next[index] = sample;
  return next;
}

/**
 * Whether a session is running after this lifecycle event. `opened` and `started` mean the platform
 * holds a session; `closed` and `open_failed` mean it does not. `stopped` (the peer stopped) does
 * not change the answer: only a close ends the session.
 */
export function channelSoundingRangingAfterEvent(
  wasRanging: boolean,
  event: Pick<ChannelSoundingSessionEvent, 'state'>,
): boolean {
  switch (event.state) {
    case 'opened':
    case 'started':
      return true;
    case 'closed':
    case 'open_failed':
      return false;
    default:
      return wasRanging;
  }
}
