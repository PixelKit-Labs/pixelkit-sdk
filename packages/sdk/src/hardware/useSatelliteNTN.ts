/**
 * @file useSatelliteNTN.ts
 * @description Satellite messaging support. `isSupported` is the `android.hardware.telephony.satellite`
 * system feature. Android's public `SatelliteManager` exposes no connection state, carrier, signal or
 * emergency-readiness read, so those fields are null and `unreadReason` says why.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, {
  type SatelliteStatusResult,
  type SatelliteGuidance,
} from '@pixelkit-labs/native';
import { logEvent, logError, type TelemetrySource } from '../core/observability';

const MODULE = 'useSatelliteNTN';
export { type SatelliteGuidance };

export type SatelliteConnectionState = 'disconnected' | 'searching' | 'connected' | 'pointing_assist';

export interface SatelliteNTNTechTelemetry {
  /** Whether the device declares the `android.hardware.telephony.satellite` system feature. */
  isSupported: boolean;
  /** Always null: Android's public API exposes no satellite connection state. */
  connectionState: SatelliteConnectionState | null;
  /** Always null: Android's public API exposes no satellite carrier. */
  carrier: string | null;
  /** Always null: Android's public API exposes no satellite signal strength. */
  signalQualityBars: number | null;
  /** Always null: Android's public API exposes no satellite pointing data. */
  pointingGuidance: SatelliteGuidance | null;
  /** Always null: Android's public API exposes no satellite emergency readiness. */
  emergencyServicesReady: boolean | null;
  /** Why the null fields are null; null before the first read. */
  unreadReason: string | null;
  /** Error message if the query failed. */
  error: string | null;
  /** 'hardware' when the feature flag says satellite is supported, 'unavailable' otherwise. */
  source: TelemetrySource;
  /** Re-reads the system feature. */
  refresh: () => void;
}

const EMPTY: SatelliteStatusResult = {
  isSupported: false,
  connectionState: null,
  carrier: null,
  signalQualityBars: null,
  pointingGuidance: null,
  emergencyServicesReady: null,
  unreadReason: '',
  error: null,
};

export function useSatelliteNTN(): SatelliteNTNTechTelemetry {
  const [data, setData] = useState<SatelliteStatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = data ?? EMPTY;
  const source: TelemetrySource =
    PixelNative && current.isSupported ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setData(null);
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getSatelliteStatus();
      setData(res);
      setError(res.error ?? null);
      logEvent(MODULE, 'queried satellite support', { supported: res.isSupported });
    } catch (e) {
      const err = logError(MODULE, 'getSatelliteStatus failed', e);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isSupported: current.isSupported,
    connectionState: current.connectionState,
    carrier: current.carrier,
    signalQualityBars: current.signalQualityBars,
    pointingGuidance: current.pointingGuidance,
    emergencyServicesReady: current.emergencyServicesReady,
    unreadReason: data ? data.unreadReason : null,
    error,
    source,
    refresh,
  };
}
