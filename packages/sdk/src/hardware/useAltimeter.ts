/**
 * @file useAltimeter.ts
 * @description Precision barometric altimetry, vertical velocity (climb/descent rate),
 * pressure trend analysis, and QNH sea-level calibration derived from the hardware barometer.
 *
 * Adheres to the Zero-Simulation Principle: values are null and source is 'unavailable'
 * if the device lacks a hardware barometer or before the first sample arrives.
 * Altitude is computed using the international ICAO standard atmospheric formula:
 *   h = 44330 * (1 - (P / P0)^0.1903)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Barometer } from 'expo-sensors';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';
import {
  STANDARD_SEA_LEVEL_HPA,
  calculateAltitudeM,
  calculateAltitudeFt,
  calculatePressureTrend,
  type PressureTrend,
} from '../core/altimeterMath';

const MODULE = 'useAltimeter';
export { STANDARD_SEA_LEVEL_HPA, type PressureTrend };
const EWMA_ALPHA = 0.25;

export interface AltimeterTelemetry {
  /** Current barometric altitude in meters above calibrated sea level, or null. */
  altitudeM: number | null;
  /** Current barometric altitude in feet above calibrated sea level, or null. */
  altitudeFt: number | null;
  /** Vertical velocity (rate of climb / descent) in meters per second (m/s), or null. */
  verticalVelocityMs: number | null;
  /** Raw atmospheric pressure in hectopascals (hPa / mbar), or null. */
  pressureHpa: number | null;
  /** Calibrated reference sea-level pressure (QNH) in hPa. Defaults to 1013.25. */
  seaLevelPressureHpa: number;
  /** Pressure change extrapolated to hPa/hour over the last up-to-60 s of samples. Null until at least 5 samples spanning 10 s exist. */
  pressureTrend: PressureTrend | null;
  /** Whether the device has an active hardware barometer. */
  isAvailable: boolean;
  /** Error message if sensor access or subscription failed. */
  error: string | null;
  /** Provenance of the data: 'derived' from hardware barometer, or 'unavailable'. */
  source: TelemetrySource;
  /** Calibrates the sea-level reference pressure (QNH) in hPa to zero out local elevation. */
  calibrateSeaLevel: (hPa: number) => void;
  /** Resets sea-level pressure calibration back to the standard 1013.25 hPa. */
  resetCalibration: () => void;
}

/**
 * Hook providing precision barometric altimetry, climb/descent rate, and atmospheric trends.
 *
 * @param updateIntervalMs Sampling period in milliseconds (default 100ms).
 */
