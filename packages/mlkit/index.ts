/**
 * @file packages/mlkit/index.ts
 * @description TypeScript bridge for the PixelNano Expo Module: Gemini Nano on-device inference through the
 * ML Kit GenAI Prompt API (AICore). Resolves to `null` on web, in Expo Go, or on builds without the module,
 * so `useGeminiNano` reports `source: 'unavailable'` instead of inventing a reply.
 */

import { NativeModule, requireOptionalNativeModule } from 'expo';

/** AICore feature status for the Prompt API on this device (ML Kit `FeatureStatus`). */
export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export type NanoModelInfo = {
  status: NanoStatus;
  /** Model name AICore reports (e.g. a Gemini Nano build id), null when the API does not answer */
  baseModelName: string | null;
  /** Input + output token budget for one request */
  tokenLimit: number | null;
  thinkingModeAvailable: boolean | null;
  systemPromptAvailable: boolean | null;
  structuredOutputAvailable: boolean | null;
  cachingAvailable: boolean | null;
  aicoreVersion: string | null;
  releaseStage: 'stable' | 'preview';
  preference: 'full' | 'fast';
};

export type NanoOptions = {
  /** Sent as a SystemInstruction part; needs `systemPromptAvailable` */
  systemInstruction?: string;
  /** 0..1 */
  temperature?: number;
  topK?: number;
  candidateCount?: number;
  /** Output cap; the model's `tokenLimit` covers input + output */
  maxOutputTokens?: number;
  seed?: number;
  /** Thinking mode; only honoured when `thinkingModeAvailable` */
  thinking?: boolean;
  /** One JPEG/PNG as base64 (no data: prefix). The Prompt API request builder takes one image. */
  imageBase64?: string;
  /** Clean user-facing text to display in conversation history when prompt is wrapped with directives */
  displayContent?: string;
};

export type NanoResult = {
  text: string;
  finishReason: 'STOP' | 'MAX_TOKENS' | 'OTHER' | 'UNKNOWN';
  thoughts: string[];
  /** Wall time of the AICore call measured in the module */
  latencyMs: number;
  /** Time to the first streamed token; null for non-streaming calls */
  firstTokenMs: number | null;
};

export type SummarizeOptions = {
  inputType?: 'article' | 'conversation';
  outputType?: 'one_bullet' | 'two_bullets' | 'three_bullets';
};

export type SummarizeResult = {
  summary: string;
  latencyMs: number;
  engine: string;
  source: 'hardware';
};

export type ProofreadResult = {
  correctedText: string;
  suggestions: string[];
  latencyMs: number;
  engine: string;
  source: 'hardware';
};

export type RewriteResult = {
  rewrittenText: string;
  suggestions: string[];
  latencyMs: number;
  engine: string;
  source: 'hardware';
};

export type DownloadProgressEvent = { phase: 'started' | 'progress' | 'completed'; bytes?: number };
export type TokenEvent = { requestId: string; text: string };

type Events = {
  onDownloadProgress(e: DownloadProgressEvent): void;
  onToken(e: TokenEvent): void;
  onThought(e: TokenEvent): void;
};

declare class PixelNanoModule extends NativeModule<Events> {
  checkStatus(): Promise<NanoStatus>;
  getModelInfo(): Promise<NanoModelInfo>;
  setModelConfig(stage: 'stable' | 'preview', preference: 'full' | 'fast'): void;
  download(): Promise<NanoStatus>;
  /** Resolves with the warm-up wall time in ms */
  warmup(): Promise<number>;
  countTokens(prompt: string, options?: NanoOptions): Promise<number>;
  generate(prompt: string, options?: NanoOptions): Promise<NanoResult>;
  stream(requestId: string, prompt: string, options?: NanoOptions): Promise<NanoResult>;
  summarize(text: string, options?: SummarizeOptions): Promise<SummarizeResult>;
  proofread(text: string, options?: Record<string, any>): Promise<ProofreadResult>;
  rewrite(text: string, tone?: 'elaborate' | 'emojify' | 'shorten' | 'friendly' | 'professional' | 'rephrase'): Promise<RewriteResult>;
  describeImage(imageInput: string, style?: 'detailed' | 'caption' | 'labels' | 'concise'): Promise<ImageDescriptionResult>;
  scanBarcodes(imageInput: string): Promise<BarcodeScanResult>;
  recognizeText(imageInput: string): Promise<TextRecognitionResult>;
  detectFaces(imageInput: string): Promise<FaceDetectionResult>;
  detectFaceMesh(imageInput: string): Promise<FaceMeshResult>;
  labelImage(imageInput: string): Promise<ImageLabelResult>;
  detectObjects(imageInput: string): Promise<ObjectDetectionResult>;
  detectPose(imageInput: string): Promise<PoseDetectionResult>;
  segmentSelfie(imageInput: string): Promise<SelfieSegmentationResult>;
  segmentSubject(imageInput: string): Promise<SubjectSegmentationResult>;
  recognizeDigitalInk(strokesData: Array<Array<{ x: number; y: number; t?: number }>>, languageTag?: string): Promise<DigitalInkResult>;
  identifyLanguage(text: string): Promise<LanguageIdResult>;
  translate(text: string, sourceLang: string, targetLang: string): Promise<TranslationResult>;
  suggestReplies(history: Array<{ text: string; timestamp?: number; isLocalUser?: boolean; sender?: string }>): Promise<SmartReplyResult>;
  extractEntities(text: string): Promise<EntityExtractionResult>;
  isEmbeddingModelAvailable(): boolean;
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  close(): void;
}

