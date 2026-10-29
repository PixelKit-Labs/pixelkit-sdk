/**
 * @file useSensors.ts
 * @description Motion, orientation, air pressure and ambient light, streamed from `expo-sensors`.
 *
 * Nothing is reported before the hardware has said it. Pressure and light are `null` until a first
 * sample arrives rather than showing a plausible standing value, and `isAvailable` starts false
 * until subscriptions are actually attached. Per-sensor availability is reported separately, because
 * a device can have an IMU and no barometer.
 *
 * Altitude is derived from pressure with the international hypsometric formula, so it is relative
 * and drifts with the weather. It is not a GNSS altitude and must not be presented as one.
 */

import { useState, useEffect } from 'react';
import {
  Accelerometer,
  Gyroscope,
  Magnetometer,
  Barometer,
  LightSensor,
} from 'expo-sensors';
import { logEvent, logError, type TelemetrySource } from '../core/observability';
import { SensorTelemetry, Vector3D, BarometerData } from '../core/types';

const MODULE = 'useSensors';
const INITIAL_VECTOR: Vector3D = { x: 0, y: 0, z: 0 };
/** Standard sea-level pressure, used only to derive relative altitude from a real reading. */
const SEA_LEVEL_PRESSURE = 1013.25;

export function useSensors(updateIntervalMs: number = 100) {
  const [accelerometer, setAccelerometer] = useState<Vector3D>(INITIAL_VECTOR);
  const [gyroscope, setGyroscope] = useState<Vector3D>(INITIAL_VECTOR);
  const [magnetometer, setMagnetometer] = useState<Vector3D>(INITIAL_VECTOR);
  const [barometer, setBarometer] = useState<BarometerData>({ pressure: null, relativeAltitude: null });
  const [lightLux, setLightLux] = useState<number | undefined>(undefined);

  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [hasMotionSample, setHasMotionSample] = useState<boolean>(false);
  const [barometerAvailable, setBarometerAvailable] = useState<boolean | null>(null);
  const [lightAvailable, setLightAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasMotionSample ? 'hardware' : 'unavailable';

  useEffect(() => {
    let cancelled = false;
    let accelSub: { remove: () => void } | null = null;
    let gyroSub: { remove: () => void } | null = null;
    let magSub: { remove: () => void } | null = null;
    let barSub: { remove: () => void } | null = null;
    let lightSub: { remove: () => void } | null = null;
    let sawSample = false;

    const markSample = () => {
      if (sawSample || cancelled) return;
      sawSample = true;
      setHasMotionSample(true);
      logEvent(MODULE, 'first sample', { intervalMs: updateIntervalMs });
    };

    const setupSensors = async () => {
      try {
        const probe = (name: string, sensor: { isAvailableAsync(): Promise<boolean> }): Promise<boolean> =>
          sensor.isAvailableAsync().catch((e) => {
            logError(MODULE, `${name} probe failed`, e);
            return false;
          });
        const [hasAccel, hasGyro, hasMag] = await Promise.all([
          probe('accelerometer', Accelerometer),
          probe('gyroscope', Gyroscope),
          probe('magnetometer', Magnetometer),
        ]);
        if (cancelled) return;

        Barometer.setUpdateInterval(updateIntervalMs);
        if (hasAccel) {
          Accelerometer.setUpdateInterval(updateIntervalMs);
          accelSub = Accelerometer.addListener((d) => {
            markSample();
            setAccelerometer({ x: Number(d.x.toFixed(3)), y: Number(d.y.toFixed(3)), z: Number(d.z.toFixed(3)) });
          });
        }
        if (hasGyro) {
          Gyroscope.setUpdateInterval(updateIntervalMs);
          gyroSub = Gyroscope.addListener((d) => {
            setGyroscope({ x: Number(d.x.toFixed(3)), y: Number(d.y.toFixed(3)), z: Number(d.z.toFixed(3)) });
          });
        }
        if (hasMag) {
          Magnetometer.setUpdateInterval(updateIntervalMs);
          magSub = Magnetometer.addListener((d) => {
            setMagnetometer({ x: Number(d.x.toFixed(1)), y: Number(d.y.toFixed(1)), z: Number(d.z.toFixed(1)) });
          });
        }

        const hasBarometer = await Barometer.isAvailableAsync().catch((e) => {
          logError(MODULE, 'barometer probe failed', e);
          return false;
        });
        if (cancelled) return;
        setBarometerAvailable(hasBarometer);
        if (hasBarometer) {
          barSub = Barometer.addListener(({ pressure }) => {
            const altitude = 44330 * (1 - Math.pow(pressure / SEA_LEVEL_PRESSURE, 0.1903));
            setBarometer({
              pressure: Number(pressure.toFixed(2)),
              relativeAltitude: Number(altitude.toFixed(1)),
            });
          });
        }

        const hasLight = await LightSensor.isAvailableAsync().catch((e) => {
          logError(MODULE, 'light probe failed', e);
          return false;
        });
        if (cancelled) return;
        setLightAvailable(hasLight);
        if (hasLight) {
          LightSensor.setUpdateInterval(updateIntervalMs * 2);
          lightSub = LightSensor.addListener(({ illuminance }) => {
            // One decimal: a dark room legitimately reads 0.4-2 lux and must not display as 0.
            setLightLux(Number(illuminance.toFixed(1)));
          });
        }

        // True when at least one motion sensor (accelerometer, gyroscope, magnetometer) is present and subscribed.
        setIsAvailable(hasAccel || hasGyro || hasMag);
        setError(null);
        logEvent(MODULE, 'subscribed', {
          intervalMs: updateIntervalMs,
          barometer: hasBarometer,
          light: hasLight,
        });
      } catch (e) {
        if (cancelled) return;
        setIsAvailable(false);
        setError(logError(MODULE, 'subscribe failed', e, { intervalMs: updateIntervalMs }).message);
      }
    };

    void setupSensors();

    return () => {
      cancelled = true;
      accelSub?.remove();
      gyroSub?.remove();
      magSub?.remove();
      barSub?.remove();
      lightSub?.remove();
      logEvent(MODULE, 'unsubscribed');
    };
  }, [updateIntervalMs]);

  const telemetry: SensorTelemetry = {
    accelerometer,
    gyroscope,
    magnetometer,
    barometer,
    lightLux,
    isAvailable,
  };

  return {
    ...telemetry,
    /** True once a real motion sample has arrived; before that the vectors are still zeroed. */
    hasMotionSample,
    /** Whether this device has a barometer. Null until probed. */
    barometerAvailable,
    /** Whether this device has an ambient light sensor. Null until probed. */
    lightAvailable,
    /** Why subscribing failed, if it did. */
    error,
    source,
  };
}
