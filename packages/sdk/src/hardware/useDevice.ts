/**
 * @file useDevice.ts
 * @description Device identity, battery and power state, with live listeners and physical telemetry.
 *
 * Nothing is assumed before the platform answers. Battery level starts null rather than a
 * comfortable 100, connectivity starts false rather than optimistically connected, and identity
 * fields fall back to null rather than to the model this SDK happens to target. Each sub-read
 * fails independently, so one unavailable value does not blank the rest, and every failure is
 * logged and counted rather than swallowed.
 *
 * In addition to standard Expo power properties, this hook queries the native fuel gauge PMIC
 * via PixelNative:
 * - `batteryTemperatureC`: Real physical temperature of the battery pack from its NTC thermistor.
 * - `batteryVoltageMv`: Instantaneous cell terminal voltage from the fuel gauge ADC.
 * - `batteryCurrentMa`: Instantaneous current flow in mA (negative discharging, positive charging).
 * - `batteryPowerWatts`: Real-time system wattage draw or fast-charging rate.
 * - `batteryHealth`: Hardware health status (GOOD, OVERHEAT, DEAD, OVER_VOLTAGE, COLD, UNKNOWN).
 * - `batteryCycleCount`: Lifetime charge cycles from fuel gauge EEPROM (Android 14+).
 * - `batteryChargeCounterMah`: Microampere-hour fuel gauge counter converted to mAh.
 *
 * `lowPowerMode` reflects Android Battery Saver and is a direct instruction to do less: reduce
 * sensor intervals, defer heavy work and stop background polling.
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import PixelNative, { type BatteryTelemetry } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, tracedSafe, type TelemetrySource } from '../core/observability';
import { DeviceTelemetry } from '../core/types';
import { connectedToExternalPower } from './powerState';

const MODULE = 'useDevice';

export function useDevice() {
  // Identity is available synchronously from the platform; null when it cannot be read.
  const [identity] = useState(() => ({
    modelName: Device.modelName ?? 'Unknown device',
    brand: Device.brand ?? 'Unknown',
    osVersion: Device.osVersion ?? 'Unknown',
    totalMemoryMB: Device.totalMemory ? Math.round(Device.totalMemory / (1024 * 1024)) : undefined,
  }));

  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);
  const [lowPowerMode, setLowPowerMode] = useState<boolean>(false);
  const [networkType, setNetworkType] = useState<string>('UNKNOWN');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [battery, setBattery] = useState<BatteryTelemetry | null>(null);
  const [hasRead, setHasRead] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasRead ? 'hardware' : 'unavailable';

  /** Re-reads power, battery fuel gauge PMIC, and connectivity. Each value is read independently. */
  const refresh = useCallback(async (): Promise<void> => {
    const [level, state, lowPower, net, nativeBatt] = await Promise.all([
      tracedSafe(MODULE, 'readBatteryLevel', () => Battery.getBatteryLevelAsync(), null),
      tracedSafe(MODULE, 'readBatteryState', () => Battery.getBatteryStateAsync(), null),
      tracedSafe(MODULE, 'readLowPowerMode', () => Battery.isLowPowerModeEnabledAsync(), false),
      tracedSafe(MODULE, 'readNetworkState', () => Network.getNetworkStateAsync(), null),
      PixelNative
        ? tracedSafe(MODULE, 'readBatteryTelemetry', () => PixelNative!.getBatteryTelemetry(), null)
        : Promise.resolve(null),
    ]);

    // A failed battery read leaves the level null rather than inventing a charge.
    if (level != null) {
      const pct = Math.round(level * 100);
      setBatteryLevel(pct);
      recordMetric(MODULE, 'batteryPercent', pct, 'hardware');
    }
    // Android NOT_CHARGING means power is attached but charging is paused (often
    // at 100% or a charge limit). It is not the same as UNPLUGGED.
    const expoPower = state == null || state === Battery.BatteryState.UNKNOWN
      ? null : state !== Battery.BatteryState.UNPLUGGED;
    const externalPower = connectedToExternalPower(nativeBatt?.plugged ?? null, expoPower);
    setIsCharging(externalPower);
    setLowPowerMode(!!lowPower);
    setNetworkType(net?.type ?? 'UNKNOWN');
    setIsConnected(!!net?.isConnected && net?.isInternetReachable !== false);

    setBattery(nativeBatt);
    if (nativeBatt) {
      if (nativeBatt.temperatureC != null) {
        recordMetric(MODULE, 'batteryTempC', nativeBatt.temperatureC, 'hardware');
      }
      if (nativeBatt.voltageMv != null) {
        recordMetric(MODULE, 'batteryVoltageMv', nativeBatt.voltageMv, 'hardware');
      }
      if (nativeBatt.currentNowMa != null) {
        recordMetric(MODULE, 'batteryCurrentMa', nativeBatt.currentNowMa, 'hardware');
      }
      if (nativeBatt.powerWatts != null) {
        recordMetric(MODULE, 'batteryPowerWatts', nativeBatt.powerWatts, 'derived');
      }
    }

    const anyRead = level != null || state != null || net != null || nativeBatt != null;
    setHasRead(anyRead);
    if (!anyRead) {
      setError('Could not read battery, power telemetry, or network state');
    } else {
      setError(null);
      logEvent(MODULE, 'state', {
        batteryPercent: level == null ? null : Math.round(level * 100),
        charging: externalPower,
        lowPowerMode: !!lowPower,
        networkType: net?.type ?? 'UNKNOWN',
        batteryTempC: nativeBatt?.temperatureC ?? null,
        batteryVoltageMv: nativeBatt?.voltageMv ?? null,
        batteryCurrentMa: nativeBatt?.currentNowMa ?? null,
        batteryPowerWatts: nativeBatt?.powerWatts ?? null,
        plugged: nativeBatt?.plugged ?? null,
      });
    }
  }, []);

  useEffect(() => {
    let levelSub: { remove: () => void } | null = null;
    let stateSub: { remove: () => void } | null = null;

    void refresh();

    // Listeners are attached separately: a failure here must not prevent the one-off read above.
    if (Platform.OS !== 'web') {
      try {
        levelSub = Battery.addBatteryLevelListener(({ batteryLevel: lvl }) => {
          const pct = Math.round(lvl * 100);
          setBatteryLevel(pct);
          recordMetric(MODULE, 'batteryPercent', pct, 'hardware');
        });
        stateSub = Battery.addBatteryStateListener(() => {
          // A fresh native plugged-source read wins over an ambiguous Expo state.
          void refresh();
        });
        logEvent(MODULE, 'battery listeners attached');
      } catch (e) {
        setError(logError(MODULE, 'battery listeners failed', e).message);
      }
    }

    return () => {
      levelSub?.remove();
      stateSub?.remove();
    };
  }, [refresh]);

  const telemetry: DeviceTelemetry = {
    ...identity,
    batteryPercent: batteryLevel,
    isCharging,
    lowPowerMode,
    networkType,
    isConnected,
    batteryTemperatureC: battery?.temperatureC ?? null,
    batteryVoltageMv: battery?.voltageMv ?? null,
    batteryCurrentMa: battery?.currentNowMa ?? null,
    batteryCurrentAvgMa: battery?.currentAvgMa ?? null,
    batteryPowerWatts: battery?.powerWatts ?? null,
    batteryHealth: battery?.health ?? null,
    batteryChargeCounterMah: battery?.chargeCounterMah ?? null,
    batteryEnergyCounterMwh: battery?.energyCounterMwh ?? null,
    batteryTechnology: battery?.technology ?? null,
    batteryCycleCount: battery?.cycleCount ?? null,
    pluggedSource: battery?.plugged ?? null,
  };

  return {
    ...telemetry,
    /** Physical temperature of the battery pack in °C (fuel gauge thermistor), or null. */
    batteryTemperatureC: battery?.temperatureC ?? null,
    /** Real-time cell terminal voltage in mV, or null. */
    batteryVoltageMv: battery?.voltageMv ?? null,
    /** Instantaneous current flow in mA (negative discharging, positive charging), or null. */
    batteryCurrentMa: battery?.currentNowMa ?? null,
    /** Average current flow in mA, or null. */
    batteryCurrentAvgMa: battery?.currentAvgMa ?? null,
    /** Real-time power draw or charging speed in Watts (V × I), or null. */
    batteryPowerWatts: battery?.powerWatts ?? null,
    /** Battery health condition (GOOD, OVERHEAT, DEAD, OVER_VOLTAGE, COLD, UNKNOWN). */
    batteryHealth: battery?.health ?? null,
    /** Lifetime charge cycles stored in fuel gauge EEPROM (Android 14+), or null. */
    batteryCycleCount: battery?.cycleCount ?? null,
    /** Remaining charge capacity in mAh, or null. */
    batteryChargeCounterMah: battery?.chargeCounterMah ?? null,
    /** Remaining stored energy in mWh, or null. */
    batteryEnergyCounterMwh: battery?.energyCounterMwh ?? null,
    /** Battery cell chemistry string, or null. */
    batteryTechnology: battery?.technology ?? null,
    /** Charging power source (AC, USB, WIRELESS, DOCK, NONE). */
    pluggedSource: battery?.plugged ?? null,
    /** Full native battery telemetry payload including probed thermal zones. */
    batteryTelemetry: battery,
    /** Whether any power, battery, or network value has been read. */
    hasRead,
    /** Why the last read failed. */
    error,
    source,
    refresh,
  };
}
