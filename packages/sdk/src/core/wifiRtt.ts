/**
 * @file wifiRtt.ts
 * @description Pure helpers over `WifiRttManager` results. The platform only defines distance,
 * standard deviation and RSSI for an access point whose status is success, so these return null
 * for every other status instead of a number.
 */

import type { WifiRttResult } from '@pixelkit-labs/native';

/** `RangingResult.STATUS_SUCCESS`. */
export const WIFI_RTT_STATUS_SUCCESS = 0;

/** True when the access point produced a real measurement. */
export function isWifiRttMeasured(result: Pick<WifiRttResult, 'status' | 'distanceMm'>): boolean {
  return result.status === WIFI_RTT_STATUS_SUCCESS && result.distanceMm !== null;
}

/** Distance in meters, or null when this access point was not measured. */
export function wifiRttDistanceMeters(result: Pick<WifiRttResult, 'status' | 'distanceMm'>): number | null {
  return isWifiRttMeasured(result) ? (result.distanceMm as number) / 1000 : null;
}
