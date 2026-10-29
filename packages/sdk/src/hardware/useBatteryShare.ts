/**
 * @file useBatteryShare.ts
 * @description Google Pixel Battery Share (reverse wireless Qi charging) state and toggle.
 * State is the contents of the `reverse_chg_mode` sysfs node (non-zero means the coil is on); the
 * toggle writes that node when the app is permitted to, and reports false otherwise. Receiver
 * presence, delivered watts and a charge cutoff are not exposed by any readable node, so the hook
 * reports none of them.
 *
 * Adheres to the Zero-Simulation Principle: returns isSupported: false and source: 'unavailable'
 * if the sysfs node is absent or unreadable.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, { type BatteryShareStatus } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useBatteryShare';

export interface BatteryShareTelemetry {
  /** Whether a readable reverse charging sysfs node exists on this device. */
  isSupported: boolean;
  /** Whether the node reports the reverse charging coil as on (non-zero mode). */
  isActive: boolean;
  /** Power transmitted in watts (W); null because no readable node reports it. */
  transmittedWatts: number | null;
  /** Error message if query or toggle failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Writes the reverse charging node on or off; false when the app may not write it. Re-reads the node afterwards. */
  setBatteryShare: (enabled: boolean) => Promise<boolean>;
  /** Re-reads the reverse charging node and returns what was read, or null when the read failed or the native module is absent. */
  refresh: () => BatteryShareStatus | null;
}

export function useBatteryShare(): BatteryShareTelemetry {
  const [status, setStatus] = useState<BatteryShareStatus>({
    isSupported: false,
    isActive: false,
    transmittedWatts: null,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    PixelNative && status.isSupported ? 'hardware' : 'unavailable';

  const refresh = useCallback((): BatteryShareStatus | null => {
    if (!PixelNative) {
      setStatus({
        isSupported: false,
        isActive: false,
        transmittedWatts: null,
        error: 'PixelNative module unavailable',
      });
      setError('PixelNative module unavailable');
      return null;
    }

    try {
      const res = PixelNative.getBatteryShareStatus();
      setStatus(res);
      setError(res.error ?? null);

      if (res.transmittedWatts !== null) {
        recordMetric(MODULE, 'transmittedWatts', res.transmittedWatts, 'hardware');
      }
      logEvent(MODULE, 'queried battery share status', {
        supported: res.isSupported,
        active: res.isActive,
      });
      return res;
    } catch (e) {
      const err = logError(MODULE, 'getBatteryShareStatus failed', e);
      setError(err.message);
      return null;
    }
  }, []);

  const setBatteryShare = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!PixelNative) return false;
    try {
      const success = await PixelNative.setBatteryShareEnabled(enabled);
      logEvent(MODULE, 'toggled battery share', { enabled, written: success });
      refresh();
      return success;
    } catch (e) {
      logError(MODULE, 'setBatteryShareEnabled failed', e);
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isSupported: status.isSupported,
    isActive: status.isActive,
    transmittedWatts: status.transmittedWatts,
    error,
    source,
    setBatteryShare,
    refresh,
  };
}
