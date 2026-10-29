/**
 * @file useNetwork.ts
 * @description Connectivity, address and airplane mode from `expo-network`; `isMetered` from
 * `PixelNative.getNetworkMetered()` (ConnectivityManager network capabilities).
 *
 * Being attached to Wi-Fi is not the same as having internet, so `isConnected` requires both a
 * connection and a reachable route. Nothing is assumed before the first read: the type is UNKNOWN
 * and `isConnected` is false until the platform answers, rather than optimistically claiming
 * a working connection the app has not verified.
 *
 * For what kind of cellular connection this is, and which carrier, see `useCellular`.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Network from 'expo-network';
import PixelNative from '@pixelkit-labs/native';
import { logEvent, logError, tracedSafe, traced, type TelemetrySource } from '../core/observability';
import { NetworkTelemetry } from '../core/types';

const MODULE = 'useNetwork';

export function useNetwork() {
  const [network, setNetwork] = useState<NetworkTelemetry>({
    ipAddress: null,
    networkType: 'UNKNOWN',
    isConnected: false,
    isMetered: null,
    isAirplaneMode: null,
  });
  const [hasRead, setHasRead] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasRead ? 'hardware' : 'unavailable';

  /** Re-reads connectivity. Each sub-read fails independently so one missing value does not blank the rest. */
  const refreshNetwork = useCallback(async (): Promise<void> => {
    setIsChecking(true);
    try {
      const [ip, state, airplane, metered] = await traced(MODULE, 'read', () => Promise.all([
        tracedSafe(MODULE, 'readIpAddress', () => Network.getIpAddressAsync(), null),
        tracedSafe(MODULE, 'readState', () => Network.getNetworkStateAsync(), null),
        tracedSafe<boolean | null>(MODULE, 'readAirplaneMode', () => Network.isAirplaneModeEnabledAsync(), null),
        tracedSafe<boolean | null>(MODULE, 'readMetered', async () => PixelNative?.getNetworkMetered?.() ?? null, null),
      ]));

      const next: NetworkTelemetry = {
        ipAddress: ip,
        networkType: state?.type ?? 'UNKNOWN',
        // Attached is not the same as reachable; require both.
        isConnected: !!state?.isConnected && state?.isInternetReachable !== false,
        isMetered: metered,
        isAirplaneMode: airplane,
      };
      setNetwork(next);
      setHasRead(true);
      setError(null);
      logEvent(MODULE, 'state', {
        type: next.networkType,
        connected: next.isConnected,
        metered: next.isMetered,
        airplane: next.isAirplaneMode,
        hasIp: next.ipAddress != null,
      });
    } catch (e) {
      setError(logError(MODULE, 'read failed', e).message);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => { void refreshNetwork(); }, [refreshNetwork]);

  return {
    ...network,
    /** Whether a read has completed. Before it, the values are defaults and `source` is unavailable. */
    hasRead,
    /** True while a check is running. */
    isChecking,
    /** Why the last read failed. */
    error,
    source,
    /** Re-run the connectivity check. */
    refreshNetwork,
  };
}
