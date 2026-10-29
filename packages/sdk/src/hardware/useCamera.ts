/**
 * @file useCamera.ts
 * @description Camera control and capture on `expo-camera`: lens selection, zoom, flash, torch,
 * still photos and video recording.
 *
 * The hook owns a ref to a `CameraView` and drives it, so a screen only has to render the view and
 * attach `cameraRef`. Capture is real: `takePicture` resolves with a file on disk and its
 * dimensions, `startRecording` resolves with a video file when the recording ends.
 *
 * Two things about this device that the API does not make obvious:
 * - `zoom` is a fraction of the lens range from 0 to 1, not an optical multiplier. A "5x" figure
 *   from the Pixel Camera app does not map onto it, so this hook exposes the fraction honestly and
 *   offers `setZoomStep` for evenly spaced steps.
 * - Camera Looks, Super Res Zoom and the low-light video mode belong to the Pixel Camera app and
 *   are not reachable from a third-party app. `selectedLook` is a label for your own interface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraView, type CameraRecordingOptions } from 'expo-camera';
import { logEvent, recordMetric, type TelemetrySource, noteExpected } from '../core/observability';
import type { CameraLook, CameraTelemetry } from '../core/types';

const MODULE = 'useCamera';

/** Whether the view is configured for stills or video. Recording requires 'video'. */
export type CameraMode = 'picture' | 'video';

export interface TakePictureOptions {
  /** 0..1 JPEG quality, defaulting to 0.85. */
  quality?: number;
  /** Also return the image as base64, which is what the AI hooks consume. */
  base64?: boolean;
  /** Include EXIF metadata in the result. */
  exif?: boolean;
  /** Suppress the shutter sound where the platform permits it. */
  shutterSound?: boolean;
}

export interface StartRecordingOptions {
  /** Stop automatically after this many seconds. */
  maxDurationSeconds?: number;
  /** Stop automatically at this file size in bytes. */
  maxFileSizeBytes?: number;
  /** Mirror the recording, which matches what the user saw on a front-facing preview. */
  mirror?: boolean;
}

export interface CapturedPhoto {
  uri: string;
  width: number;
  height: number;
  base64?: string;
  exif?: unknown;
}

