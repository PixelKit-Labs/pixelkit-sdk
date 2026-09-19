/**
 * @file useTorch.ts
 * @description Rear LED flashlight controller backed by Android `CameraManager.setTorchMode` and,
 * on Android 13+, `turnOnTorchWithStrengthLevel` for variable brightness. State follows the system
 * torch callback, so toggles made by Quick Settings are reflected too. Nothing is simulated: when the
 * PixelNative module is absent the hook reports `isAvailable=false` and every action rejects.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PixelNative, { type TorchInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useTorch';

/**
 * Hook to control the physical rear camera LED flashlight.
 *
 * @example
 * ```typescript
 * const { isTorchOn, toggleTorch, startStrobe, stopStrobe, maxStrengthLevel } = useTorch();
 * await toggleTorch();
 * ```
 */
export function useTorch() {
  const [info, setInfo] = useState<TorchInfo | null>(() => {
    try {
      return PixelNative?.getTorchInfo() ?? null;
    } catch {
      return null;
    }
  });
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isStrobing, setIsStrobing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const strobeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const strobeState = useRef<boolean>(false);

  const source: TelemetrySource = PixelNative && info?.available ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; torch unavailable', undefined, 'warn');
      return;
    }
    let sub: { remove(): void } | null = null;
    try {
      const i = PixelNative.getTorchInfo();
      setInfo(i);
      logEvent(MODULE, 'torch info', i as unknown as Record<string, unknown>);
      sub = PixelNative.addListener('onTorchState', e => {
        if (!i.cameraId || e.cameraId === i.cameraId) {
          setIsTorchOn(e.enabled);
          recordMetric(MODULE, 'isTorchOn', e.enabled, 'hardware');
        }
      });
    } catch (e: any) {
      setError(e?.message ?? 'torch init failed');
      logEvent(MODULE, 'init error', { message: e?.message }, 'error');
    }
    return () => {
      sub?.remove();
      if (strobeTimer.current) clearInterval(strobeTimer.current);
      if (strobeState.current || isTorchOn) PixelNative?.setTorch(false).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Set torch on/off. `strengthLevel` (1..maxStrengthLevel) is honoured on Android 13+. */
  const setTorch = useCallback(async (on: boolean, strengthLevel?: number): Promise<boolean> => {
    if (!PixelNative) { setError('Torch hardware unavailable'); return false; }
    try {
      await PixelNative.setTorch(on, strengthLevel ?? null);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'torch failed');
      logEvent(MODULE, 'setTorch error', { on, message: e?.message }, 'error');
      return false;
    }
  }, []);

  const stopStrobe = useCallback((): void => {
    if (strobeTimer.current) { clearInterval(strobeTimer.current); strobeTimer.current = null; }
    strobeState.current = false;
    setIsStrobing(false);
    void setTorch(false);
  }, [setTorch]);

  const toggleTorch = useCallback(async (): Promise<boolean> => {
    if (isStrobing) stopStrobe();
    const next = !isTorchOn;
    const ok = await setTorch(next);
    return ok ? next : isTorchOn;
  }, [isStrobing, isTorchOn, setTorch, stopStrobe]);

  /** Strobe by toggling the hardware torch. The camera HAL needs ~50-100 ms per switch, so keep intervalMs ≥ 120. */
  const startStrobe = useCallback((intervalMs: number = 150): void => {
    if (strobeTimer.current) clearInterval(strobeTimer.current);
    setIsStrobing(true);
    strobeState.current = false;
    strobeTimer.current = setInterval(() => {
      strobeState.current = !strobeState.current;
      void setTorch(strobeState.current);
    }, Math.max(120, intervalMs));
  }, [setTorch]);

  return {
    /** True when a rear camera with a flash unit exists and the native module is present */
    isAvailable: !!info?.available,
    /** Whether the hardware LED is currently on (from the system torch callback) */
    isTorchOn,
    /** Whether strobe mode is active */
    isStrobing,
    /** Android 13+ variable torch brightness levels (null when unsupported) */
    maxStrengthLevel: info?.maxStrengthLevel ?? null,
    /** Last error message, if any */
    error,
    /** Telemetry provenance */
    source,
    setTorch,
    toggleTorch,
    startStrobe,
    stopStrobe,
  };
}
