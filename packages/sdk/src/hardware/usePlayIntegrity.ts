/**
 * @file usePlayIntegrity.ts
 * @description Hardware security feature report and Android Keystore key attestation.
 * Reads the `strongbox_keystore`, `hardware_keystore` and `keystore.app_attest_key` system features,
 * the `android.hardware.security.model.compatible` feature and whether Google Play Services is
 * installed. `requestAttestation` generates an attested EC key and returns the real certificate chain.
 * No Play Integrity API call is made and no integrity verdict is produced here.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, {
  type PlayIntegrityInfo,
  type HardwareAttestationResult,
} from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'usePlayIntegrity';

export { type PlayIntegrityInfo, type HardwareAttestationResult };

export interface PlayIntegrityState {
  /** True when the device declares StrongBox or hardware keystore, or Google Play Services is installed */
  isSupported: boolean;
  /** Whether the device declares the StrongBox keystore feature */
  hasStrongBox: boolean;
  /** StrongBox keystore feature version (`FeatureInfo.version`), or null when not declared */
  strongBoxVersion: number | null;
  /** Hardware keystore feature version (`FeatureInfo.version`), or null when not declared */
  hardwareKeystoreVersion: number | null;
  /** Whether device supports individual key attestation (android.hardware.keystore.app_attest_key) */
  hasAppAttestKey: boolean;
  /** Whether device satisfies Android hardware security model */
  securityModelCompatible: boolean;
  /** Whether Google Play Services is available and active */
  playServicesAvailable: boolean;
  /** Google Play Services version string */
  playServicesVersion: string | null;
  /** Whether a cryptographic attestation operation is running */
  isAttesting: boolean;
  /** Result of last key attestation */
  lastAttestation: HardwareAttestationResult | null;
  /** Latest error if attestation failed */
  error: string | null;
  /** Telemetry provenance */
  source: TelemetrySource;
  /** Generates an attested EC key in the Android Keystore (StrongBox when available) and returns its certificate chain */
  requestAttestation: (challenge?: string) => Promise<HardwareAttestationResult | null>;
  /** Re-read the device security features */
  refresh: () => PlayIntegrityInfo | null;
}

/**
 * Hook to read device security features and run Android Keystore key attestation.
 * The returned certificate chain is not verified by this hook; verify it server-side against the challenge.
 *
 * @example
 * ```typescript
 * const { isSupported, hasStrongBox, requestAttestation } = usePlayIntegrity();
 *
 * const onAttest = async () => {
 *   const attestation = await requestAttestation("app_session_nonce_123");
 *   console.log("Key security level:", attestation?.securityLevel);
 * };
 * ```
 */
export function usePlayIntegrity(): PlayIntegrityState {
  const [data, setData] = useState<PlayIntegrityInfo | null>(null);
  const [isAttesting, setIsAttesting] = useState<boolean>(false);
  const [lastAttestation, setLastAttestation] = useState<HardwareAttestationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): PlayIntegrityInfo | null => {
    if (!PixelNative) {
      logEvent(MODULE, 'native module absent; play integrity unavailable', undefined, 'warn');
      return null;
    }
    try {
      const info = PixelNative.getPlayIntegrityInfo();
      setData(info);
      if (info.error) {
        setError(info.error);
      } else {
        setError(null);
      }
      recordMetric(MODULE, 'isSupported', info.isSupported ? 1 : 0, info.isSupported ? 'hardware' : 'unavailable');
      recordMetric(MODULE, 'hasStrongBox', info.hasStrongBox ? 1 : 0, info.hasStrongBox ? 'hardware' : 'unavailable');
      if (info.strongBoxVersion !== null) {
        recordMetric(MODULE, 'strongBoxVersion', info.strongBoxVersion, 'hardware');
      }
      logEvent(MODULE, 'play integrity queried', {
        isSupported: info.isSupported,
        hasStrongBox: info.hasStrongBox,
        strongBoxVersion: info.strongBoxVersion,
        hardwareKeystoreVersion: info.hardwareKeystoreVersion,
        playServicesAvailable: info.playServicesAvailable,
      });
      return info;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'getPlayIntegrityInfo failed';
      setError(msg);
      logEvent(MODULE, 'getPlayIntegrityInfo error', { error: msg }, 'error');
      return null;
    }
  }, []);

  const requestAttestation = useCallback(
    async (challenge?: string): Promise<HardwareAttestationResult | null> => {
      if (!PixelNative) {
        setError('Native module not available');
        return null;
      }
      setIsAttesting(true);
      setError(null);
      const startMs = Date.now();
      try {
        const result = await PixelNative.attestHardwareKey(challenge ?? null);
        setLastAttestation(result);
        const durationMs = Date.now() - startMs;
        recordMetric(MODULE, 'attestationDurationMs', durationMs, 'hardware');
        logEvent(MODULE, 'hardware key attestation generated', {
          algorithm: result.algorithm,
          securityLevel: result.securityLevel,
          isStrongBoxBacked: result.isStrongBoxBacked,
          durationMs,
        });
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Key attestation failed';
        setError(msg);
        logEvent(MODULE, 'key attestation error', { error: msg }, 'error');
        return null;
      } finally {
        setIsAttesting(false);
      }
    },
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isHardware = Boolean(PixelNative && data?.isSupported);

  return {
    isSupported: data?.isSupported ?? false,
    hasStrongBox: data?.hasStrongBox ?? false,
    strongBoxVersion: data?.strongBoxVersion ?? null,
    hardwareKeystoreVersion: data?.hardwareKeystoreVersion ?? null,
    hasAppAttestKey: data?.hasAppAttestKey ?? false,
    securityModelCompatible: data?.securityModelCompatible ?? false,
    playServicesAvailable: data?.playServicesAvailable ?? false,
    playServicesVersion: data?.playServicesVersion ?? null,
    isAttesting,
    lastAttestation,
    error,
    source: isHardware ? 'hardware' : 'unavailable',
    requestAttestation,
    refresh,
  };
}