export function useCamera() {
  /** Attach this to the rendered `<CameraView ref={cameraRef} />`. */
  const cameraRef = useRef<CameraView | null>(null);

  const [cameraState, setCameraState] = useState<CameraTelemetry>({
    facing: 'back',
    // expo-camera zoom is a 0..1 fraction of the lens range; 0 is not zoomed.
    zoomFactor: 0,
    maxZoomFactor: 1,
    flashMode: 'auto',
    hasPermission: false,
    selectedLook: 'Original',
  });

  const [mode, setModeState] = useState<CameraMode>('picture');
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);

  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [lastVideoUri, setLastVideoUri] = useState<string | null>(null);

  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [availablePictureSizes, setAvailablePictureSizes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const source: TelemetrySource = cameraState.hasPermission ? 'hardware' : 'unavailable';

  useEffect(() => {
    Camera.requestCameraPermissionsAsync()
      .then(({ status }) =>
        setCameraState(prev => ({ ...prev, hasPermission: status === 'granted' })),
      )
      .catch(() => setCameraState(prev => ({ ...prev, hasPermission: false })));
    return () => {
      if (recordTimer.current) clearInterval(recordTimer.current);
    };
  }, []);

  /**
   * Call from the view's `onCameraReady`. Lens and picture-size lists only resolve once the
   * preview is running, so they are read here rather than on mount.
   */
  const handleCameraReady = useCallback(async () => {
    setIsReady(true);
    try {
      const lenses = await cameraRef.current?.getAvailableLensesAsync();
      if (lenses) setAvailableLenses(lenses);
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (sizes) setAvailablePictureSizes(sizes);
      logEvent(MODULE, 'camera ready', { lenses: lenses?.length ?? 0, sizes: sizes?.length ?? 0 });
    } catch (e: any) {
      logEvent(MODULE, 'capability read failed', { message: e?.message }, 'warn');
    }
  }, []);

  const toggleFacing = useCallback(() => {
    setCameraState(prev => ({ ...prev, facing: prev.facing === 'back' ? 'front' : 'back' }));
  }, []);

  /** Sets zoom as a fraction of the lens range, 0 to 1. */
  const setZoom = useCallback((fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction));
    setCameraState(prev => ({ ...prev, zoomFactor: Number(clamped.toFixed(3)) }));
  }, []);

  /** Evenly spaced zoom steps, for a control with discrete stops. */
  const setZoomStep = useCallback((step: number, totalSteps = 4) => {
    const safeTotal = Math.max(1, totalSteps);
    setZoom(Math.max(0, Math.min(safeTotal, step)) / safeTotal);
  }, [setZoom]);

  const setFlash = useCallback((flashMode: 'auto' | 'on' | 'off') => {
    setCameraState(prev => ({ ...prev, flashMode }));
  }, []);

  /** Continuous light, as distinct from the flash that fires only at capture. */
  const toggleTorch = useCallback(() => setIsTorchOn(prev => !prev), []);

  const setMode = useCallback((next: CameraMode) => {
    setModeState(next);
    logEvent(MODULE, 'mode', { mode: next });
  }, []);

  const setLook = useCallback((look: CameraLook) => {
    setCameraState(prev => ({ ...prev, selectedLook: look }));
  }, []);

  /** Takes a still. Resolves with the file on disk, or null when the capture fails. */
  const takePicture = useCallback(async (options?: TakePictureOptions): Promise<CapturedPhoto | null> => {
    if (!cameraRef.current) {
      setError('Camera view is not mounted; attach cameraRef to a CameraView');
      return null;
    }
    setError(null);
    setIsCapturing(true);
    const started = Date.now();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: options?.quality ?? 0.85,
        base64: options?.base64 ?? false,
        exif: options?.exif ?? false,
        shutterSound: options?.shutterSound ?? true,
      });
      if (!photo) {
        setError('Capture returned nothing');
        return null;
      }
      const result: CapturedPhoto = {
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        base64: photo.base64,
        exif: photo.exif,
      };
      setLastPhoto(result);
      recordMetric(MODULE, 'captureMs', Date.now() - started, 'hardware');
      logEvent(MODULE, 'photo', { width: photo.width, height: photo.height, ms: Date.now() - started });
      return result;
    } catch (e: any) {
      setError(e?.message ?? 'Capture failed');
      logEvent(MODULE, 'photo error', { message: e?.message }, 'error');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  /**
   * Starts recording and resolves when it ends, with the video file.
   * The view must be in `video` mode; this switches it if needed.
   */
  const startRecording = useCallback(async (options?: StartRecordingOptions): Promise<string | null> => {
    if (!cameraRef.current) {
      setError('Camera view is not mounted; attach cameraRef to a CameraView');
      return null;
    }
    if (isRecording) return null;
    setError(null);
    setModeState('video');
    setIsRecording(true);
    setRecordingSeconds(0);

    if (recordTimer.current) clearInterval(recordTimer.current);
    const startedAt = Date.now();
    recordTimer.current = setInterval(() => {
      setRecordingSeconds(Number(((Date.now() - startedAt) / 1000).toFixed(1)));
    }, 100);

    const recordingOptions: CameraRecordingOptions = {
      ...(options?.maxDurationSeconds ? { maxDuration: options.maxDurationSeconds } : {}),
      ...(options?.maxFileSizeBytes ? { maxFileSize: options.maxFileSizeBytes } : {}),
      ...(options?.mirror != null ? { mirror: options.mirror } : {}),
    };

    try {
      logEvent(MODULE, 'recording started', recordingOptions as Record<string, unknown>);
      // Resolves when stopRecording is called or a limit is reached.
      const video = await cameraRef.current.recordAsync(recordingOptions);
      const uri = video?.uri ?? null;
      setLastVideoUri(uri);
      const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(1));
      recordMetric(MODULE, 'recordingSeconds', seconds, 'hardware');
      logEvent(MODULE, 'recording finished', { seconds, uri: !!uri });
      return uri;
    } catch (e: any) {
      setError(e?.message ?? 'Recording failed');
      logEvent(MODULE, 'recording error', { message: e?.message }, 'error');
      return null;
    } finally {
      if (recordTimer.current) { clearInterval(recordTimer.current); recordTimer.current = null; }
      setIsRecording(false);
    }
  }, [isRecording]);

  /** Ends the recording; the promise from startRecording resolves with the file. */
  const stopRecording = useCallback(() => {
    if (!cameraRef.current || !isRecording) return;
    try {
      cameraRef.current.stopRecording();
    } catch (e: any) {
      setError(e?.message ?? 'Could not stop recording');
    }
  }, [isRecording]);

  const pausePreview = useCallback(async () => {
    try { await cameraRef.current?.pausePreview(); } catch { noteExpected(MODULE, 'preview view unmounted'); }
  }, []);

  const resumePreview = useCallback(async () => {
    try { await cameraRef.current?.resumePreview(); } catch { noteExpected(MODULE, 'preview view unmounted'); }
  }, []);

  return {
    ...cameraState,

    /** Attach to `<CameraView ref={...} />` before calling any capture function. */
    cameraRef,
    /** Pass to `<CameraView onCameraReady={...} />` so lens and size lists can be read. */
    handleCameraReady,
    /** Props the view needs to reflect this hook's state. */
    viewProps: {
      facing: cameraState.facing,
      zoom: cameraState.zoomFactor,
      flash: cameraState.flashMode,
      enableTorch: isTorchOn,
      mode,
    },

    /** 'picture' or 'video'; recording requires 'video'. */
    mode,
    /** Whether the preview is running and capture is possible. */
    isReady,
    /** Continuous light rather than a capture-time flash. */
    isTorchOn,
    /** Lens identifiers the device reports, once the preview is running. */
    availableLenses,
    /** Picture sizes the device supports, once the preview is running. */
    availablePictureSizes,

    /** True while a still is being taken. */
    isCapturing,
    /** Most recent still, with its file URI and dimensions. */
    lastPhoto,
    /** True while video is recording. */
    isRecording,
    /** Elapsed seconds of the current recording. */
    recordingSeconds,
    /** File URI of the most recent video. */
    lastVideoUri,

    error,
    source,

    toggleFacing,
    setZoom,
    setZoomStep,
    setFlash,
    toggleTorch,
    setMode,
    setLook,
    takePicture,
    startRecording,
    stopRecording,
    pausePreview,
    resumePreview,
  };
}
