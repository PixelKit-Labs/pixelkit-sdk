/**
 * @file useUWB.ts
 * @description Ultra-Wideband (UWB) radio state and ranging sessions.
 * Radio presence comes from PackageManager / UwbManager. Ranging opens a real
 * `android.ranging.RangingSession` (Android 16, API 36+) with a peer whose address and channel
 * parameters the caller supplies; every measurement is an `android.ranging.RangingData` sample
 * delivered by the platform. Without a peer, or when the platform refuses, the session is not
 * opened and the reason is reported.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, {
  type UwbMeasurementEvent,
  type UwbRangingConfig,
  type UwbRangingResult,
  type UwbStopResult,
} from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { mergeUwbMeasurement, uwbRangingAfterEvent, uwbStartFailure } from '../core/uwbSession';

export type { UwbMeasurementEvent, UwbRangingConfig, UwbRangingResult, UwbStopResult } from '@pixelkit-labs/native';

const MODULE = 'useUWB';

/**
 * Hook to inspect hardware UWB transceiver state and run ranging sessions against a peer.
 *
 * @returns Radio status, session diagnostics, the latest measurement per peer, and ranging controls.
 *
 * @example
 * ```typescript
 * const { isRanging, measurements, startRanging, stopRanging, sessionError } = useUWB();
 * // The peer's address, session id and channel come from your out-of-band exchange.
 * const opened = await startRanging({
 *   sessionId: 4242,
 *   role: 'initiator',
 *   localAddress: '0x1234',
 *   peerAddress: '0xABCD',
 *   channel: 9,
 *   preambleIndex: 10,
 * });
 * ```
 */
export function useUWB() {
  const [isRanging, setIsRanging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [measurements, setMeasurements] = useState<UwbMeasurementEvent[]>([]);
  const [sessionInfo, setSessionInfo] = useState<UwbRangingResult | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const nativeInfo = PixelNative?.getRadioInfo?.()?.uwb;
  const isSupported = nativeInfo?.supported ?? false;
  const isEnabled = nativeInfo?.enabled ?? false;
  const chipId = nativeInfo?.chipId ?? (isSupported ? 'default' : null);
  const rangingApiSupported = nativeInfo?.rangingApiSupported ?? false;

  // Genuine hardware provenance
  const source: TelemetrySource = PixelNative && isSupported ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative?.addListener) return;
    try {
      // A session started by an earlier mount may still be running in the native module.
      const state = PixelNative.getUwbRangingState?.();
      if (state) setIsRanging(state.active);
    } catch (e) {
      logError(MODULE, 'getUwbRangingState failed', e);
    }
    const resultSub = PixelNative.addListener('onUwbRangingResult', (sample) => {
      setMeasurements((prev) => mergeUwbMeasurement(prev, sample));
      recordMetric(MODULE, 'distanceMeters', sample.distanceMeters, sample.distanceMeters == null ? 'unavailable' : 'hardware');
    });
    const stateSub = PixelNative.addListener('onUwbRangingState', (event) => {
      setIsRanging((prev) => uwbRangingAfterEvent(prev, event));
      logEvent(MODULE, 'session state', {
        sessionId: event.sessionId,
        state: event.state,
        reason: event.reason,
      });
    });
    return () => {
      resultSub.remove();
      stateSub.remove();
    };
  }, []);

  /**
   * Opens a ranging session with the peer described by `config`. Resolves true only when the
   * platform reported the session open; otherwise false, with the status and reason in
   * `sessionError` (for example `needs_peer_configuration`, `uwb_unsupported`, `permission_denied`).
   */
  const startRanging = useCallback(async (config: UwbRangingConfig): Promise<boolean> => {
    setSessionError(null);
    setError(null);
    if (!PixelNative?.startUwbRanging) {
      const message = 'Native UWB ranging service not available';
      setSessionError(message);
      setError(message);
      return false;
    }

    try {
      const res = await traced(MODULE, 'startRanging', () => PixelNative!.startUwbRanging(config), {
        sessionId: config?.sessionId,
        role: config?.role,
      });
      setSessionInfo(res);
      const failure = uwbStartFailure(res);
      if (failure) {
        logEvent(MODULE, 'ranging not started', { status: res.status, reason: res.error }, 'warn');
        setSessionError(failure);
        setError(failure);
        setIsRanging(res.status === 'session_active');
        return false;
      }
      setMeasurements([]);
      setIsRanging(true);
      return true;
    } catch (e) {
      const message = logError(MODULE, 'startRanging failed', e, { sessionId: config?.sessionId }).message;
      setSessionError(message);
      setError(message);
      setIsRanging(false);
      return false;
    }
  }, []);

  /**
   * Closes the running session. The returned `wasActive` is false when nothing was running; a close
   * error is reported in `sessionError` and in the result.
   */
  const stopRanging = useCallback((): UwbStopResult | null => {
    if (!PixelNative?.stopUwbRanging) {
      setSessionError('Native UWB ranging service not available');
      return null;
    }
    try {
      const res = PixelNative.stopUwbRanging();
      logEvent(MODULE, 'ranging stopped', { wasActive: res.wasActive, closed: res.closed, sessionId: res.sessionId });
      if (res.error) {
        setSessionError(`close failed: ${res.error}`);
        setError(`close failed: ${res.error}`);
      }
      setIsRanging(false);
      return res;
    } catch (e) {
      const message = logError(MODULE, 'stopRanging failed', e).message;
      setSessionError(message);
      setError(message);
      return null;
    }
  }, []);

  return {
    /** Whether UWB chip is present on device */
    isSupported,
    /** Whether UWB radio is enabled in system settings */
    isEnabled,
    /** Chip identifier from the radio probe */
    chipId,
    /** Whether the Android 16 RangingManager feature is declared */
    rangingApiSupported,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Hardware provenance of the radio telemetry */
    source,
    /** Whether the platform holds an open ranging session */
    isRanging,
    /** Latest platform measurement per peer device; empty until the peer answers */
    measurements,
    /** Result of the last start request: status, reason, service availability */
    sessionInfo,
    /** Last session error message (status code and reason) */
    sessionError,
    /** Open a ranging session with a peer */
    startRanging,
    /** Close the ranging session */
    stopRanging,
  };
}
