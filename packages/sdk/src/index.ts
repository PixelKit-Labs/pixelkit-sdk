/**
 * @file index.ts
 * @description Master entry barrel for PixelKit SDK.
 * Exports strongly-typed hardware hooks, Tensor AI services, and Material 3 UI primitives.
 *
 * @example
 * ```typescript
 * import {
 *   useCPU,
 *   useGPU,
 *   useTPU,
 *   useMemory,
 *   useSensors,
 *   useHaptics,
 *   useSpeechAI,
 *   useGemini,
 *   useDevice,
 *   useDisplay,
 *   useBiometrics,
 *   useLocation,
 *   useTorch,
 *   useUWB,
 *   useBLE,
 *   useNFC,
 *   useAudio,
 *   useVideo,
 *   useSpeech,
 *   useSecurity,
 *   useADPF,
 * } from './src';
 * ```
 */

// Core Types & Design System
export * from './core/types';
export * from './core/surface-types';
export * from './core/capabilities';

// Device Capability Resolution (read this before any Pro-exclusive hook)
export { useCapabilities } from './hardware/useCapabilities';

// Compute & Silicon Hardware Hooks
export { useCPU } from './hardware/useCPU';
export { useGPU } from './hardware/useGPU';
export { useMemory } from './hardware/useMemory';
export { useADPF } from './hardware/useADPF';
export { usePerfetto, type PerfettoInfo, type PerfettoState } from './hardware/usePerfetto';
export { useDevice } from './hardware/useDevice';
export { useDisplay } from './hardware/useDisplay';
export { useSecurity } from './hardware/useSecurity';
export { usePlayIntegrity, type PlayIntegrityInfo, type HardwareAttestationResult, type PlayIntegrityState } from './hardware/usePlayIntegrity';
export { useBatteryShare, type BatteryShareTelemetry } from './hardware/useBatteryShare';
export { useChargingIntelligence, type ChargingIntelligenceTelemetry, type ChargingTier } from './hardware/useChargingIntelligence';
export { useADPFHintSession, type ADPFHintSessionTelemetry, DEFAULT_TARGET_FRAME_DURATION_MS } from './hardware/useADPFHintSession';
export { usePrivateSpace, type PrivateSpaceTelemetry, type PrivateSpaceAutoLockPolicy } from './hardware/usePrivateSpace';
export { useKeyAgreement, type KeyAgreementTelemetry, type KeyAgreementKeyPairResult, type SharedSecretResult } from './hardware/useKeyAgreement';

// Sensor & Radio Hardware Hooks
export { useSensors } from './hardware/useSensors';
export { useAltimeter, type AltimeterTelemetry, type PressureTrend, STANDARD_SEA_LEVEL_HPA } from './hardware/useAltimeter';
export { useMicrophoneArray, type MicrophoneArrayTelemetry, type MicrophoneBeamDirection } from './hardware/useMicrophoneArray';
export { useThermometer, type ThermometerTelemetry, type ThermometerMode, DEFAULT_EMISSIVITY } from './hardware/useThermometer';
export { useHealthConnect, type HealthConnectInfo, type HealthConnectState } from './hardware/useHealthConnect';
export { useHaptics, HapticEnvelopes } from './hardware/useHaptics';
export { useCamera } from './hardware/useCamera';
export { useCameraExtensions } from './hardware/useCameraExtensions';
export { useBiometrics } from './hardware/useBiometrics';
export { useLocation } from './hardware/useLocation';
export { useNetwork } from './hardware/useNetwork';
export { useAudio } from './hardware/useAudio';
export { useSpatialAudio, type HeadTrackingMode, type SpatialAudioInfo, type SpatialAudioState } from './hardware/useSpatialAudio';
export { useVideo } from './hardware/useVideo';
export { useMediaLibrary, type SavedMedia } from './hardware/useMediaLibrary';
export { useCellular, type CellularGenerationLabel } from './hardware/useCellular';
export { useTorch } from './hardware/useTorch';
export { useBLE } from './hardware/useBLE';
export { useChannelSounding, type ChannelSoundingInfo, type ChannelSoundingTarget, type ChannelSoundingState } from './hardware/useChannelSounding';
export { useNFC } from './hardware/useNFC';
export { useRadios, type RadioTelemetry } from './hardware/useRadios';
export { useWifi7MLO, type Wifi7MloTelemetry, type MloLinkInfo } from './hardware/useWifi7MLO';
export { useWifiRTT, type WifiRTTTelemetry, type WifiRttResult } from './hardware/useWifiRTT';
export { useSatelliteNTN, type SatelliteNTNTechTelemetry, type SatelliteConnectionState, type SatelliteGuidance } from './hardware/useSatelliteNTN';

// Pixel Pro Exclusive Hardware Hooks
export { useHiLight, type HiLightMode, type HiLightState } from './hardware/useHiLight';
export { useUWB } from './hardware/useUWB';

// AI, Voice & Tensor TPU Hooks
export { useTPU } from './ai/useTPU';
export { useGemini, type SafetyThreshold, type GroundingSummary } from './ai/useGemini';
export {
  useAppFunctions,
  type AppFunctionParameter,
  type AppFunctionSchema,
  type AppFunctionExecutionResult,
  type AppFunctionsState,
} from './hardware/useAppFunctions';

// useGeminiNano, useGenAITasks, useVisionAI and useNaturalLanguageAI are exported from
// '@pixelkit-labs/sdk/mlkit'. They need @pixelkit-labs/mlkit, whose 19 ML Kit artifacts are a build cost that
// installing the package imposes whether or not anything imports it. See src/mlkit.ts.
export { useSpeechAI } from './ai/useSpeechAI';
export { useSpeech } from './ai/useSpeech';
export { getStoredApiKey, saveApiKey, createGeminiClient } from './ai/geminiClient';

// In-App Developer HUD & Diagnostics
export { PixelKitDevTools, type PixelKitDevToolsProps } from './ui/PixelKitDevTools';

// Hardware Tool Registry & Agent Function Calling (Google Gen AI SDK & ADK)
export {
  defineTool,
  getTool,
  listTools,
  clearTools,
  toFunctionDeclarations,
  toGeminiParametersSchema,
  runTool,
  validateParameters,
  registerHardwareTools,
  type ToolDef,
  type ToolType,
  type ToolPropertySchema,
  type ToolParametersSchema,
  type ToolExecutionResult,
  type HardwareContext,
} from './ai/tools/registry';

// Autonomous Agent Loop (Google Gen AI SDK)
export {
  runCloudAgent,
  DEFAULT_AGENT_MODEL,
  DEFAULT_MAX_STEPS,
  type CloudAgentOptions,
  type CloudAgentResult,
  type AgentStepInfo,
} from './ai/agent/cloudAgent';

export * from './core/observability';


