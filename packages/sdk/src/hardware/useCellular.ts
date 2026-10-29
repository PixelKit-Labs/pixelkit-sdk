/**
 * @file useCellular.ts
 * @description Mobile network telemetry on `expo-cellular`: carrier, radio generation and network codes.
 *
 * `useNetwork` can tell you the connection is cellular; it cannot tell you whether that is 5G or
 * 2G, or which carrier is serving it. That distinction matters when deciding whether to stream, and
 * it is the difference between the modem being described and the modem being read.
 *
 * Two caveats worth knowing. `generation` reflects the current data connection, so it changes as
 * the phone moves and reads UNKNOWN with no cellular data attached, including on Wi-Fi only. And
 * carrier and network codes need the phone-state permission on Android; without it they stay null
 * rather than being guessed at.
 */

import { useCallback, useEffect, useState } from 'react';
import * as Cellular from 'expo-cellular';
import { logEvent, type TelemetrySource } from '../core/observability';

const MODULE = 'useCellular';

/** Human-readable radio generation. */
export type CellularGenerationLabel = 'unknown' | '2G' | '3G' | '4G' | '5G';

function generationLabel(value: Cellular.CellularGeneration | null): CellularGenerationLabel {
  switch (value) {
    case Cellular.CellularGeneration.CELLULAR_2G: return '2G';
    case Cellular.CellularGeneration.CELLULAR_3G: return '3G';
    case Cellular.CellularGeneration.CELLULAR_4G: return '4G';
    case Cellular.CellularGeneration.CELLULAR_5G: return '5G';
    default: return 'unknown';
  }
}

export function useCellular() {
  const [generation, setGeneration] = useState<CellularGenerationLabel>('unknown');
  const [carrierName, setCarrierName] = useState<string | null>(null);
  const [isoCountryCode, setIsoCountryCode] = useState<string | null>(null);
  const [mobileCountryCode, setMobileCountryCode] = useState<string | null>(null);
  const [mobileNetworkCode, setMobileNetworkCode] = useState<string | null>(null);
  const [allowsVoip, setAllowsVoip] = useState<boolean | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [hasRead, setHasRead] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasRead ? 'hardware' : 'unavailable';

  /** Re-reads everything the platform will answer without prompting. */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [gen, carrier, iso, mcc, mnc, voip] = await Promise.all([
        Cellular.getCellularGenerationAsync().catch(() => null),
        Cellular.getCarrierNameAsync().catch(() => null),
        Cellular.getIsoCountryCodeAsync().catch(() => null),
        Cellular.getMobileCountryCodeAsync().catch(() => null),
        Cellular.getMobileNetworkCodeAsync().catch(() => null),
        Cellular.allowsVoipAsync().catch(() => null),
      ]);
      setGeneration(generationLabel(gen));
      setCarrierName(carrier);
      setIsoCountryCode(iso);
      setMobileCountryCode(mcc);
      setMobileNetworkCode(mnc);
      setAllowsVoip(voip);
      // `source` is hardware only when the platform answered at least one value.
      setHasRead([gen, carrier, iso, mcc, mnc, voip].some(v => v != null));
      logEvent(MODULE, 'cellular', { generation: generationLabel(gen), carrier, iso, mcc, mnc });
    } catch (e: any) {
      setError(e?.message ?? 'Could not read cellular state');
      logEvent(MODULE, 'read error', { message: e?.message }, 'error');
    }
  }, []);

  /**
   * Asks for the phone-state permission, which is what unlocks carrier and network codes on
   * Android. Generation is readable without it.
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const p = await Cellular.requestPermissionsAsync();
      setPermissionGranted(p.granted);
      if (p.granted) await refresh();
      logEvent(MODULE, 'permission', { granted: p.granted });
      return p.granted;
    } catch (e: any) {
      setError(e?.message ?? 'Permission request failed');
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    Cellular.getPermissionsAsync()
      .then(p => setPermissionGranted(p.granted))
      .catch(() => setPermissionGranted(false));
    void refresh();
  }, [refresh]);

  return {
    /** Radio generation of the current data connection. */
    generation,
    /** True when the phone is on 5G right now. */
    is5G: generation === '5G',
    /** Carrier name; null without the phone-state permission. */
    carrierName,
    /** ISO country of the SIM, for example "gb". */
    isoCountryCode,
    /** Mobile country code, the first half of the network identifier. */
    mobileCountryCode,
    /** Mobile network code, the second half. Together these identify the carrier globally. */
    mobileNetworkCode,
    /** Whether the carrier permits voice over IP. Null when it cannot be determined. */
    allowsVoip,
    /** Whether the phone-state permission has been granted. */
    permissionGranted,
    error,
    source,

    refresh,
    requestPermission,
  };
}
