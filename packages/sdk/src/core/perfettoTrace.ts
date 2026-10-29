/**
 * @file perfettoTrace.ts
 * @description Pure interpretation of the native Perfetto start/stop results. A trace counts as
 * started only when the native module says so, and as saved only when it names a file with a
 * non-zero size; anything else becomes an error message, never a path.
 */

import type { PerfettoStartResult, PerfettoStopResult } from '@pixelkit-labs/native';

export interface PerfettoStartOutcome {
  started: boolean;
  activeCategories: string[];
  error: string | null;
}

export interface PerfettoStopOutcome {
  path: string | null;
  sizeBytes: number | null;
  error: string | null;
}

export function perfettoStartOutcome(res: PerfettoStartResult): PerfettoStartOutcome {
  if (res.started) {
    return { started: true, activeCategories: res.activeCategories, error: null };
  }
  return {
    started: false,
    activeCategories: [],
    error: res.error ?? 'The native module did not start a trace and gave no reason',
  };
}

export function perfettoStopOutcome(res: PerfettoStopResult): PerfettoStopOutcome {
  const hasFile = typeof res.path === 'string' && res.path.length > 0 && (res.sizeBytes ?? 0) > 0;
  if (hasFile) {
    return { path: res.path, sizeBytes: res.sizeBytes, error: res.error };
  }
  return {
    path: null,
    sizeBytes: res.sizeBytes,
    error: res.error ?? 'The native module reported no trace file and gave no reason',
  };
}
