/**
 * @file useChannelSounding.ts
 * @description Bluetooth LE Channel Sounding state and ranging sessions.
 * The probe reads the `android.hardware.bluetooth_le.channel_sounding` feature flag, the ranging HAL
 * service lookup, the Bluetooth adapter state, and `RangingManager`'s availability and supported CS
 * security levels. Ranging opens a real `android.ranging.RangingSession` (Android 16, API 36+) with a
 * `BleCsRangingParams` peer whose Bluetooth address the caller supplies; every measurement is an
 * `android.ranging.RangingData` sample delivered by the platform. `RangingData` does not report whether
 * phase-based ranging or round-trip time produced a sample, so no method or precision is claimed.
 * Without a peer address, or when the platform refuses, no session is opened and the reason is reported.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, {
  type ChannelSoundingAvailability,
  type ChannelSoundingCapabilities,
  type ChannelSoundingInfo,
  type ChannelSoundingMeasurementEvent,
  type ChannelSoundingRangingConfig,
  type ChannelSoundingRangingResult,
  type ChannelSoundingStopResult,
} from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import {
  channelSoundingRangingAfterEvent,
  channelSoundingStartFailure,
  mergeChannelSoundingMeasurement,
} from '../core/channelSoundingSession';

const MODULE = 'useChannelSounding';

export type {
  ChannelSoundingAvailability,
  ChannelSoundingCapabilities,
  ChannelSoundingInfo,
  ChannelSoundingMeasurementEvent,
  ChannelSoundingRangingConfig,
  ChannelSoundingRangingResult,
  ChannelSoundingStopResult,
} from '@pixelkit-labs/native';

export interface ChannelSoundingState {
  /** Whether the device declares `android.hardware.bluetooth_le.channel_sounding` */
  isSupported: boolean;
  /** Whether the feature is declared and the Bluetooth adapter is on */
  isEnabled: boolean;
  /** Whether the ranging HAL service lookup found a service */
  serviceFound: boolean;
  /** `RangingManager` availability for BLE Channel Sounding; null until read or when the platform did not report it */
  rangingAvailability: ChannelSoundingAvailability | null;
  /** Security levels from `BleCsRangingCapabilities` (1 and/or 4); null when the platform did not report them */
  supportedSecurityLevels: number[] | null;
  /** Whether the platform holds an open ranging session */
  isRanging: boolean;
  /** Latest platform measurement per peer; empty until the peer answers */
  measurements: ChannelSoundingMeasurementEvent[];
  /** Result of the last start request: status, reason, service availability */
  sessionInfo: ChannelSoundingRangingResult | null;
  /** Last session error message (status code and reason) */
  sessionError: string | null;
  /** Latest error message if an operation failed */
  error: string | null;
  /** Telemetry provenance */
  source: TelemetrySource;
  /** Open a Channel Sounding session with the peer at `config.peerAddress`; true only when the platform opened it */
  startRanging: (config: ChannelSoundingRangingConfig) => Promise<boolean>;
  /** Close the ranging session; null when the native module is unavailable */
  stopRanging: () => ChannelSoundingStopResult | null;
  /** Re-probe the feature flag, HAL service and adapter state */
  refresh: () => ChannelSoundingInfo | null;
}

/**
 * Hook to inspect BLE Channel Sounding availability and range a Bluetooth peer through
 * `android.ranging`.
 *
 * @example
 * ```typescript
 * const { isSupported, measurements, startRanging, stopRanging, sessionError } = useChannelSounding();
 * // The peer must be a Bluetooth device that supports Channel Sounding; its address is yours to supply.
 * const opened = await startRanging({ peerAddress: 'AA:BB:CC:DD:EE:FF' });
 * ```
 */
