/**
 * @file useThermometer.ts
 * @description Non-contact infrared temperature sensor discovery on Google Pixel Pro hardware.
 * The native module finds the sensor through `SensorManager` (a sensor whose type string contains
 * `object_temperature` or `mlx90632`, or whose name contains `Thermometer` or `MLX90632`) and
 * reports its name. It has no decoder for that sensor's samples, so the temperatures are null and
 * `error` says so; nothing is estimated and there is no emissivity or mode setting, because nothing
 * downstream of the sensor would apply it.
 *
 * Zero-Simulation Principle: temperatures are null and source is 'unavailable' on every device
 * until a verified sample decoder exists.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, { type ThermometerReading } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useThermometer';

export interface ThermometerTelemetry {
  /** Whether `SensorManager` lists a far-infrared temperature sensor on this device. */
  isSupported: boolean;
  /** Surface temperature in degrees Celsius (°C), or null. */
  surfaceTemperatureC: number | null;
  /** Surface temperature in degrees Fahrenheit (°F), or null. */
  surfaceTemperatureF: number | null;
  /** Sensor die / ambient temperature in degrees Celsius (°C), or null. */
  ambientTemperatureC: number | null;
  /** Name `SensorManager` gives the sensor, or null when none was found. */
  sensorName: string | null;
  /** Why temperatures are null (sensor found but not decoded, probe failure), or null. */
  error: string | null;
  /** Provenance of the data: 'hardware' when a temperature was read, otherwise 'unavailable'. */
  source: TelemetrySource;
  /** Probes the sensor list again. */
  refresh: () => void;
}

export function useThermometer(): ThermometerTelemetry {
  const [reading, setReading] = useState<ThermometerReading>({
    isSupported: false,
    surfaceTemperatureC: null,
    surfaceTemperatureF: null,
    ambientTemperatureC: null,
    sensorName: null,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    PixelNative && reading.isSupported && reading.surfaceTemperatureC !== null ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setReading({
        isSupported: false,
        surfaceTemperatureC: null,
        surfaceTemperatureF: null,
        ambientTemperatureC: null,
        sensorName: null,
        error: 'PixelNative module unavailable',
      });
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getThermometerReading();
      setReading(res);
      setError(res.error ?? null);

      if (res.surfaceTemperatureC !== null) {
        recordMetric(MODULE, 'surfaceTemperatureC', res.surfaceTemperatureC, 'hardware');
      }
      logEvent(MODULE, 'queried thermometer sensor', {
        supported: res.isSupported,
        sensor: res.sensorName,
      });
    } catch (e: any) {
      const err = logError(MODULE, 'getThermometerReading failed', e);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isSupported: reading.isSupported,
    surfaceTemperatureC: reading.surfaceTemperatureC,
    surfaceTemperatureF: reading.surfaceTemperatureF,
    ambientTemperatureC: reading.ambientTemperatureC,
    sensorName: reading.sensorName,
    error,
    source,
    refresh,
  };
}
