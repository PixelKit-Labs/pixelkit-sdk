/**
 * @file useLocation.ts
 * @description Position, altitude, heading and speed from `expo-location` (`getCurrentPositionAsync`, highest accuracy).
 * Latitude and longitude are null until the first fix arrives, including when permission was denied.
 *
 * `accuracy` is the radius in metres the platform believes the position lies within. Indoors it can
 * be tens of metres, so it gates whether a coordinate is worth acting on. It is reported rather than
 * hidden for that reason.
 *
 * Coordinates are never written to the log. Events record accuracy, whether a fix arrived and how
 * long it took, which is what you need to debug a positioning problem without recording where the
 * user was.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { logEvent, logError, recordMetric, traced, type TelemetrySource } from '../core/observability';
import { LocationTelemetry } from '../core/types';

const MODULE = 'useLocation';

const EMPTY: LocationTelemetry = {
  latitude: null,
  longitude: null,
  altitude: null,
  accuracy: null,
  heading: null,
  speed: null,
  hasPermission: false,
};

export function useLocation() {
  const [location, setLocation] = useState<LocationTelemetry>(EMPTY);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [hasFix, setHasFix] = useState<boolean>(false);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasFix ? 'hardware' : 'unavailable';

  /** Requests permission if needed and takes one high-accuracy fix. */
  const refreshLocation = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsLocating(true);
    try {
      const { status } = await traced(MODULE, 'requestPermission', () =>
        Location.requestForegroundPermissionsAsync(),
      );
      if (status !== 'granted') {
        setLocation(prev => ({ ...prev, hasPermission: false }));
        setError('Location permission denied');
        logEvent(MODULE, 'permission denied', { status }, 'warn');
        return false;
      }

      const current = await traced(MODULE, 'getPosition', () =>
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
      );

      setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        altitude: current.coords.altitude,
        accuracy: current.coords.accuracy,
        heading: current.coords.heading,
        speed: current.coords.speed,
        hasPermission: true,
      });
      setHasFix(true);
      setLastFixAt(Date.now());
      if (current.coords.accuracy != null) {
        recordMetric(MODULE, 'accuracyMeters', Math.round(current.coords.accuracy), 'hardware');
      }
      // Accuracy and speed only; coordinates stay out of the log.
      logEvent(MODULE, 'fix', {
        accuracyMeters: current.coords.accuracy == null ? null : Math.round(current.coords.accuracy),
        hasAltitude: current.coords.altitude != null,
        speed: current.coords.speed,
      });
      return true;
    } catch (e) {
      setHasFix(false);
      setError(logError(MODULE, 'position failed', e).message);
      return false;
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => { void refreshLocation(); }, [refreshLocation]);

  return {
    ...location,
    /** True while a fix is being acquired. */
    isLocating,
    /** Whether a position has ever been obtained this session. */
    hasFix,
    /** When the last fix arrived, as an epoch timestamp. */
    lastFixAt,
    /** Why the last attempt failed, including a denied permission. */
    error,
    source,
    /** Requests permission if needed and takes a fresh high-accuracy fix. */
    refreshLocation,
  };
}
