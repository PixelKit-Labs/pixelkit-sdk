/**
 * @file useDisplay.ts
 * @description Pixel display controller: real refresh-rate mode, adaptive refresh rate (ARR) support,
 * HDR capabilities and resolution from Android `Display`, plus brightness (expo-brightness) and the
 * screen wake lock (expo-keep-awake). Refresh rate is re-read every 2 s because ARR changes it live.
 */

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Brightness from 'expo-brightness';
import PixelNative, { type DisplayInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useDisplay';
const KEEP_AWAKE_TAG = 'pixelkit-display';
const POLL_MS = 2000;

/**
 * Hook for display telemetry and control.
 *
 * @example
 * ```typescript
 * const { refreshRateHz, hasArrSupport, toggleKeepAwake, setScreenBrightness } = useDisplay();
 * ```
 */
export function useDisplay() {
  const [isKeepAwake, setIsKeepAwake] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [brightness, setBrightness] = useState<number>(0);
  const [display, setDisplay] = useState<DisplayInfo | null>(null);

  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Brightness.getBrightnessAsync()
        .then(b => setBrightness(Number(b.toFixed(2))))
        .catch(() => { /* permission not granted yet */ });
    }
    const native = PixelNative;
    if (!native) {
      logEvent(MODULE, 'native module absent; display telemetry unavailable', undefined, 'warn');
      return;
    }
    const read = () => {
      try {
        const d = native.getDisplayInfo();
        setDisplay(d);
        recordMetric(MODULE, 'refreshRateHz', d.refreshRate, 'hardware');
      } catch (e: any) {
        setError(e?.message ?? 'getDisplayInfo error');
      logEvent(MODULE, 'getDisplayInfo error', { message: e?.message }, 'error');
      }
    };
    read();
    const t = setInterval(read, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const toggleKeepAwake = useCallback(async (): Promise<void> => {
    try {
      if (isKeepAwake) { deactivateKeepAwake(KEEP_AWAKE_TAG); setIsKeepAwake(false); }
      else { await activateKeepAwakeAsync(KEEP_AWAKE_TAG); setIsKeepAwake(true); }
    } catch (e: any) {
      setError(e?.message ?? 'keep-awake error');
      logEvent(MODULE, 'keep-awake error', { message: e?.message }, 'error');
    }
  }, [isKeepAwake]);

  const setScreenBrightness = useCallback(async (value: number): Promise<void> => {
    const clamped = Math.max(0, Math.min(1, value));
    if (Platform.OS === 'web') return;
    try {
      await Brightness.setBrightnessAsync(clamped);
      setBrightness(clamped);
    } catch (e: any) {
      logEvent(MODULE, 'setBrightness error', { message: e?.message }, 'warn');
    }
  }, []);

  const [isHbmActive, setIsHbmActive] = useState<boolean>(false);

  /** Ask the system for a preferred refresh rate for this window (e.g. 120 during animation, 60 otherwise). */
  const setPreferredRefreshRate = useCallback(async (rateHz: number): Promise<boolean> => {
    if (!PixelNative) return false;
    try { return await PixelNative.setPreferredRefreshRate(rateHz); }
    catch (e: any) { logEvent(MODULE, 'setPreferredRefreshRate error', { message: e?.message }, 'warn'); return false; }
  }, []);

  /** Toggles High Brightness Mode (HBM) / peak luminance boost for sunlight legibility or HDR presentation. */
  const setHighBrightnessMode = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (!PixelNative) return false;
    try {
      const res = await PixelNative.setHighBrightnessMode(enabled);
      if (res) setIsHbmActive(enabled);
      return res;
    } catch (e: any) {
      logEvent(MODULE, 'setHighBrightnessMode error', { message: e?.message }, 'warn');
      return false;
    }
  }, []);

  /** Requests a specific physical display mode by ID (resolution + refresh rate configuration). */
  const setPreferredDisplayMode = useCallback(async (modeId: number): Promise<boolean> => {
    if (!PixelNative) return false;
    try { return await PixelNative.setPreferredDisplayMode(modeId); }
    catch (e: any) { logEvent(MODULE, 'setPreferredDisplayMode error', { message: e?.message }, 'warn'); return false; }
  }, []);

  /** Requests desired HDR headroom ratio on Android 14+ (1.0 = standard SDR, up to 3.0+ = peak HDR boost). */
  const setDesiredHdrHeadroom = useCallback(async (headroom: number): Promise<boolean> => {
    if (!PixelNative) return false;
    try { return await PixelNative.setDesiredHdrHeadroom(headroom); }
    catch (e: any) { logEvent(MODULE, 'setDesiredHdrHeadroom error', { message: e?.message }, 'warn'); return false; }
  }, []);

  return {
    isKeepAwake,
    toggleKeepAwake,
    brightness,
    setScreenBrightness,
    /** Current display mode refresh rate in Hz (live; changes with ARR). 0 until the first read. */
    refreshRateHz: display ? Math.round(display.refreshRate) : 0,
    /** Android 16+ adaptive refresh rate support flag (null if unknown) */
    hasArrSupport: display?.hasArrSupport ?? null,
    /** All refresh rates the panel can drive, e.g. [120, 60, 40, 30, 24, 20, 15, 10, 5, 2, 1] */
    supportedRefreshRates: display?.supportedRefreshRates ?? display?.modes.map(m => m.refreshRate) ?? [],
    /** Physical panel resolution of the active mode */
    resolution: display ? { width: display.physicalWidth, height: display.physicalHeight, densityDpi: display.densityDpi } : null,
    /** HDR types: 1 Dolby Vision, 2 HDR10, 3 HLG, 4 HDR10+ */
    hdrTypes: display?.hdrTypes ?? [],
    isHdr: display?.isHdr ?? false,
    maxLuminance: display?.maxLuminance ?? null,
    /** Current HDR to SDR luminance boost ratio (Android 14+ / API 34+), or null if not reported */
    hdrSdrRatio: display?.hdrSdrRatio ?? null,
    /** Whether High Brightness Mode (HBM) override is currently engaged */
    isHbmActive,
    setPreferredRefreshRate,
    setHighBrightnessMode,
    setPreferredDisplayMode,
    setDesiredHdrHeadroom,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Telemetry provenance */
    source,
  };
}
