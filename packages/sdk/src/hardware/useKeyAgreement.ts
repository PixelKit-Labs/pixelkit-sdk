/**
 * @file useKeyAgreement.ts
 * @description ECDH key agreement with a private key generated in the Android Keystore
 * (PURPOSE_AGREE_KEY). The StrongBox flag is requested when the device declares
 * `android.hardware.strongbox_keystore`; the level the key really got is read back from
 * `KeyInfo.getSecurityLevel()` (API 31+) and is null when it cannot be read.
 * The private key stays in the Keystore and is not exported by this API.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, {
  type KeyAgreementKeyPairResult,
  type SharedSecretResult,
} from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useKeyAgreement';
export { type KeyAgreementKeyPairResult, type SharedSecretResult };

export interface KeyAgreementTelemetry {
  /** Whether the device declares the `android.hardware.strongbox_keystore` feature. */
  isStrongBoxSupported: boolean;
  /** Latest error message if keypair generation or secret derivation failed. */
  error: string | null;
  /** Provenance of the data: 'hardware' or 'unavailable'. */
  source: TelemetrySource;
  /** Generates an EC keypair in the Android Keystore with PURPOSE_AGREE_KEY; `securityLevel` is read from `KeyInfo`. */
  generateKeyPair: (alias: string, preferStrongBox?: boolean) => Promise<KeyAgreementKeyPairResult>;
  /** Computes an ECDH shared secret with the Keystore private key and the peer's public key. */
  deriveSharedSecret: (alias: string, peerPublicKeyBase64: string) => Promise<SharedSecretResult>;
}

export function useKeyAgreement(): KeyAgreementTelemetry {
  const [isStrongBoxSupported, setIsStrongBoxSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative) {
      setIsStrongBoxSupported(false);
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const hasStrongBox = PixelNative.hasSystemFeature('android.hardware.strongbox_keystore');
      setIsStrongBoxSupported(hasStrongBox);
      recordMetric(MODULE, 'isStrongBoxSupported', hasStrongBox, 'hardware');
      logEvent(MODULE, 'checked strongbox support', { supported: hasStrongBox });
    } catch (e) {
      logError(MODULE, 'check strongbox support failed', e);
    }
  }, []);

  const generateKeyPair = useCallback(
    async (alias: string, preferStrongBox: boolean = true): Promise<KeyAgreementKeyPairResult> => {
      if (!PixelNative) {
        return {
          alias,
          publicKeyBase64: null,
          securityLevel: null,
          isStrongBoxSupported: false,
          error: 'PixelNative module unavailable',
        };
      }

      try {
        const res = await PixelNative.generateKeyAgreementKeyPair(alias, preferStrongBox);
        setError(res.error ?? null);
        logEvent(MODULE, 'generated key agreement keypair', {
          alias,
          level: res.securityLevel,
        });
        return res;
      } catch (e) {
        const err = logError(MODULE, 'generateKeyAgreementKeyPair failed', e);
        setError(err.message);
        return {
          alias,
          publicKeyBase64: null,
          securityLevel: null,
          isStrongBoxSupported,
          error: err.message,
        };
      }
    },
    [isStrongBoxSupported]
  );

  const deriveSharedSecret = useCallback(
    async (alias: string, peerPublicKeyBase64: string): Promise<SharedSecretResult> => {
      if (!PixelNative) {
        return {
          sharedSecretBase64: null,
          secretLengthBytes: 0,
          error: 'PixelNative module unavailable',
        };
      }

      try {
        const res = await PixelNative.deriveSharedSecret(alias, peerPublicKeyBase64);
        setError(res.error ?? null);
        if (res.sharedSecretBase64) {
          logEvent(MODULE, 'derived shared secret', { bytes: res.secretLengthBytes });
          recordMetric(MODULE, 'derivedSecretBytes', res.secretLengthBytes, 'hardware');
        }
        return res;
      } catch (e) {
        const err = logError(MODULE, 'deriveSharedSecret failed', e);
        setError(err.message);
        return {
          sharedSecretBase64: null,
          secretLengthBytes: 0,
          error: err.message,
        };
      }
    },
    []
  );

  return {
    isStrongBoxSupported,
    error,
    source,
    generateKeyPair,
    deriveSharedSecret,
  };
}
