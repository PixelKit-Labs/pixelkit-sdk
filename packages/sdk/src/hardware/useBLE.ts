/**
 * @file useBLE.ts
 * @description Bluetooth Low Energy (BLE) peripheral discovery, bonded devices, and RSSI tracking.
 * Reads physical adapter state, whether the device declares BLE Channel Sounding, bonded devices,
 * and active BluetoothLeScanner discovery from PixelNative.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PixelNative, { type BondedDevice, type DiscoveredBleDevice } from '@pixelkit-labs/native';
import { logEvent, logError, traced } from '../core/observability';
import { useRadios } from './useRadios';

const MODULE = 'useBLE';
import { BLEPeripheral } from '../core/types';

/** Assumed RSSI at 1 m. This is a fixed assumption, not a per-device calibration. */
const ASSUMED_RSSI_AT_1M_DBM = -59;
/** Path-loss exponent of the free-space model. */
const PATH_LOSS_EXPONENT = 2.0;

/**
 * Derived estimate: log-distance path loss with `ASSUMED_RSSI_AT_1M_DBM` and `PATH_LOSS_EXPONENT`.
 * Real RSSI is noisy and environment dependent, so treat the result as a rough proximity figure.
 */
function estimateDistance(rssi: number): number {
  if (rssi === 0) return -1.0;
  const ratio = (ASSUMED_RSSI_AT_1M_DBM - rssi) / (10 * PATH_LOSS_EXPONENT);
  return Number(Math.pow(10, ratio).toFixed(2));
}

/**
 * Hook to discover nearby Bluetooth Low Energy devices and inspect bonded peripherals.
 *
 * @returns Object providing discovered peripherals, bonded devices, hardware state, and scan controls.
 *
 * @example
 * ```typescript
 * const { state, channelSounding, bondedDevices, isScanning, peripherals, startScan, stopScan } = useBLE();
 * await startScan(10000);
 * console.log(`Bonded: ${bondedDevices.length}, Discovered: ${peripherals.length}`);
 * ```
 */
export function useBLE() {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [peripherals, setPeripherals] = useState<BLEPeripheral[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { bluetooth, error, source } = useRadios();
  const isSupported = bluetooth.supported;
  const isEnabled = bluetooth.enabled;
  const state = bluetooth.state;
  const channelSounding = bluetooth.channelSounding;
  const bondedDevices: BondedDevice[] = bluetooth.bondedDevices;

  const clearTimers = useCallback((): void => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (stopTimeout.current) {
      clearTimeout(stopTimeout.current);
      stopTimeout.current = null;
    }
  }, []);

  const syncDiscovered = useCallback(() => {
    if (!PixelNative?.getDiscoveredBleDevices) return;
    try {
      const raw: DiscoveredBleDevice[] = PixelNative.getDiscoveredBleDevices() ?? [];
      const mapped: BLEPeripheral[] = raw.map((d) => ({
        id: d.address,
        name: d.name,
        rssi: d.rssi,
        estimatedDistanceMeters: estimateDistance(d.rssi),
        lastSeenTimestamp: d.lastSeenEpochMs,
      }));
      setPeripherals(mapped);
    } catch (e) {
      logError(MODULE, 'readDiscovered failed', e);
    }
  }, []);

  /**
   * Halts active BLE scanning.
   */
  const stopScan = useCallback((): void => {
    clearTimers();
    try {
      PixelNative?.stopBleScan?.();
      logEvent(MODULE, 'scan stopped');
    } catch (e) {
      logError(MODULE, 'stopScan failed', e);
    }
    syncDiscovered();
    setIsScanning(false);
  }, [clearTimers, syncDiscovered]);

  /** Reads the native scan state; a failed scan (`onScanFailed`) ends the scan and sets `scanError`. */
  const pollScan = useCallback(() => {
    syncDiscovered();
    try {
      const scanState = PixelNative?.getBleScanState?.();
      if (scanState?.error) {
        clearTimers();
        setScanError(`${scanState.error} (code ${scanState.errorCode})`);
        setIsScanning(false);
        logEvent(MODULE, 'scan failed', { code: scanState.errorCode, error: scanState.error }, 'error');
      }
    } catch (e) {
      logError(MODULE, 'getBleScanState failed', e);
    }
  }, [clearTimers, syncDiscovered]);

  /**
   * Begins physical Bluetooth Low Energy discovery via Android BluetoothLeScanner.
   */
  const startScan = useCallback(async (timeoutMs: number = 10000): Promise<boolean> => {
    setScanError(null);
    if (!PixelNative?.startBleScan) {
      setScanError('Native BLE scanner not available on this platform');
      return false;
    }

    try {
      const res = await traced(MODULE, 'startScan', () => PixelNative!.startBleScan(timeoutMs), { timeoutMs });
      if (!res?.success) {
        setScanError(res?.error ?? 'Scan failed to start');
        setIsScanning(false);
        return false;
      }

      setIsScanning(true);

      // Poll discovered devices and scan state every 500ms while scanning; auto-stop after the timeout
      clearTimers();
      pollTimer.current = setInterval(pollScan, 500);

      stopTimeout.current = setTimeout(() => {
        stopScan();
      }, timeoutMs);

      return true;
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan error');
      setIsScanning(false);
      return false;
    }
  }, [clearTimers, stopScan, pollScan]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    /** Whether device hardware has Bluetooth Low Energy */
    isSupported,
    /** Whether Bluetooth is switched on in Android Settings */
    isEnabled,
    /** Bluetooth adapter state ('ON' | 'OFF' | 'TURNING_ON' | 'TURNING_OFF') */
    state,
    /** True if the device declares the BLE Channel Sounding system feature */
    channelSounding,
    /** Paired/bonded Bluetooth peripherals from Android BluetoothAdapter */
    bondedDevices,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Provenance of the adapter telemetry */
    source,
    /** Whether BLE radio is actively scanning */
    isScanning,
    /** Discovered nearby peripherals: RSSI and last-seen time are platform values, distance is a derived estimate */
    peripherals,
    /** Error message if scan failed, including the `ScanCallback.onScanFailed` code */
    scanError,
    /** Start physical discovery scan */
    startScan,
    /** Stop active scan */
    stopScan,
  };
}