export function useAltimeter(updateIntervalMs: number = 100): AltimeterTelemetry {
  const [altitudeM, setAltitudeM] = useState<number | null>(null);
  const [altitudeFt, setAltitudeFt] = useState<number | null>(null);
  const [verticalVelocityMs, setVerticalVelocityMs] = useState<number | null>(null);
  const [pressureHpa, setPressureHpa] = useState<number | null>(null);
  const [seaLevelPressureHpa, setSeaLevelPressureHpa] = useState<number>(STANDARD_SEA_LEVEL_HPA);
  const [pressureTrend, setPressureTrend] = useState<PressureTrend | null>(null);
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSample, setHasSample] = useState<boolean>(false);

  const seaLevelRef = useRef<number>(STANDARD_SEA_LEVEL_HPA);
  seaLevelRef.current = seaLevelPressureHpa;

  // History buffer for velocity & trend calculation
  const historyRef = useRef<Array<{ time: number; alt: number; pressure: number }>>([]);
  const velocityRef = useRef<number | null>(null);

  const calibrateSeaLevel = useCallback((hPa: number) => {
    if (typeof hPa !== 'number' || isNaN(hPa) || hPa <= 0) {
      logError(MODULE, 'invalid sea-level pressure calibration', new Error(`Invalid hPa: ${hPa}`));
      return;
    }
    const cleanHpa = Number(hPa.toFixed(2));
    setSeaLevelPressureHpa(cleanHpa);
    seaLevelRef.current = cleanHpa;
    logEvent(MODULE, 'calibrated sea-level pressure', { hPa: cleanHpa });
  }, []);

  const resetCalibration = useCallback(() => {
    setSeaLevelPressureHpa(STANDARD_SEA_LEVEL_HPA);
    seaLevelRef.current = STANDARD_SEA_LEVEL_HPA;
    logEvent(MODULE, 'reset sea-level pressure calibration');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let barSub: { remove: () => void } | null = null;

    const setupAltimeter = async () => {
      try {
        const available = await Barometer.isAvailableAsync().catch((e) => {
          logError(MODULE, 'barometer probe failed', e);
          return false;
        });

        if (cancelled) return;
        setIsAvailable(available);

        if (!available) {
          logEvent(MODULE, 'hardware barometer not available on device');
          return;
        }

        Barometer.setUpdateInterval(updateIntervalMs);

        barSub = Barometer.addListener(({ pressure }) => {
          if (cancelled) return;
          const now = Date.now();
          const p = Number(pressure.toFixed(2));
          const p0 = seaLevelRef.current;

          // ICAO Hypsometric formula
          const altM = calculateAltitudeM(p, p0);
          const altFt = calculateAltitudeFt(altM);

          setPressureHpa(p);
          setAltitudeM(altM);
          setAltitudeFt(altFt);
          setHasSample(true);

          // Update history
          const history = historyRef.current;
          history.push({ time: now, alt: altM, pressure: p });

          // Keep up to 60 seconds of history
          while (history.length > 0 && now - history[0].time > 60000) {
            history.shift();
          }

          // Calculate vertical velocity (m/s) over recent samples (~1.0s window)
          if (history.length >= 2) {
            const lookbackTime = now - 1000;
            let pastSample = history[0];
            for (let i = history.length - 2; i >= 0; i--) {
              if (history[i].time <= lookbackTime) {
                pastSample = history[i];
                break;
              }
            }

            const dt = (now - pastSample.time) / 1000;
            if (dt >= 0.2) {
              const dh = altM - pastSample.alt;
              const rawVelocity = dh / dt;
              const smoothVelocity =
                velocityRef.current === null
                  ? rawVelocity
                  : EWMA_ALPHA * rawVelocity + (1 - EWMA_ALPHA) * velocityRef.current;

              velocityRef.current = smoothVelocity;
              setVerticalVelocityMs(Number(smoothVelocity.toFixed(2)));
              recordMetric(MODULE, 'verticalVelocityMs', smoothVelocity, 'derived');
            }
          }

          // Pressure trend extrapolated to hPa/hour over the retained window (at most 60 s).
          // Fewer than 5 samples or a window shorter than 10 s is not enough to state a trend, so it stays null.
          const oldest = history[0];
          const dtSec = (now - oldest.time) / 1000;
          if (history.length >= 5 && dtSec >= 10) {
            const dp = p - oldest.pressure;
            const hpaPerHour = (dp / dtSec) * 3600;
            setPressureTrend(calculatePressureTrend(hpaPerHour));
          } else {
            setPressureTrend(null);
          }

          recordMetric(MODULE, 'altitudeM', altM, 'derived');
          recordMetric(MODULE, 'pressureHpa', p, 'hardware');
        });

        setError(null);
        logEvent(MODULE, 'subscribed', { intervalMs: updateIntervalMs });
      } catch (e: any) {
        if (cancelled) return;
        setIsAvailable(false);
        setError(logError(MODULE, 'subscribe failed', e).message);
      }
    };

    void setupAltimeter();

    return () => {
      cancelled = true;
      barSub?.remove();
      logEvent(MODULE, 'unsubscribed');
    };
  }, [updateIntervalMs]);

  const source: TelemetrySource = hasSample ? 'derived' : 'unavailable';

  return {
    altitudeM,
    altitudeFt,
    verticalVelocityMs,
    pressureHpa,
    seaLevelPressureHpa,
    pressureTrend,
    isAvailable,
    error,
    source,
    calibrateSeaLevel,
    resetCalibration,
  };
}
