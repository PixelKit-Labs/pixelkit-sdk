/**
 * @file useRadios.ts
 * @description Radio state read from Android system services and PackageManager features:
 * NfcAdapter, BluetoothAdapter, UwbManager (reflection), WifiRttManager, the Thread and satellite
 * system features. Values Android does not let the app read are null. Before the first read the
 * returned values are the all-false defaults and `source` is 'unavailable'.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type RadioInfo, type BondedDevice } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useRadios';
const POLL_MS = 5000;

export interface RadioTelemetry {
  /** Latest failure message, or null. Failures are also logged and counted. */
  error: string | null;
  nfc: {
    supported: boolean;
    enabled: boolean;
    observeModeSupported: boolean;
    antennaState: 'ENABLED' | 'DISABLED' | 'UNAVAILABLE';
  };
  bluetooth: {
    supported: boolean;
    bleSupported: boolean;
    enabled: boolean;
    state: 'ON' | 'OFF' | 'TURNING_ON' | 'TURNING_OFF';
    channelSounding: boolean;
    bondedDevices: BondedDevice[];
  };
  uwb: {
    supported: boolean;
    /** `UwbManager.isUwbEnabled()` by reflection; null when that call is not reachable by apps. */
    enabled: boolean | null;
    /** The Android 16 `android.ranging.RangingManager` service exists. */
    rangingApiSupported: boolean;
  };
  wifiRtt: {
    supported: boolean;
    available: boolean;
  };
  thread: {
    supported: boolean;
    /** Thread network service found through `ServiceManager`; null when that hidden lookup is not possible. */
    serviceFound: boolean | null;
  };
  satellite: {
    supported: boolean;
    sosSupported?: boolean;
  };
  source: TelemetrySource;
  refresh: () => void;
}

const DEFAULT_RADIO_INFO: RadioInfo = {
  nfc: {
    supported: false,
    enabled: false,
    observeModeSupported: false,
    antennaState: 'UNAVAILABLE',
  },
  bluetooth: {
    supported: false,
    bleSupported: false,
    enabled: false,
    state: 'OFF',
    channelSounding: false,
    bondedDevices: [],
  },
  uwb: {
    supported: false,
    enabled: null,
    rangingApiSupported: false,
  },
  wifiRtt: {
    supported: false,
    available: false,
  },
  thread: {
    supported: false,
    serviceFound: null,
  },
  satellite: {
    supported: false,
    sosSupported: false,
  },
};

/**
 * Hook exposing radio states across NFC, Bluetooth LE, UWB, Wi-Fi RTT, Thread and satellite.
 *
 * @example
 * ```typescript
 * const { nfc, bluetooth, uwb, source, refresh } = useRadios();
 * console.log(`NFC: ${nfc.antennaState}, BT: ${bluetooth.state}, UWB: ${uwb.enabled}`);
 * ```
 */
export function useRadios(): RadioTelemetry {
  const [radioInfo, setRadioInfo] = useState<RadioInfo>(DEFAULT_RADIO_INFO);
  const [error, setError] = useState<string | null>(null);
  const [hasRead, setHasRead] = useState<boolean>(false);
  const source: TelemetrySource = PixelNative && hasRead ? 'hardware' : 'unavailable';

  const read = useCallback(() => {
    if (!PixelNative) return;
    try {
      const info = PixelNative.getRadioInfo();
      setRadioInfo(info);
      setHasRead(true);
      setError(null);
      recordMetric(MODULE, 'nfcEnabled', info.nfc.enabled, 'hardware');
      recordMetric(MODULE, 'bluetoothState', info.bluetooth.state, 'hardware');
      if (info.uwb.enabled !== null) {
        recordMetric(MODULE, 'uwbEnabled', info.uwb.enabled, 'hardware');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'getRadioInfo error';
      setError(message);
      logEvent(MODULE, 'getRadioInfo error', { message }, 'error');
    }
  }, []);

  useEffect(() => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; radio telemetry unavailable', undefined, 'warn');
      return;
    }
    read();
    const interval = setInterval(read, POLL_MS);
    return () => clearInterval(interval);
  }, [read]);

  return {
    ...radioInfo,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    source,
    refresh: read,
  };
}
