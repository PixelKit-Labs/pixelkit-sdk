/**
 * @file useGPU.ts
 * @description GPU identity and real frame pacing. Renderer/vendor/GL version are read through an
 * offscreen EGL context; the Vulkan version comes from the `android.hardware.vulkan.version` feature.
 * Frame timing is measured on the UI thread with `Choreographer` (1 s windows: fps, average and max
 * frame interval, jank frames above 1.5× the display's expected interval). GPU utilisation and GPU
 * memory are not readable by an app, so memory is reported as null rather than invented; `useSystemLoad`
 * reads both through the ADB daemon. This hook does not use the daemon.
 */

import { useEffect, useState } from 'react';
import PixelNative, { type FrameStats, type GpuInfo } from '@pixelkit-labs/native';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';

const MODULE = 'useGPU';

/**
 * Hook exposing GPU identity and live frame pacing.
 *
 * @example
 * ```typescript
 * const { gpuRenderer, frameRenderTimeMs, measuredFps, droppedFrameCount, isStuttering } = useGPU();
 * ```
 */
export function useGPU() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [droppedFrameCount, setDroppedFrameCount] = useState<number>(0);

  const source: TelemetrySource = PixelNative ? 'hardware' : 'unavailable';

  useEffect(() => {
    if (!PixelNative) { logEvent(MODULE, 'native module absent; GPU telemetry unavailable', undefined, 'warn'); return; }
    try {
      const g = PixelNative.getGpuInfo();
      setGpu(g);
      logEvent(MODULE, 'gpu', g as unknown as Record<string, unknown>);
    } catch (e: any) { setError(e?.message ?? 'getGpuInfo error');
      logEvent(MODULE, 'getGpuInfo error', { message: e?.message }, 'error'); }
    const sub = PixelNative.addListener('onFrameStats', s => {
      setStats(s);
      setDroppedFrameCount(c => c + s.jankFrames);
      recordMetric(MODULE, 'fps', s.fps, 'hardware');
      recordMetric(MODULE, 'avgFrameMs', s.avgFrameMs, 'hardware');
    });
    return () => sub.remove();
  }, []);

  const expected = stats?.expectedFrameMs ?? 8.33;

  return {
    /** GL_RENDERER string, e.g. "PowerVR ..." (null until read) */
    gpuRenderer: gpu?.renderer ?? null,
    gpuVendor: gpu?.vendor ?? null,
    /** e.g. "OpenGL ES 3.2 ... / Vulkan 1.3" */
    graphicsApi: gpu ? [gpu.glVersion, gpu.vulkanVersion ? `Vulkan ${gpu.vulkanVersion}` : null].filter(Boolean).join(' / ') : null,
    /** Average UI-thread frame interval over the last second, ms (null until first window) */
    frameRenderTimeMs: stats ? Number(stats.avgFrameMs.toFixed(2)) : null,
    maxFrameMs: stats ? Number(stats.maxFrameMs.toFixed(2)) : null,
    /** Frames actually presented per second */
    measuredFps: stats ? Math.round(stats.fps) : null,
    /** Cumulative frames slower than 1.5× the expected interval */
    droppedFrameCount,
    jankFramesLastSecond: stats?.jankFrames ?? 0,
    /** Frame budget for the current display mode (8.33 ms at 120 Hz, 16.67 ms at 60 Hz) */
    targetBudgetMs: Number(expected.toFixed(2)),
    isStuttering: stats ? stats.avgFrameMs > expected * 1.5 : false,
    /** Always null here: not readable by an app. `useSystemLoad().gpuMemoryUsedMB` is the daemon-sourced value. */
    gpuMemoryUsageMB: null as number | null,
    /** Latest failure message, or null. Failures are also logged and counted. */
    error,
    /** Telemetry provenance */
    source,
  };
}
