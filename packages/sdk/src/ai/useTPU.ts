/**
 * @file useTPU.ts
 * @description Honest view of the Tensor TPU / on-device AI stack. The TPU is only reachable through
 * AICore (Gemini Nano via ML Kit) or LiteRT, so this hook reports what is verifiably present on the
 * device (AICore + Private Compute Services versions, NPU feature flag) and leaves inference metrics
 * null here; real Gemini Nano latency lives in `useGeminiNano` (PixelNano module). `benchmarkTPU` runs a
 * real JS matmul and reports it as a CPU-fallback number, clearly labelled.
 */

import { useCallback, useEffect, useState } from 'react';
import PixelNative, { type PackageVersion } from '@pixelkit-labs/native';
import { logEvent, type TelemetrySource } from '../core/observability';
import type { TPUAcceleration } from '../core/types';

const MODULE = 'useTPU';
const AICORE = 'com.google.android.aicore';
const PCS = 'com.google.android.as.oss';

export function useTPU() {
  const [aicore, setAicore] = useState<PackageVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pcs, setPcs] = useState<PackageVersion | null>(null);
  const [hasNpuFeature, setHasNpuFeature] = useState<boolean | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState<boolean>(false);
  const [cpuFallbackLatencyMs, setCpuFallbackLatencyMs] = useState<number | null>(null);

  // getPackageVersion returns an object even when the package is absent, so presence is `installed`.
  const source: TelemetrySource = aicore?.installed === true ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative) { logEvent(MODULE, 'native module absent; AI stack detection unavailable', undefined, 'warn'); return; }
    try {
      const a = PixelNative.getPackageVersion(AICORE);
      const p = PixelNative.getPackageVersion(PCS);
      setAicore(a); setPcs(p);
      setHasNpuFeature(
        PixelNative.hasSystemFeature('android.hardware.npu') ||
        PixelNative.hasSystemFeature('android.hardware.neural_processing_unit')
      );
      logEvent(MODULE, 'ai stack', { aicore: a.versionName, pcs: p.versionName });
    } catch (e: any) { setError(e?.message ?? 'detect error');
      logEvent(MODULE, 'detect error', { message: e?.message }, 'error'); }
  }, []);

  /** Real 256×256 float matmul on the JS thread. Measures CPU fallback, not the TPU. */
  const benchmarkTPU = useCallback(async (): Promise<TPUAcceleration> => {
    setIsBenchmarking(true);
    await new Promise(r => setTimeout(r, 30));
    const n = 256;
    const a = new Float32Array(n * n).map(() => Math.random());
    const b = new Float32Array(n * n).map(() => Math.random());
    const c = new Float32Array(n * n);
    const start = performance.now();
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { const aik = a[i * n + k]; for (let j = 0; j < n; j++) c[i * n + j] += aik * b[k * n + j]; }
    const ms = Number((performance.now() - start).toFixed(1));
    setCpuFallbackLatencyMs(ms);
    setIsBenchmarking(false);
    logEvent(MODULE, 'cpu fallback matmul', { n, ms });
    return {
      activeDelegate: 'CPU Fallback',
      isHardwareAccelerated: false,
      lastInferenceLatencyMs: ms,
      throughputTokensPerSec: null,
      memoryFootprintMB: null,
    };
  }, []);

  return {
    /** AICore (Gemini Nano host) installed and version */
    aicoreInstalled: aicore?.installed ?? null,
    aicoreVersion: aicore?.versionName ?? null,
    privateComputeServicesVersion: pcs?.versionName ?? null,
    /** Android 17 NPU feature flag as declared by the device */
    hasNpuFeature,
    /** No delegate is active before this hook's CPU-only benchmark runs. */
    activeDelegate: cpuFallbackLatencyMs != null ? 'CPU Fallback' as const : null,
    isHardwareAccelerated: false,
    /** Always null here; see `useGeminiNano.lastLatencyMs` for measured Gemini Nano latency */
    lastInferenceLatencyMs: null as number | null,
    throughputTokensPerSec: null as number | null,
    memoryFootprintMB: null as number | null,
    /** JS matmul time, labelled as CPU fallback */
    cpuFallbackLatencyMs,
    isBenchmarking,
    benchmarkTPU,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    source,
  };
}
