/**
 * @file useWifiRTT.ts
 * @description Fine Timing Measurement (FTM / 802.11az) indoor centimeter-level positioning
 * via Android WifiRttManager.
 *
 * Adheres to the Zero-Simulation Principle: isSupported: false, rangingResults: [],
 * and source: 'unavailable' when FTM hardware is missing or unsupported.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, {
  type WifiRttStatusResult,
  type WifiRttResult,
  type WifiRttUnresolvedBssid,
} from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { isWifiRttMeasured } from '../core/wifiRtt';

const MODULE = 'useWifiRTT';
export { type WifiRttResult, type WifiRttUnresolvedBssid };

export interface WifiRTTTelemetry {
  /** Whether the device hardware contains the Wi-Fi RTT (FTM) responder/initiator subsystem. */
  isSupported: boolean;
  /** Whether the Wi-Fi RTT ranging service is currently available (Wi-Fi and Location turned on). */
  isAvailable: boolean;
  /** Whether an active ranging sweep is currently in progress. */
  isRanging: boolean;
  /**
   * Per-AP results of the last ranging round. `distanceMm`, `distanceStdDevMm` and `rssi` are null
   * unless that AP's `status` is 0 (success).
   */
  rangingResults: WifiRttResult[];
  /** Error message if RTT service probing or ranging execution failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** BSSIDs of the last request that produced no measurement, each with the reason. */
  unresolvedBssids: WifiRttUnresolvedBssid[];
  /**
   * Runs one RTT ranging round against the given BSSIDs. Each BSSID must be an 802.11mc responder in the
   * latest Wi-Fi scan results; the ones that cannot be ranged appear in `unresolvedBssids` with the reason.
   * Resolves with the platform's per-AP results (empty on failure, with the reason in `error`).
   */
  startRanging: (bssids: string[]) => Promise<WifiRttResult[]>;
  /** Re-checks the availability status of the Wi-Fi RTT service. */
  refresh: () => void;
}

export function useWifiRTT(): WifiRTTTelemetry {
  const [data, setData] = useState<WifiRttStatusResult>({
    isSupported: false,
    isAvailable: false,
    isRanging: false,
    rangingResults: [],
    error: null,
  });

  const [isRanging, setIsRanging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolvedBssids, setUnresolvedBssids] = useState<WifiRttUnresolvedBssid[]>([]);

  const source: TelemetrySource =
    PixelNative && data.isSupported ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setData({
        isSupported: false,
        isAvailable: false,
        isRanging: false,
        rangingResults: [],
        error: 'PixelNative module unavailable',
      });
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getWifiRttStatus();
      setData(res);
      setError(res.error ?? null);
      logEvent(MODULE, 'queried wifi rtt status', {
        supported: res.isSupported,
        available: res.isAvailable,
      });
    } catch (e: any) {
      const err = logError(MODULE, 'getWifiRttStatus failed', e);
      setError(err.message);
    }
  }, []);

  const startRanging = useCallback(
    async (bssids: string[]): Promise<WifiRttResult[]> => {
      if (!PixelNative) {
        setError('PixelNative module unavailable');
        return [];
      }
      setIsRanging(true);
      try {
        const res = await traced(MODULE, 'startRanging', () => PixelNative!.startWifiRttRanging(bssids), {
          requested: bssids.length,
        });
        setData(res);
        setUnresolvedBssids(res.unresolvedBssids ?? []);
        setIsRanging(false);
        setError(res.error ?? null);
        const measured = res.rangingResults?.filter(isWifiRttMeasured).length ?? 0;
        recordMetric(MODULE, 'rangingSuccessCount', measured, 'hardware');
        logEvent(MODULE, 'completed wifi rtt ranging', {
          results: res.rangingResults?.length ?? 0,
          measured,
          unresolved: res.unresolvedBssids?.length ?? 0,
          failureCode: res.failureCode ?? null,
          error: res.error ?? null,
        }, res.error ? 'warn' : 'info');
        return res.rangingResults ?? [];
      } catch (e) {
        setIsRanging(false);
        const err = logError(MODULE, 'startWifiRttRanging failed', e);
        setError(err.message);
        return [];
      }
    },
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isSupported: data.isSupported,
    isAvailable: data.isAvailable,
    isRanging,
    rangingResults: data.rangingResults,
    unresolvedBssids,
    error,
    source,
    startRanging,
    refresh,
  };
}
