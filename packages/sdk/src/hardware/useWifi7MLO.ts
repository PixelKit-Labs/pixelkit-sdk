/**
 * @file useWifi7MLO.ts
 * @description Wi-Fi 7 (802.11be) Multi-Link Operation (MLO) links from `WifiInfo.getAffiliatedMloLinks()`
 * and `getAssociatedMloLinks()`: band, channel, RSSI, link speeds and state per link.
 * Values the platform reports as unknown are null. `isMloActive: false`, `links: []` and
 * `aggregateSpeedMbps: null` when the connected network is not a Wi-Fi 7 multi-link device.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, { type Wifi7MloResult, type MloLinkInfo } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useWifi7MLO';
export { type MloLinkInfo };

export interface Wifi7MloTelemetry {
  /** Whether this app could query MLO links (Android 14+ and the query did not throw). Not a hardware capability flag. */
  isSupported: boolean;
  /** Whether the station is associated to more than one link (`getAssociatedMloLinks().size > 1`). */
  isMloActive: boolean;
  /** Links of the access point multi-link device (`getAffiliatedMloLinks()`); each link's `state` says whether this station is associated to it. */
  links: MloLinkInfo[];
  /** Sum of `txLinkSpeedMbps` over the associated links (transmit direction only), or null when not multi-link or no link reported a speed. */
  aggregateSpeedMbps: number | null;
  /** Error message if Wi-Fi link inspection failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Queries the Wi-Fi subsystem for updated link telemetry. */
  refresh: () => void;
}

export function useWifi7MLO(): Wifi7MloTelemetry {
  const [data, setData] = useState<Wifi7MloResult>({
    isSupported: false,
    isMloActive: false,
    links: [],
    aggregateSpeedMbps: null,
    error: null,
  });

  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    PixelNative && data.isSupported ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setData({
        isSupported: false,
        isMloActive: false,
        links: [],
        aggregateSpeedMbps: null,
        error: 'PixelNative module unavailable',
      });
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getWifi7MloInfo();
      setData(res);
      setError(res.error ?? null);

      if (res.aggregateSpeedMbps !== null) {
        recordMetric(MODULE, 'aggregateSpeedMbps', res.aggregateSpeedMbps, 'hardware');
      }
      recordMetric(MODULE, 'mloLinksCount', res.links.length, 'hardware');

      logEvent(MODULE, 'queried wifi7 mlo info', {
        active: res.isMloActive,
        links: res.links.length,
        speed: res.aggregateSpeedMbps,
      });
    } catch (e) {
      const err = logError(MODULE, 'getWifi7MloInfo failed', e);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isSupported: data.isSupported,
    isMloActive: data.isMloActive,
    links: data.links,
    aggregateSpeedMbps: data.aggregateSpeedMbps,
    error,
    source,
    refresh,
  };
}
