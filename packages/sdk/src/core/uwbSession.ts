/**
 * @file uwbSession.ts
 * @description Pure state helpers for UWB ranging sessions. They only fold what the native module
 * reported (start result, session events, measurement events); they never produce a value of
 * their own.
 */

import type {
  UwbMeasurementEvent,
  UwbRangingResult,
  UwbSessionEvent,
} from '@pixelkit-labs/native';

/**
 * The message to show when a start request did not open a session, or null when it did. Always
 * carries the status code so callers can tell `needs_peer_configuration` from `permission_denied`.
 */
export function uwbStartFailure(result: Pick<UwbRangingResult, 'success' | 'status' | 'error'>): string | null {
  if (result.success && result.status === 'opened') return null;
  return result.error ? `${result.status}: ${result.error}` : result.status;
}

/** Keeps the latest sample per peer device, in first-seen order. */
export function mergeUwbMeasurement(
  previous: readonly UwbMeasurementEvent[],
  sample: UwbMeasurementEvent,
): UwbMeasurementEvent[] {
  const index = previous.findIndex((m) => m.deviceId === sample.deviceId);
  if (index === -1) return [...previous, sample];
  const next = previous.slice();
  next[index] = sample;
  return next;
}

/**
 * Whether a session is running after this lifecycle event. `opened` and `started` mean the platform
 * holds a session; `closed` and `open_failed` mean it does not. `stopped` (one peer stopped) does
 * not change the answer: only a close ends the session.
 */
export function uwbRangingAfterEvent(wasRanging: boolean, event: Pick<UwbSessionEvent, 'state'>): boolean {
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