export function useChannelSounding(): ChannelSoundingState {
  const [data, setData] = useState<ChannelSoundingInfo | null>(null);
  const [capabilities, setCapabilities] = useState<ChannelSoundingCapabilities | null>(null);
  const [isRanging, setIsRanging] = useState<boolean>(false);
  const [measurements, setMeasurements] = useState<ChannelSoundingMeasurementEvent[]>([]);
  const [sessionInfo, setSessionInfo] = useState<ChannelSoundingRangingResult | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): ChannelSoundingInfo | null => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; channel sounding unavailable', undefined, 'warn');
      return null;
    }
    try {
      const info = PixelNative.getChannelSoundingInfo();
      setData(info);
      setError(info.error ?? null);
      recordMetric(MODULE, 'isSupported', info.isSupported ? 1 : 0, info.isSupported ? 'hardware' : 'unavailable');
      logEvent(MODULE, 'channel sounding queried', {
        isSupported: info.isSupported,
        isEnabled: info.isEnabled,
        serviceFound: info.serviceFound,
      });
      return info;
    } catch (e) {
      const msg = logError(MODULE, 'getChannelSoundingInfo failed', e).message;
      setError(msg);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!PixelNative?.getChannelSoundingCapabilities) return;
    let cancelled = false;
    traced(MODULE, 'getCapabilities', () => PixelNative!.getChannelSoundingCapabilities())
      .then((caps) => {
        if (!cancelled) setCapabilities(caps);
      })
      .catch((e) => {
        logError(MODULE, 'getChannelSoundingCapabilities failed', e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!PixelNative?.addListener) return;
    try {
      // A session started by an earlier mount may still be running in the native module.
      const state = PixelNative.getChannelSoundingState?.();
      if (state) setIsRanging(state.active);
    } catch (e) {
      logError(MODULE, 'getChannelSoundingState failed', e);
    }
    const resultSub = PixelNative.addListener('onChannelSoundingResult', (sample) => {
      setMeasurements((prev) => mergeChannelSoundingMeasurement(prev, sample));
      recordMetric(MODULE, 'distanceMeters', sample.distanceMeters, sample.distanceMeters == null ? 'unavailable' : 'hardware');
    });
    const stateSub = PixelNative.addListener('onChannelSoundingState', (event) => {
      setIsRanging((prev) => channelSoundingRangingAfterEvent(prev, event));
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
   * Opens a Channel Sounding session with the peer at `config.peerAddress`. Resolves true only when
   * the platform reported the session open; otherwise false, with the status and reason in
   * `sessionError` (for example `needs_peer_address`, `channel_sounding_unsupported`,
   * `bluetooth_disabled`, `permission_denied`).
   */
  const startRanging = useCallback(async (config: ChannelSoundingRangingConfig): Promise<boolean> => {
    setSessionError(null);
    setError(null);
    if (!PixelNative?.startChannelSounding) {
      const message = 'Native Channel Sounding ranging service not available';
      setSessionError(message);
      setError(message);
      return false;
    }

    try {
      const res = await traced(MODULE, 'startRanging', () => PixelNative!.startChannelSounding(config), {
        peerAddress: config?.peerAddress,
        role: config?.role,
      });
      setSessionInfo(res);
      const failure = channelSoundingStartFailure(res);
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
      const message = logError(MODULE, 'startRanging failed', e, { peerAddress: config?.peerAddress }).message;
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
  const stopRanging = useCallback((): ChannelSoundingStopResult | null => {
    if (!PixelNative?.stopChannelSounding) {
      setSessionError('Native Channel Sounding ranging service not available');
      return null;
    }
    try {
      const res = PixelNative.stopChannelSounding();
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

  const source: TelemetrySource =
    PixelNative && data?.isSupported ? 'hardware' : 'unavailable';

  return {
    isSupported: data?.isSupported ?? false,
    isEnabled: data?.isEnabled ?? false,
    serviceFound: data?.serviceFound ?? false,
    rangingAvailability: capabilities?.availability ?? null,
    supportedSecurityLevels: capabilities?.supportedSecurityLevels ?? null,
    isRanging,
    measurements,
    sessionInfo,
    sessionError,
    error,
    source,
    startRanging,
    stopRanging,
    refresh,
  };
}
