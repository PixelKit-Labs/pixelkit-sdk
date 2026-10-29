/**
 * @file useBiometrics.ts
 * @description Fingerprint and face authentication through the platform BiometricPrompt.
 *
 * Two checks matter separately and are reported separately: a device can have the sensor but no
 * enrolled credential, in which case a prompt can never succeed and the caller should fall back to
 * a passcode path rather than showing a button that always fails.
 *
 * A failed prompt is not the same as a broken one. `authenticate` resolves false for a cancel or a
 * mismatch, and sets `error` only when the call itself failed, so a caller can tell the two apart.
 */

import { useState, useEffect, useCallback } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { logEvent, logError, traced, type TelemetrySource } from '../core/observability';
import { BiometricState } from '../core/types';

const MODULE = 'useBiometrics';

export function useBiometrics() {
  const [state, setState] = useState<BiometricState>({
    hasHardware: false,
    isEnrolled: false,
    supportedTypes: [],
  });
  const [hasChecked, setHasChecked] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<'success' | 'failed' | 'cancelled' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = hasChecked ? 'hardware' : 'unavailable';

  /** Re-reads sensor presence and enrolment, which change when the user adds a fingerprint. */
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await traced(MODULE, 'readCapabilities', async () => {
        const [hasHardware, isEnrolled, types] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        // Only the three modalities expo-local-authentication defines are named; any other value
        // is dropped rather than labelled as something it may not be.
        const supportedTypes: string[] = [];
        for (const t of types) {
          if (t === LocalAuthentication.AuthenticationType.FINGERPRINT) supportedTypes.push('Fingerprint');
          else if (t === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) supportedTypes.push('Face Unlock');
          else if (t === LocalAuthentication.AuthenticationType.IRIS) supportedTypes.push('Iris');
        }
        return { hasHardware, isEnrolled, supportedTypes };
      });
      setState(next);
      setHasChecked(true);
      setError(null);
      logEvent(MODULE, 'capabilities', next);
    } catch (e) {
      // Keep the conservative default rather than claiming hardware we could not confirm.
      setState({ hasHardware: false, isEnrolled: false, supportedTypes: [] });
      setError(logError(MODULE, 'capability read failed', e).message);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * Shows the system prompt. Resolves true only on success; a cancel or mismatch resolves false
   * without setting `error`, because neither is a fault.
   */
  const authenticate = useCallback(async (
    promptMessage: string = 'Verify identity with Pixel Biometrics',
  ): Promise<boolean> => {
    setError(null);
    if (!state.hasHardware || !state.isEnrolled) {
      const why = !state.hasHardware ? 'no biometric hardware' : 'nothing enrolled';
      setError(`Cannot prompt: ${why}`);
      logEvent(MODULE, 'authenticate refused', { reason: why }, 'warn');
      return false;
    }
    try {
      const result = await traced(MODULE, 'authenticate', () =>
        LocalAuthentication.authenticateAsync({
          promptMessage,
          cancelLabel: 'Cancel',
          fallbackLabel: 'Use Device Passcode',
          disableDeviceFallback: false,
        }),
      );
      if (result.success) {
        setLastResult('success');
        logEvent(MODULE, 'authenticated');
        return true;
      }
      // Distinguish a deliberate cancel from a rejected credential; neither is an error.
      const cancelled = 'error' in result && typeof result.error === 'string'
        && /cancel|user_cancel|system_cancel/i.test(result.error);
      setLastResult(cancelled ? 'cancelled' : 'failed');
      logEvent(MODULE, cancelled ? 'cancelled by user' : 'not recognised', undefined, 'warn');
      return false;
    } catch (e) {
      setLastResult('failed');
      setError(logError(MODULE, 'authenticate failed', e).message);
      return false;
    }
  }, [state.hasHardware, state.isEnrolled]);

  return {
    ...state,
    /** Whether the capability read has completed. */
    hasChecked,
    /** Outcome of the last prompt: success, failed, cancelled, or null before the first attempt. */
    lastResult,
    /** Set only when a call itself failed, not when the user cancelled or was not recognised. */
    error,
    source,
    authenticate,
    refresh,
  };
}