export type EmbeddingResult = {
  embedding: number[];
  dimension: number;
  latencyMs: number;
  source: 'hardware';
};

export type ImageDescriptionResult = {
  description: string;
  finishReason: string;
  latencyMs: number;
  engine: string;
  source: 'hardware';
};

export type BarcodeItem = {
  rawValue: string | null;
  displayValue: string | null;
  format: number;
  valueType: number;
  boundingBox: { left: number; top: number; right: number; bottom: number } | null;
};

export type BarcodeScanResult = {
  barcodes: BarcodeItem[];
  latencyMs: number;
  source: 'hardware';
};

export type TextBlock = {
  text: string;
  lines: string[];
  boundingBox: { left: number; top: number; right: number; bottom: number } | null;
};

export type TextRecognitionResult = {
  text: string;
  blocks: TextBlock[];
  latencyMs: number;
  source: 'hardware';
};

export type FaceItem = {
  trackingId: number | null;
  smilingProbability: number | null;
  leftEyeOpenProbability: number | null;
  rightEyeOpenProbability: number | null;
  headEulerAngleX: number;
  headEulerAngleY: number;
  headEulerAngleZ: number;
  boundingBox: { left: number; top: number; right: number; bottom: number };
};

export type FaceDetectionResult = {
  faces: FaceItem[];
  latencyMs: number;
  source: 'hardware';
};

export type FaceMeshResult = {
  meshes: Array<{
    pointsCount: number;
    boundingBox: { left: number; top: number; right: number; bottom: number };
  }>;
  latencyMs: number;
  source: 'hardware';
};

export type ImageLabelItem = {
  text: string;
  confidence: number;
  index: number;
};

export type ImageLabelResult = {
  labels: ImageLabelItem[];
  latencyMs: number;
  source: 'hardware';
};

export type DetectedObject = {
  trackingId: number | null;
  boundingBox: { left: number; top: number; right: number; bottom: number };
  labels: Array<{ text: string; confidence: number }>;
};

export type ObjectDetectionResult = {
  objects: DetectedObject[];
  latencyMs: number;
  source: 'hardware';
};

export type PoseLandmark = {
  type: number;
  x: number;
  y: number;
  inFrameLikelihood: number;
};

export type PoseDetectionResult = {
  landmarks: PoseLandmark[];
  latencyMs: number;
  source: 'hardware';
};

export type SelfieSegmentationResult = {
  width: number;
  height: number;
  latencyMs: number;
  source: 'hardware';
};

export type SubjectSegmentationResult = {
  subjectsCount: number;
  foregroundConfidence: boolean;
  latencyMs: number;
  source: 'hardware';
};

export type InkCandidate = {
  text: string;
  score: number | null;
};

export type DigitalInkResult = {
  candidates: InkCandidate[];
  latencyMs: number;
  source: 'hardware';
};

export type LanguageIdResult = {
  languageCode: string | null;
  possibleLanguages: Array<{ languageCode: string; confidence: number }>;
  latencyMs: number;
  source: 'hardware';
};

export type TranslationResult = {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  latencyMs: number;
  source: 'hardware';
};

export type SmartReplyResult = {
  suggestions: string[];
  status: number;
  latencyMs: number;
  source: 'hardware';
};

export type ExtractedEntity = {
  type: number;
  text: string;
  start: number;
  end: number;
};

export type EntityExtractionResult = {
  entities: ExtractedEntity[];
  latencyMs: number;
  source: 'hardware';
};

const PixelNano = requireOptionalNativeModule<PixelNanoModule>('PixelNano');

export const isPixelNanoAvailable = PixelNano != null;

export default PixelNano;
