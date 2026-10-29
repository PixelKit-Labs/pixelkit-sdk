/**
 * @file useHealthConnect.ts
 * @description Health Connect availability and the device's step counter / heart rate sensors.
 * `isAvailable` and `sdkStatus` are inferred: the `healthconnect` system service (Android 14+) or the
 * `com.google.android.apps.healthdata` package is present. They are not the result of
 * `HealthConnectClient.getSdkStatus()`, which this SDK does not call. Sensor fields come from
 * `SensorManager` and the step counter system feature.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type HealthConnectInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useHealthConnect';

export { type HealthConnectInfo };

export interface HealthConnectState {
  /** Inferred: the `healthconnect` system service or the `com.google.android.apps.healthdata` package exists */
  isAvailable: boolean;
  /** 'SDK_AVAILABLE' when `isAvailable`, else 'SDK_UNAVAILABLE'; no provider-update state is reported */
  sdkStatus: 'SDK_AVAILABLE' | 'SDK_UNAVAILABLE';
  /** Whether physical hardware step counter sensor is present */
  hasStepCounter: boolean;
  /** Whether hardware heart rate sensor is present */
  hasHeartRateSensor: boolean;
  /** Hardware sensor name (e.g. Google Step Counter) */
  stepSensorName: string | null;
  /** Hardware heart rate sensor name */
  heartRateSensorName: string | null;
  /** Whether the `healthconnect` system service exists (Android 14+) */
  isFrameworkIntegrated: boolean;
  /** Error message if unavailable */
  error: string | null;
  /** Telemetry provenance */
  source: TelemetrySource;
  /** Re-probe Health Connect framework and hardware sensors */
  refresh: () => HealthConnectInfo | null;
}

/**
 * Hook to inspect Android Health Connect framework availability and query device health sensor hardware.
 *
 * @example
 * ```typescript
 * const { isAvailable, sdkStatus, hasStepCounter, stepSensorName } = useHealthConnect();
 * console.log(`Health Connect status: ${sdkStatus}, Step sensor: ${stepSensorName}`);
 * ```
 */
export function useHealthConnect(): HealthConnectState {
  const [data, setData] = useState<HealthConnectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): HealthConnectInfo | null => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; health connect unavailable', undefined, 'warn');
      return null;
    }
    try {
      const info = PixelNative.getHealthConnectInfo();
      setData(info);
      if (info.error) {
        setError(info.error);
      } else {
        setError(null);
      }
      recordMetric(MODULE, 'isAvailable', info.isAvailable ? 1 : 0, info.isAvailable ? 'hardware' : 'unavailable');
      recordMetric(MODULE, 'hasStepCounter', info.hasStepCounter ? 1 : 0, info.hasStepCounter ? 'hardware' : 'unavailable');
      logEvent(MODULE, 'health connect queried', {
        isAvailable: info.isAvailable,
        sdkStatus: info.sdkStatus,
        hasStepCounter: info.hasStepCounter,
        isFrameworkIntegrated: info.isFrameworkIntegrated,
      });
      return info;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'getHealthConnectInfo failed';
      setError(msg);
      logEvent(MODULE, 'getHealthConnectInfo error', { error: msg }, 'error');
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isHardware = Boolean(PixelNative && data);

  return {
    isAvailable: data?.isAvailable ?? false,
    sdkStatus: data?.sdkStatus ?? 'SDK_UNAVAILABLE',
    hasStepCounter: data?.hasStepCounter ?? false,
    hasHeartRateSensor: data?.hasHeartRateSensor ?? false,
    stepSensorName: data?.stepSensorName ?? null,
    heartRateSensorName: data?.heartRateSensorName ?? null,
    isFrameworkIntegrated: data?.isFrameworkIntegrated ?? false,
    error,
    source: isHardware ? 'hardware' : 'unavailable',
    refresh,
  };
}
