/**
 * @file appFunctionResult.ts
 * @description Interprets the payload `PixelNative.executeAppFunction` resolves with. The module
 * resolves `status: 'success'` only for an effect it performed, `status: 'error'` with a message for
 * an expected failure, and rejects for an id it does not list.
 */

import type { AppFunctionExecution } from '@pixelkit-labs/native';

/** The failure message for a native result, or null when the function really ran. */
export function nativeAppFunctionError(functionId: string, result: AppFunctionExecution): string | null {
  if (result.status === 'success') return null;
  if (typeof result.message === 'string' && result.message.length > 0) return result.message;
  return `AppFunction ${functionId} reported status ${String(result.status)}`;
}
