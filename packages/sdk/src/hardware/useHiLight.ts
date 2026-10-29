/**
 * @file useHiLight.ts
 * @description State machine and hardware driver for the Pixel 11 Pro HiLight LED array.
 *
 * Physical device: 8 RGB LEDs around the rear flash (Light.LIGHT_TYPE_APPLICATION, API 37).
 * Android restricts CONTROL_DEVICE_LIGHTS to signature|privileged permissions, which only
 * Google system apps and android.uid.shell (UID 2000) hold.
 *
 * Operation modes:
 * 1. Hardware mode: When the PixelKit ADB daemon is running (scripts/hilight-daemon, started via
 *    `npm run hilight:daemon`), this hook talks to 127.0.0.1:11080 to drive the physical LEDs (source: 'hardware').
 * 2. Unavailable: with no daemon the LEDs cannot be driven, so availability is 'unavailable' and
 *    every control function refuses (resolves false and sets `error`). Nothing is mirrored on screen
 *    as though it were the hardware. State (`isActive`, `mode`, `currentColor`) changes only after
 *    the daemon answered 2xx to the command.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { HardwareAvailability } from '../core/capabilities';
import { useCapabilities } from './useCapabilities';
import { logEvent, logError, traced, type TelemetrySource } from '../core/observability';

const MODULE = 'useHiLight';

export type HiLightMode =
  | 'off'
  | 'glow'
  | 'breathing'
  | 'pulse'
  | 'gemini_thinking'
  | 'incoming_call'
  | 'notification';

export interface HiLightState {
  /** Latest failure message, or null. Failures are also logged and counted. */
  error: string | null;
  /** 'hardware' when the daemon drives the LEDs, 'unavailable' without it, 'unsupported' if no array */
  availability: HardwareAvailability;
  /** True when the device physically has the HiLight LED array */
  isHardwareSupported: boolean;
  /** Telemetry provenance: 'hardware' only when the daemon is connected */
  source: TelemetrySource;
  /** True when the local PixelKit ADB daemon is actively connected */
  isDaemonConnected: boolean;
  /** Whether the HiLight ring is illuminated */
  isActive: boolean;
  /** Current RGB hex colour displayed by the ring */
  currentColor: string;
  /** Active illumination animation pattern */
  mode: HiLightMode;
  /**
   * Brightness level, 0.0 to 1.0, sent with the next lit command. Initial value 0.85 is the hook's
   * own default request, not a value read from the LEDs.
   */
  brightness: number;
  /** Probe local daemon status */
  refreshDaemonStatus: () => Promise<boolean>;
  /** Set custom color for the ring. Resolves true only when the daemon accepted the command. */
  setColor: (hexColor: string) => Promise<boolean>;
  /**
   * Change the active lighting pattern, optionally with a colour sent in the same daemon command.
   * Resolves true only when the daemon accepted the command.
   */
  setMode: (mode: HiLightMode, hexColor?: string) => Promise<boolean>;
  /**
   * Set LED ring brightness. While the ring is lit the new level is sent to the daemon and the
   * result is returned; while it is off the level is kept for the next lit command and true is returned.
   */
  setBrightness: (level: number) => Promise<boolean>;
  /** Show the Gemini-thinking pulse pattern. Resolves true only when the daemon accepted the command. */
  triggerGeminiPulse: (durationMs?: number) => Promise<boolean>;
  /** Trigger custom color alert for favorite contact or event. Resolves true only when the daemon accepted it. */
  triggerContactAlert: (hexColor: string, durationMs?: number) => Promise<boolean>;
  /** Turn off the HiLight ring. Resolves true only when the daemon accepted the command. */
  turnOff: () => Promise<boolean>;
  /** Toggle HiLight on/off. Resolves true only when the daemon accepted the command. */
  toggle: () => Promise<boolean>;
}

const DAEMON_URL = 'http://127.0.0.1:11080';
const GEMINI_CYAN = '#00E5FF';
const GOOGLE_BLUE = '#8AB4F8';

