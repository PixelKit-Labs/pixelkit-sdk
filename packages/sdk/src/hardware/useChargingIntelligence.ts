/**
 * @file useChargingIntelligence.ts
 * @description In-depth battery health, physical charge cycles, manufacturing metadata,
 * and high-wattage charging classification (USB-PD PPS).
 *
 * Adheres to the Zero-Simulation Principle: values are null and source is 'unavailable'
 * if health stats or cycle counts are unreadable on the device platform.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, {
  type ChargingIntelligence,
  type ChargingTier,
} from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useChargingIntelligence';
export { type ChargingTier };

export interface ChargingIntelligenceTelemetry {
  /** Maximum battery capacity relative to factory design capacity (0-100%), or null if unreadable. */
  stateOfHealthPercent: number | null;
  /** Lifetime physical charge cycles completed by the battery cell, or null. */
  cycleCount: number | null;
  /** Factory manufacture date of the battery pack (YYYY-MM-DD or timestamp), or null. */
  manufactureDate: string | null;
  /** First usage / activation date of the battery cell, or null. */
  firstUsageDate: string | null;
  /** Real-time charging wattage delivered to the battery, or null if discharging. */
  chargingWattage: number | null;
  /** Classification of `chargingWattage` ('slow', 'standard', 'rapid', 'ultra_rapid'); null when no wattage was read. */
  chargingTier: ChargingTier | null;
  /** Whether the `charge_limit_available` sysfs node reads "1"; null when unreadable. The node says the limit is offered, not that it is on. */
  chargeLimitAvailable: boolean | null;
  /** Error message if battery telemetry query failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Refreshes the battery health and charging telemetry. */
  refresh: () => void;
}

export function useChargingIntelligence(): ChargingIntelligenceTelemetry {
  const [data, setData] = useState<ChargingIntelligence>({
    stateOfHealthPercent: null,
    cycleCount: null,
    manufactureDate: null,
    firstUsageDate: null,
    chargingWattage: null,
    chargingTier: null,
    chargeLimitAvailable: null,
    error: null,
  });

  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    PixelNative && (data.cycleCount !== null || data.stateOfHealthPercent !== null) ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setData({
        stateOfHealthPercent: null,
        cycleCount: null,
        manufactureDate: null,
        firstUsageDate: null,
        chargingWattage: null,
        chargingTier: null,
        chargeLimitAvailable: null,
        error: 'PixelNative module unavailable',
      });
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getChargingIntelligence();
      setData(res);
      setError(res.error ?? null);

      if (res.stateOfHealthPercent !== null) {
        recordMetric(MODULE, 'stateOfHealthPercent', res.stateOfHealthPercent, 'hardware');
      }
      if (res.cycleCount !== null) {
        recordMetric(MODULE, 'cycleCount', res.cycleCount, 'hardware');
      }
      logEvent(MODULE, 'queried charging intelligence', {
        soh: res.stateOfHealthPercent,
        cycles: res.cycleCount,
        tier: res.chargingTier,
      });
    } catch (e: any) {
      const err = logError(MODULE, 'getChargingIntelligence failed', e);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stateOfHealthPercent: data.stateOfHealthPercent,
    cycleCount: data.cycleCount,
    manufactureDate: data.manufactureDate,
    firstUsageDate: data.firstUsageDate,
    chargingWattage: data.chargingWattage,
    chargingTier: data.chargingTier,
    chargeLimitAvailable: data.chargeLimitAvailable,
    error,
    source,
    refresh,
  };
}
