/**
 * @file usePrivateSpace.ts
 * @description Android 15+ (API 35+) Private Space detection for the running process.
 *
 * Android hides the Private Space profile from third-party apps and exposes no auto-lock setting, so
 * `isPrivateSpaceConfigured` is true only when the app itself runs inside the profile and is
 * otherwise null; `reason` states what could not be read.
 */

import { useState, useEffect, useCallback } from 'react';
import PixelNative, { type PrivateSpaceInfo } from '@pixelkit-labs/native';
import { logEvent, logError, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'usePrivateSpace';

export interface PrivateSpaceTelemetry {
  /**
   * Whether the current application process runs inside the Private Space profile. False below
   * Android 15 and outside any profile; null when it runs in a profile whose type cannot be read.
   */
  isInsidePrivateSpace: boolean | null;
  /** True when the app runs inside the Private Space; null otherwise because Android hides the profile from apps. */
  isPrivateSpaceConfigured: boolean | null;
  /** Why unreadable values are null, or null before the first read. */
  reason: string | null;
  /** Error message if private profile querying failed. */
  error: string | null;
  /** 'hardware' once a read returned `isInsidePrivateSpace`, 'unavailable' otherwise. */
  source: TelemetrySource;
  /** Re-reads the user profile type. */
  refresh: () => void;
}

export function usePrivateSpace(): PrivateSpaceTelemetry {
  const [data, setData] = useState<PrivateSpaceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source: TelemetrySource =
    PixelNative && data && data.isInsidePrivateSpace !== null ? 'hardware' : 'unavailable';

  const refresh = useCallback(() => {
    if (!PixelNative) {
      setData(null);
      setError('PixelNative module unavailable');
      return;
    }

    try {
      const res = PixelNative.getPrivateSpaceInfo();
      setData(res);
      setError(res.error ?? null);
      if (res.isInsidePrivateSpace !== null) {
        recordMetric(MODULE, 'isInsidePrivateSpace', res.isInsidePrivateSpace, 'hardware');
      }
      logEvent(MODULE, 'queried private space status', {
        inside: res.isInsidePrivateSpace,
        configured: res.isPrivateSpaceConfigured,
      });
    } catch (e) {
      const err = logError(MODULE, 'getPrivateSpaceInfo failed', e);
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    isInsidePrivateSpace: data ? data.isInsidePrivateSpace : null,
    isPrivateSpaceConfigured: data ? data.isPrivateSpaceConfigured : null,
    reason: data ? data.reason : null,
    error,
    source,
    refresh,
  };
}
