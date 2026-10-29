/**
 * @file useVisionAI.ts
 * @description Comprehensive vision intelligence suite combining Cloud Gemini Multimodal Analysis
 * with Google ML Kit On-Device Vision processing:
 * - Cloud Gemini: Scene description & structured label extraction via `@google/genai`.
 * - On-Device ML Kit:
 *   • Barcode Scanning (1D & 2D formats, QR codes)
 *   • Text Recognition v2 (OCR for Latin, numerals, documents)
 *   • Face Detection (landmarks, head Euler angles, smiling & eye open probabilities; no tracking ids)
 *   • Face Mesh Detection (468 3D contour points on close-range faces)
 *   • Image Labeling (on-device object & concept classification)
 *   • Object Detection (bounding boxes, multi-class labels; single-image mode, so no tracking ids)
 *   • Pose Detection (33 skeletal landmarks)
 *   • Selfie & Subject Segmentation (foreground / background mask extraction)
 *   • Digital Ink Recognition (handwriting stroke recognition)
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Type } from '@google/genai';
import { VisionAnalysisResult } from '../core/types';
import { getStoredApiKey, createGeminiClient, GEMINI_MODEL, NO_API_KEY_MESSAGE } from './geminiClient';
import { logEvent, recordMetric, type TelemetrySource } from '../core/observability';
import PixelNano, {
  type BarcodeScanResult,
  type TextRecognitionResult,
  type FaceDetectionResult,
  type FaceMeshResult,
  type ImageLabelResult,
  type ObjectDetectionResult,
  type PoseDetectionResult,
  type SelfieSegmentationResult,
  type SubjectSegmentationResult,
  type DigitalInkResult,
} from '@pixelkit-labs/mlkit';

const MODULE = 'useVisionAI';

export function useVisionAI() {
  // Cloud Gemini Vision State
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On-Device ML Kit Vision State
  const [isOnDeviceProcessing, setIsOnDeviceProcessing] = useState<boolean>(false);
  const [barcodeResult, setBarcodeResult] = useState<BarcodeScanResult | null>(null);
  const [ocrResult, setOcrResult] = useState<TextRecognitionResult | null>(null);
  const [facesResult, setFacesResult] = useState<FaceDetectionResult | null>(null);
  const [faceMeshResult, setFaceMeshResult] = useState<FaceMeshResult | null>(null);
  const [labelsResult, setLabelsResult] = useState<ImageLabelResult | null>(null);
  const [objectsResult, setObjectsResult] = useState<ObjectDetectionResult | null>(null);
  const [poseResult, setPoseResult] = useState<PoseDetectionResult | null>(null);
  const [selfieResult, setSelfieResult] = useState<SelfieSegmentationResult | null>(null);
  const [subjectResult, setSubjectResult] = useState<SubjectSegmentationResult | null>(null);
  const [digitalInkResult, setDigitalInkResult] = useState<DigitalInkResult | null>(null);

  // 'hardware' only after an on-device operation has returned a result; the native module being linked does not prove ML Kit answered.
  const source: TelemetrySource =
    PixelNano &&
    (barcodeResult != null || ocrResult != null || facesResult != null || faceMeshResult != null ||
      labelsResult != null || objectsResult != null || poseResult != null || selfieResult != null ||
      subjectResult != null || digitalInkResult != null)
      ? 'hardware'
      : 'unavailable';

  /**
   * Helper to pick an image from the camera or photo gallery.
   */
  const pickImage = useCallback(async (useCamera: boolean = true): Promise<{ uri: string; base64?: string } | null> => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          setError('Camera permission denied');
          return null;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
      }
      if (result.canceled || !result.assets?.length) return null;

      const asset = result.assets[0];
      setSelectedImageUri(asset.uri);
      if (asset.base64) setSelectedImageBase64(asset.base64);
      logEvent(MODULE, 'image picked', { width: asset.width, height: asset.height, mime: asset.mimeType });
      return { uri: asset.uri, base64: asset.base64 ?? undefined };
    } catch (e: any) {
      setError(e?.message ?? 'Failed to pick image');
      return null;
    }
  }, []);

  /**
   * Captures or picks an image and analyzes it via Cloud Gemini Multimodal API.
   */
  const captureAndAnalyze = useCallback(
    async (useCamera: boolean = true): Promise<VisionAnalysisResult | null> => {
      setError(null);
      try {
        const picked = await pickImage(useCamera);
        if (!picked) return null;

        const apiKey = await getStoredApiKey();
        if (!apiKey || !picked.base64) {
          setError(NO_API_KEY_MESSAGE);
          setAnalysis(null);
          return null;
        }

        setIsAnalyzing(true);
        const start = performance.now();
        const client = createGeminiClient(apiKey);
        const response = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: picked.base64 } },
                {
                  text: 'Describe this image in two concise sentences and list the 3 to 5 most important objects or subjects as short labels.',
                },
              ],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                labels: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 1, maxItems: 5 },
              },
              required: ['description', 'labels'],
            },
          },
        });
        const parsed = JSON.parse(response.text ?? '{}') as { description?: string; labels?: string[] };
        const elapsedMs = Math.round(performance.now() - start);
        const res: VisionAnalysisResult = {
          description: parsed.description ?? '(no description)',
          labels: parsed.labels ?? [],
          latencyMs: elapsedMs,
          timestamp: Date.now(),
        };
        setAnalysis(res);
        recordMetric(MODULE, 'geminiVisionLatencyMs', elapsedMs, 'derived');
        logEvent(MODULE, 'gemini analysis', { model: GEMINI_MODEL, latencyMs: elapsedMs, labels: res.labels.length });
        return res;
      } catch (e: any) {
        const message = e?.message ?? 'Analysis failed';
        setError(message);
        logEvent(MODULE, 'error', { message }, 'error');
        return null;
      } finally {
        setIsAnalyzing(false);
      }
    },
    [pickImage]
  );

  /**
   * Scans 1D and 2D barcodes (QR, UPC, Code 128) on-device.
   */
  const scanBarcodes = useCallback(async (imageInput: string): Promise<BarcodeScanResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.scanBarcodes(imageInput);
      setBarcodeResult(res);
      recordMetric(MODULE, 'barcodeLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'scanBarcodes', { count: res.barcodes.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Barcode scan failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Recognizes text (OCR) from an image on-device.
   */
  const recognizeText = useCallback(async (imageInput: string): Promise<TextRecognitionResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.recognizeText(imageInput);
      setOcrResult(res);
      recordMetric(MODULE, 'ocrLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'recognizeText', { blocks: res.blocks.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Text recognition failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Detects faces with landmark tracking and classification on-device.
   */
  const detectFaces = useCallback(async (imageInput: string): Promise<FaceDetectionResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.detectFaces(imageInput);
      setFacesResult(res);
      recordMetric(MODULE, 'faceDetectionLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'detectFaces', { count: res.faces.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Face detection failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Detects 468 3D mesh points for close-range faces on-device.
   */
  const detectFaceMesh = useCallback(async (imageInput: string): Promise<FaceMeshResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.detectFaceMesh(imageInput);
      setFaceMeshResult(res);
      recordMetric(MODULE, 'faceMeshLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'detectFaceMesh', { meshes: res.meshes.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Face mesh detection failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Labels objects and concepts in an image on-device.
   */
  const labelImage = useCallback(async (imageInput: string): Promise<ImageLabelResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.labelImage(imageInput);
      setLabelsResult(res);
      recordMetric(MODULE, 'imageLabelLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'labelImage', { count: res.labels.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Image labeling failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Detects and tracks objects with bounding boxes on-device.
   */
  const detectObjects = useCallback(async (imageInput: string): Promise<ObjectDetectionResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.detectObjects(imageInput);
      setObjectsResult(res);
      recordMetric(MODULE, 'objectDetectionLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'detectObjects', { count: res.objects.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Object detection failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Detects 33 human pose skeletal landmarks on-device.
   */
  const detectPose = useCallback(async (imageInput: string): Promise<PoseDetectionResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.detectPose(imageInput);
      setPoseResult(res);
      recordMetric(MODULE, 'poseDetectionLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'detectPose', { landmarks: res.landmarks.length, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Pose detection failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Segments user selfies into foreground portrait masks on-device.
   */
  const segmentSelfie = useCallback(async (imageInput: string): Promise<SelfieSegmentationResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.segmentSelfie(imageInput);
      setSelfieResult(res);
      recordMetric(MODULE, 'selfieSegmentationLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'segmentSelfie', { width: res.width, height: res.height, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Selfie segmentation failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Segments subjects from the background on-device.
   */
  const segmentSubject = useCallback(async (imageInput: string): Promise<SubjectSegmentationResult | null> => {
    if (!PixelNano) return null;
    setIsOnDeviceProcessing(true);
    setError(null);
    try {
      const res = await PixelNano.segmentSubject(imageInput);
      setSubjectResult(res);
      recordMetric(MODULE, 'subjectSegmentationLatencyMs', res.latencyMs, 'hardware');
      logEvent(MODULE, 'segmentSubject', { subjects: res.subjectsCount, latencyMs: res.latencyMs });
      return res;
    } catch (e: any) {
      setError(e?.message ?? 'Subject segmentation failed');
      return null;
    } finally {
      setIsOnDeviceProcessing(false);
    }
  }, []);

  /**
   * Recognizes handwritten digital ink strokes on-device.
   */
  const recognizeDigitalInk = useCallback(
    async (
      strokes: Array<Array<{ x: number; y: number; t?: number }>>,
      languageTag: string = 'en-US'
    ): Promise<DigitalInkResult | null> => {
      if (!PixelNano) return null;
      setIsOnDeviceProcessing(true);
      setError(null);
      try {
        const res = await PixelNano.recognizeDigitalInk(strokes, languageTag);
        setDigitalInkResult(res);
        recordMetric(MODULE, 'digitalInkLatencyMs', res.latencyMs, 'hardware');
        logEvent(MODULE, 'recognizeDigitalInk', { candidates: res.candidates.length, latencyMs: res.latencyMs });
        return res;
      } catch (e: any) {
        setError(e?.message ?? 'Digital ink recognition failed');
        return null;
      } finally {
        setIsOnDeviceProcessing(false);
      }
    },
    []
  );

  return {
    // Cloud
    selectedImageUri,
    selectedImageBase64,
    analysis,
    isAnalyzing,
    model: GEMINI_MODEL,
    captureAndAnalyze,
    pickImage,
    // On-Device
    isOnDeviceProcessing,
    barcodeResult,
    ocrResult,
    facesResult,
    faceMeshResult,
    labelsResult,
    objectsResult,
    poseResult,
    selfieResult,
    subjectResult,
    digitalInkResult,
    source,
    error,
    scanBarcodes,
    recognizeText,
    detectFaces,
    detectFaceMesh,
    labelImage,
    detectObjects,
    detectPose,
    segmentSelfie,
    segmentSubject,
    recognizeDigitalInk,
  };
}