async function sendDaemonCommand(path: string, payload?: object): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600);
    const res = await fetch(`${DAEMON_URL}${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    // The status poll runs every 5 s, so a missing daemon is expected and must not spam the log.
    // Only real command failures are recorded; the caller reports the state change.
    if (path !== '/status') logError(MODULE, 'daemon command failed', e, { path });
    return false;
  }
}

/**
 * Pixel 11 Pro Hardware Hook for the rear camera bar "HiLight" multi-color LED ring.
 *
 * @example
 * ```typescript
 * const hilight = useHiLight();
 * // Trigger cyan pulse when Gemini is generating tokens
 * hilight.triggerGeminiPulse(3000);
 * ```
 */
export function useHiLight(): HiLightState {
  const { hasHiLight } = useCapabilities();
  const [isDaemonConnected, setIsDaemonConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [currentColor, setCurrentColor] = useState<string>(GEMINI_CYAN);
  const [mode, setModeState] = useState<HiLightMode>('off');
  const [brightness, setBrightnessState] = useState<number>(0.85);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The LEDs are either driven for real or they are not. When the daemon is not running there is
  // no on-screen substitute: availability is 'unavailable' and the controls refuse rather than
  // pretending a colour was shown.
  const availability: HardwareAvailability = !hasHiLight
    ? 'unsupported'
    : isDaemonConnected
    ? 'hardware'
    : 'unavailable';

  const source: TelemetrySource = isDaemonConnected && hasHiLight ? 'hardware' : 'unavailable';

  const checkDaemon = useCallback(async () => {
    if (!hasHiLight) return false;
    const ok = await sendDaemonCommand('/status');
    // Log transitions only: this polls every 5 s and a steady state is not news.
    setIsDaemonConnected(prev => {
      if (prev !== ok) logEvent(MODULE, ok ? 'daemon connected' : 'daemon lost', undefined, ok ? 'info' : 'warn');
      return ok;
    });
    return ok;
  }, [hasHiLight]);

  useEffect(() => {
    checkDaemon();
    const interval = setInterval(checkDaemon, 5000);
    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkDaemon]);

  const fail = useCallback((message: string) => {
    setError(message);
    logEvent(MODULE, message, undefined, 'warn');
  }, []);

  /**
   * Runs one daemon command. Refuses when the device has no HiLight array or the daemon is not
   * connected; otherwise resolves with the daemon's answer and records `error` on failure.
   */
  const runCommand = useCallback(
    async (path: string, payload?: object): Promise<boolean> => {
      if (!hasHiLight) {
        fail('This device has no HiLight LED array');
        return false;
      }
      if (!isDaemonConnected) {
        fail('PixelKit HiLight daemon is not connected');
        return false;
      }
      const ok = await sendDaemonCommand(path, payload);
      if (!ok) {
        fail('HiLight daemon rejected the command or did not answer');
        // A failed command usually means the daemon went away; refresh the connection state.
        void checkDaemon();
        return false;
      }
      setError(null);
      return true;
    },
    [hasHiLight, isDaemonConnected, fail, checkDaemon]
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setColor = useCallback(
    async (hexColor: string): Promise<boolean> => {
      const newMode: HiLightMode = mode === 'off' ? 'glow' : mode;
      const ok = await runCommand('/set', {
        color: hexColor,
        mode: newMode,
        brightness,
        durationMs: 0,
      });
      if (!ok) return false;
      clearTimer();
      setCurrentColor(hexColor);
      setModeState(newMode);
      setIsActive(true);
      return true;
    },
    [runCommand, clearTimer, mode, brightness]
  );

  const setMode = useCallback(
    async (newMode: HiLightMode, hexColor?: string): Promise<boolean> => {
      const active = newMode !== 'off';
      const color = hexColor ?? currentColor;
      const ok = active
        ? await runCommand('/set', {
            color,
            mode: newMode,
            brightness,
            durationMs: 0,
          })
        : await runCommand('/off');
      if (!ok) return false;
      clearTimer();
      if (active) setCurrentColor(color);
      setModeState(newMode);
      setIsActive(active);
      return true;
    },
    [runCommand, clearTimer, currentColor, brightness]
  );

  const setBrightness = useCallback(
    async (level: number): Promise<boolean> => {
      const clamped = Math.max(0.0, Math.min(1.0, level));
      if (isActive) {
        const ok = await runCommand('/set', {
          color: currentColor,
          mode,
          brightness: clamped,
          durationMs: 0,
        });
        if (!ok) return false;
        clearTimer();
      }
      setBrightnessState(clamped);
      return true;
    },
    [runCommand, clearTimer, isActive, currentColor, mode]
  );

  const startTimedCommand = useCallback(
    async (color: string, newMode: HiLightMode, durationMs: number): Promise<boolean> => {
      const ok = await runCommand('/set', { color, mode: newMode, brightness, durationMs });
      if (!ok) return false;
      clearTimer();
      setCurrentColor(color);
      setModeState(newMode);
      setIsActive(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setModeState('off');
        setIsActive(false);
      }, durationMs);
      return true;
    },
    [runCommand, clearTimer, brightness]
  );

  const triggerGeminiPulse = useCallback(
    (durationMs: number = 4000) => startTimedCommand(GEMINI_CYAN, 'gemini_thinking', durationMs),
    [startTimedCommand]
  );

  const triggerContactAlert = useCallback(
    (hexColor: string, durationMs: number = 5000) => startTimedCommand(hexColor, 'incoming_call', durationMs),
    [startTimedCommand]
  );

  const turnOff = useCallback(async (): Promise<boolean> => {
    const ok = await runCommand('/off');
    if (!ok) return false;
    clearTimer();
    setModeState('off');
    setIsActive(false);
    return true;
  }, [runCommand, clearTimer]);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (isActive) return turnOff();
    const ok = await runCommand('/set', {
      color: GOOGLE_BLUE,
      mode: 'glow',
      brightness,
      durationMs: 0,
    });
    if (!ok) return false;
    clearTimer();
    setCurrentColor(GOOGLE_BLUE);
    setModeState('glow');
    setIsActive(true);
    return true;
  }, [isActive, turnOff, runCommand, clearTimer, brightness]);

  return {
    availability,
    isHardwareSupported: hasHiLight,
    error,
    source,
    isDaemonConnected,
    isActive,
    currentColor,
    mode,
    brightness,
    refreshDaemonStatus: checkDaemon,
    setColor,
    setMode,
    setBrightness,
    triggerGeminiPulse,
    triggerContactAlert,
    turnOff,
    toggle,
  };
}
