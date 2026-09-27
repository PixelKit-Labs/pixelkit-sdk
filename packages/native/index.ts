/**
 * @file packages/native/index.ts
 * @description TypeScript bridge for the PixelNative Expo Module: real Android telemetry and actuators
 * (SoC identity, CPU, memory, thermal/ADPF headroom, display modes, GPU, torch, haptic envelopes).
 * Resolves to `null` on web or when the native module is not compiled in (Expo Go), so hooks can
 * report "unavailable" instead of fabricating values.
 */

import { NativeModule, requireOptionalNativeModule } from 'expo';

export type SocInfo = {
  socModel: string | null; socManufacturer: string | null; hardware: string; device: string; model: string;
  buildId: string; release: string; sdkInt: number; sdkIntFull: number | null; securityPatch: string; supportedAbis: string[];
};

export type CoreFrequency = { index: number; part: string | null; name: string | null; curMHz: number | null; maxMHz: number | null; minMHz: number | null };
export type CpuInfo = {
  coreCount: number; implementer: string | null;
  clusters: { part: string | null; name: string | null; maxMHz: number | null; count: number }[];
  governor: string | null; cores: CoreFrequency[];
};
export type CpuLoad = { appCpuPercent: number | null; frequencyUtilizationPercent: number | null; cores: CoreFrequency[] };

export type MemoryInfo = {
  totalBytes: number; availableBytes: number; lowMemoryThresholdBytes: number; isLowMemory: boolean;
  appJavaHeapUsedBytes: number; appJavaHeapMaxBytes: number; appNativeHeapBytes: number;
  memoryClassMB: number; largeMemoryClassMB: number;
};

export type ThermalInfo = {
  thermalHeadroom: number | null; thermalStatus: number; thresholds: Record<string, number> | null;
  cpuHeadroom: number | null; gpuHeadroom: number | null;
};

export type DisplayMode = { id: number; width: number; height: number; refreshRate: number };
export type DisplayInfo = {
  refreshRate: number; modeId: number; physicalWidth: number; physicalHeight: number; densityDpi: number;
  modes: DisplayMode[]; hdrTypes: number[] | null; maxLuminance: number | null; maxAverageLuminance: number | null;
  isHdr: boolean; isWideColorGamut: boolean; hasArrSupport: boolean | null; supportedRefreshRates: number[] | null;
  hdrSdrRatio?: number | null;
  suggestedFrameRateHigh: number | null; suggestedFrameRateNormal: number | null;
};

export type GpuInfo = { renderer: string | null; vendor: string | null; glVersion: string | null; vulkanVersion: string | null; error?: string };
export type FrameStats = { fps: number; avgFrameMs: number; maxFrameMs: number; jankFrames: number; frames: number; expectedFrameMs: number };

export type TorchInfo = { available: boolean; cameraId?: string; maxStrengthLevel?: number | null; defaultStrengthLevel?: number | null; currentStrengthLevel?: number | null };
export type TorchState = { cameraId: string; enabled: boolean; unavailable?: boolean };

export type CameraExtensionSupport = {
  night: boolean;
  hdr: boolean;
  bokeh: boolean;
  faceRetouch: boolean;
  auto: boolean;
};

export type CameraExtensionInfo = {
  cameraId: string;
  facing: 'back' | 'front' | 'external';
  extensions: CameraExtensionSupport;
  supportedExtensionIds: number[];
};

export type CameraExtensionsResult = {
  available: boolean;
  cameras: CameraExtensionInfo[];
  hasNightSight: boolean;
  hasUltraHdr: boolean;
  hasPortraitBokeh: boolean;
  error?: string;
};

export type AppFunctionsInfo = {
  isSupported: boolean;
  serviceFound: boolean;
  apiLevel: number;
  serviceName: string | null;
  interfaceDescriptor: string | null;
  error?: string | null;
};

export type HeadTrackingMode = 'unsupported' | 'disabled' | 'relative_world' | 'relative_device';

export type SpatialAudioInfo = {
  isSupported: boolean;
  isAvailable: boolean;
  isEnabled: boolean;
  hasHeadTracker: boolean;
  headTrackingMode: HeadTrackingMode;
  immersiveAudioLevel: number;
  hasDynamicHeadTrackerFeature: boolean;
  error?: string | null;
};

export type ChannelSoundingInfo = {
  isSupported: boolean;
  isEnabled: boolean;
  serviceFound: boolean;
  hasChannelSoundingFeature: boolean;
  supportsPbr: boolean;
  supportsRtt: boolean;
  channelCount: number;
  precision: 'centimeter' | 'decimeter' | 'unsupported';
  error?: string | null;
};

export type PlayIntegrityInfo = {
  isSupported: boolean;
  hasStrongBox: boolean;
  strongBoxVersion: number | null;
  hardwareKeystoreVersion: number | null;
  hasAppAttestKey: boolean;
  securityModelCompatible: boolean;
  playServicesAvailable: boolean;
  playServicesVersion: string | null;
  deviceIntegrity: 'MEETS_STRONG_INTEGRITY' | 'MEETS_DEVICE_INTEGRITY' | 'MEETS_BASIC_INTEGRITY' | 'UNVERIFIED';
  error?: string | null;
};

export type HardwareAttestationResult = {
  keyAlias: string;
  algorithm: string;
  securityLevel: 'STRONGBOX' | 'TRUSTED_ENVIRONMENT' | 'SOFTWARE' | 'UNKNOWN';
  isStrongBoxBacked: boolean;
  certificateChainLength: number;
  leafCertificateSubject: string | null;
  leafCertificateIssuer: string | null;
  challenge: string;
  timestamp: number;
};

export type PerfettoInfo = {
  isSupported: boolean;
  perfettoVersion: string | null;
  availableCategories: string[];
  isTracing: boolean;
  error?: string | null;
};

export type HealthConnectInfo = {
  isAvailable: boolean;
  sdkStatus: 'SDK_AVAILABLE' | 'SDK_UNAVAILABLE' | 'SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED';
  hasStepCounter: boolean;
  hasHeartRateSensor: boolean;
  stepSensorName: string | null;
  heartRateSensorName: string | null;
  isFrameworkIntegrated: boolean;
  error?: string | null;
};

export type HapticsInfo = {
  hasVibrator: boolean; hasAmplitudeControl: boolean; envelopeEffectsSupported: boolean;
  resonantFrequencyHz: number | null; qFactor: number | null; supportedPrimitives: string[];
};
export type EnvelopePoint = { intensity: number; sharpness: number; durationMs: number };
export type PrimitiveStep = { primitive: 'CLICK' | 'TICK' | 'THUD' | 'SPIN' | 'QUICK_RISE' | 'SLOW_RISE' | 'QUICK_FALL' | 'LOW_TICK'; scale?: number; delayMs?: number };

export type PackageVersion = { installed: boolean; versionName: string | null; versionCode: number | null };

export type BatteryHealth = 'GOOD' | 'OVERHEAT' | 'DEAD' | 'OVER_VOLTAGE' | 'UNSPECIFIED_FAILURE' | 'COLD' | 'UNKNOWN';
export type PluggedSource = 'AC' | 'USB' | 'WIRELESS' | 'DOCK' | 'NONE';
export type BatteryStatus = 'CHARGING' | 'DISCHARGING' | 'FULL' | 'NOT_CHARGING' | 'UNKNOWN';

export type ThermalZone = {
  name: string;
  type: string;
  tempC: number | null;
};

export type BatteryTelemetry = {
  temperatureC: number | null;
  voltageMv: number | null;
  currentNowMa: number | null;
  currentAvgMa: number | null;
  powerWatts: number | null;
  health: BatteryHealth;
  plugged: PluggedSource;
  status: BatteryStatus;
  technology: string | null;
  cycleCount: number | null;
  chargeCounterMah: number | null;
  energyCounterMwh: number | null;
  thermalZones: ThermalZone[];
};

export type BondedDevice = {
  name: string;
  address: string;
  type: number;
  bondState: 'BONDED' | 'BONDING' | 'NONE';
};

export type RadioInfo = {
  nfc: {
    supported: boolean;
    enabled: boolean;
    observeModeSupported: boolean;
    antennaState: 'ENABLED' | 'DISABLED' | 'UNAVAILABLE';
  };
  bluetooth: {
    supported: boolean;
    bleSupported: boolean;
    enabled: boolean;
    state: 'ON' | 'OFF' | 'TURNING_ON' | 'TURNING_OFF';
    channelSounding: boolean;
    bondedDevices: BondedDevice[];
  };
  uwb: {
    supported: boolean;
    enabled: boolean;
    chipId: string | null;
    rangingApiSupported: boolean;
  };
  wifiRtt: {
    supported: boolean;
    available: boolean;
  };
  thread: {
    supported: boolean;
    serviceFound: boolean;
    chipId: string | null;
  };
  satellite: {
    supported: boolean;
    sosSupported?: boolean;
    provider?: string | null;
  };
};

export type AppFunctionInfo = {
  id: string;
  name: string;
  description: string;
  category: 'actuator' | 'telemetry' | 'system' | 'intelligence';
  target: 'hardware' | 'daemon' | 'service' | 'tpu_aicore';
  enabled: boolean;
};

export type DiscoveredBleDevice = {
  name: string;
  address: string;
  rssi: number;
  txPower?: number | null;
  timestampNanos: number;
  serviceUuids: string[];
};

export type UwbRangingResult = {
  success: boolean;
  sessionId: number;
  technology: string;
  serviceAvailable: boolean;
  serviceName: string;
  rangingFeature: boolean;
  status: string;
  timestampMs: number;
};

/** One decoded NDEF record from a tag. */
export type NdefRecordInfo = {
  /** Type Name Format: 1 well-known, 2 MIME, 3 absolute URI, 4 external. */
  tnf: number;
  /** Record type, for example 'T' for text or 'U' for URI. */
  type: string;
  /** Decoded text. Text records have their language prefix stripped. */
  payload: string;
  /** Raw payload length in bytes. */
  bytes: number;
  /** Resolved URI when the record carries one. */
  uri: string | null;
};

/** A tag that entered the reader field. Every field is read from the tag. */
export type NfcTagEvent = {
  /** Hardware identifier as colon-separated hex. */
  id: string;
  /** Technologies the tag supports, for example ['Ndef', 'NfcA']. */
  techs: string[];
  /** NDEF specification the tag conforms to, when it is NDEF. */
  type: string | null;
  /** Capacity in bytes for NDEF tags. */
  maxSize: number | null;
  /** Whether the tag can be written. */
  writable: boolean | null;
  records: NdefRecordInfo[];
  /** True when a queued write was applied to this tag. */
  written: boolean;
  /** Why a queued write failed, if it did. */
  writeError: string | null;
  timestamp: number;
};

// ───────────────────────── 51-Hook Expansion Telemetry Types ─────────────────────────

export type MicrophoneLocation = 'main_body' | 'main_body_movable' | 'peripheral' | 'unknown';
export type MicrophoneDirectionality = 'omnidirectional' | 'bidirectional' | 'cardioid' | 'hypercardioid' | 'supercardioid' | 'unknown';

export type MicrophoneInfo = {
  id: number;
  description: string;
  type: number;
  directionality: MicrophoneDirectionality;
  location: MicrophoneLocation;
  group: number;
  indexInTheGroup: number;
  position: { x: number; y: number; z: number } | null;
  orientation: { x: number; y: number; z: number } | null;
};

export type MicrophoneArrayResult = {
  isSupported: boolean;
  microphones: MicrophoneInfo[];
  direction: 'user' | 'away' | 'external' | 'omni';
  fieldZoom: number;
  error?: string | null;
};

export type ThermometerReading = {
  isSupported: boolean;
  surfaceTemperatureC: number | null;
  surfaceTemperatureF: number | null;
  ambientTemperatureC: number | null;
  sensorName: string | null;
  error?: string | null;
};

export type BatteryShareStatus = {
  isSupported: boolean;
  isActive: boolean;
  isReceiverDetected: boolean;
  transmittedWatts: number | null;
  batteryThreshold: number;
  error?: string | null;
};

export type ChargingTier = 'slow' | 'standard' | 'rapid' | 'ultra_rapid';

export type ChargingIntelligence = {
  stateOfHealthPercent: number | null;
  cycleCount: number | null;
  manufactureDate: string | null;
  firstUsageDate: string | null;
  chargingWattage: number | null;
  chargingTier: ChargingTier;
  chargeLimitActive: boolean;
  error?: string | null;
};

export type MloLinkInfo = {
  band: '2.4GHz' | '5GHz' | '6GHz';
  channelWidthMHz: number;
  rssi: number;
  txLinkSpeedMbps: number;
  rxLinkSpeedMbps: number;
  state: 'associated' | 'active' | 'idle';
};

export type Wifi7MloResult = {
  isSupported: boolean;
  isMloActive: boolean;
  links: MloLinkInfo[];
  aggregateSpeedMbps: number | null;
  error?: string | null;
};

export type WifiRttResult = {
  bssid: string;
  distanceMm: number;
  distanceStdDevMm: number;
  rssi: number;
  status: number;
};

export type WifiRttStatusResult = {
  isSupported: boolean;
  isAvailable: boolean;
  isRanging: boolean;
  rangingResults: WifiRttResult[];
  error?: string | null;
};

export type SatelliteGuidance = {
  azimuthDeg: number;
  elevationDeg: number;
  isAligned: boolean;
};

export type SatelliteStatusResult = {
  isSupported: boolean;
  connectionState: 'disconnected' | 'searching' | 'connected' | 'pointing_assist';
  carrier: string | null;
  signalQualityBars: number | null;
  pointingGuidance: SatelliteGuidance | null;
  emergencyServicesReady: boolean;
  error?: string | null;
};

export type PrivateSpaceInfo = {
  isInsidePrivateSpace: boolean;
  isPrivateSpaceConfigured: boolean;
  autoLockPolicy: 'immediate' | 'screen_off' | 'device_reboot' | 'unknown';
  error?: string | null;
};

export type KeyAgreementKeyPairResult = {
  alias: string;
  publicKeyBase64: string | null;
  securityLevel: 'STRONGBOX' | 'TRUSTED_ENVIRONMENT';
  isStrongBoxSupported: boolean;
  error?: string | null;
};

export type SharedSecretResult = {
  sharedSecretBase64: string | null;
  secretLengthBytes: number;
  error?: string | null;
};

export type SpeechEngineInfo = {
  packageName: string;
  label: string;
  versionName: string | null;
  versionCode: number | null;
  /** The SDK observes this package; installation and model downloads remain owned by its app. */
  installationOwner: 'external_app';
};

export type SpeechVoiceIdentity = {
  name: string;
  locale: string;
  quality: number;
  latency: number;
  requiresNetwork: boolean;
  features: string[];
};

export type AndroidTtsIdentity = {
  audioSource: 'android_tts';
  requestedPackage: string;
  installedPackage: string | null;
  installedVersionName: string | null;
  installedVersionCode: number | null;
  resolvedEnginePackage: string | null;
  resolvedEngineName: string | null;
  initializationStatus: 'initializing' | 'ready' | 'unavailable' | 'failed' | 'unverified' | 'fallback_rejected' | 'configuration_failed';
  available: boolean;
  /** True only when Android exposed an exact active-package match. */
  identityVerified: boolean;
  bindingEvidence: 'active_engine_api' | 'unavailable';
  selectedVoice: SpeechVoiceIdentity | null;
  selectedLocale: string | null;
  /** External engines do not expose their inference execution provider through Android TTS. */
  executionProvider: null;
  executionProviderObserved: false;
  installationOwner: 'external_app';
  managesExternalInstallOrModels: false;
  unavailableReason?: string;
  error?: string;
  errorCode?: string;
};

/** System Expo Speech has no explicit Android package identity. */
export type PlatformTtsIdentity = {
  audioSource: 'platform_tts';
  requestedPackage: null;
  identityVerified: false;
  selectedVoice: string | null;
  selectedLocale: string | null;
};

/** Gemini Live audio is cloud session audio, never Android TTS or Kokoro. */
export type GeminiLiveAudioIdentity = {
  audioSource: 'gemini_live_audio';
  provider: 'google_gemini_live';
  model: string;
  voiceName: string | null;
};

export type SpeechOutputIdentity = AndroidTtsIdentity | PlatformTtsIdentity | GeminiLiveAudioIdentity;
export type SpeechSynthesisStatus = 'preparing' | 'started' | 'completed' | 'failed' | 'cancelled' | 'replaced';

export type SpeechEngineCallback = {
  type: 'start' | 'done' | 'error' | 'stop' | 'replaced';
  at: number;
  errorCode?: string;
  synthesisErrorCode?: number;
};

export type SpeechEngineSynthesisRequest = {
  packageName: string;
  text: string;
  rate: number;
  pitch: number;
  volume: number;
  language: string | null;
  voice: string | null;
  utteranceId: string;
  traceContext: Record<string, string | null>;
};

export type SpeechSynthesisResult = {
  status: Exclude<SpeechSynthesisStatus, 'preparing' | 'started'>;
  identity: AndroidTtsIdentity | null;
  utteranceId: string;
  requestedAt: number;
  identityResolvedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  cancelledAt: number | null;
  callbacks: SpeechEngineCallback[];
  errorCode: string | null;
  error: string | null;
  synthesisErrorCode: number | null;
  textLength: number;
  traceContext: Record<string, string | null>;
};

export type SpeechEngineStatus = Omit<Partial<SpeechSynthesisResult>, 'status' | 'identity'> & {
  status: 'idle' | 'initializing' | 'ready' | 'unavailable' | SpeechSynthesisStatus;
  identity?: AndroidTtsIdentity | null;
  isSpeaking: boolean;
};

export type SpeechEngineEvent = {
  callback: SpeechEngineCallback['type'];
  callbackAt: number;
  utteranceId: string;
  status: SpeechSynthesisStatus;
  identity: AndroidTtsIdentity | null;
  traceContext: Record<string, string | null>;
  errorCode?: string;
  error?: string;
  synthesisErrorCode?: number;
};

type Events = {
  onThermalStatus(e: { status: number }): void;
  onFrameStats(e: FrameStats): void;
  onTorchState(e: TorchState): void;
  onSpeechPartial(e: { requestId: string; text: string }): void;
  onSpeechResult(e: { requestId: string; text: string; isFinal: boolean }): void;
  onSpeechRms(e: { requestId: string; rmsdB: number }): void;
  onSpeechError(e: { requestId: string; error: string; code?: number }): void;
  onSpeechEngineEvent(e: SpeechEngineEvent): void;
  onBleDeviceFound(e: DiscoveredBleDevice): void;
  onNfcTag(e: NfcTagEvent): void;
  onNfcError(e: { id: string; message: string }): void;
};

declare class PixelNativeModule extends NativeModule<Events> {
  getSocInfo(): SocInfo;
  hasSystemFeature(name: string): boolean;
  getPackageVersion(pkg: string): PackageVersion;
  getCpuInfo(): CpuInfo;
  getCpuLoad(): CpuLoad;
  getMemoryInfo(): MemoryInfo;
  requestGc(): MemoryInfo;
  getThermal(): ThermalInfo;
  getDisplayInfo(): DisplayInfo;
  setPreferredRefreshRate(rate: number): Promise<boolean>;
  setHighBrightnessMode(enabled: boolean): Promise<boolean>;
  setPreferredDisplayMode(modeId: number): Promise<boolean>;
  setDesiredHdrHeadroom(headroom: number): Promise<boolean>;
  getGpuInfo(): GpuInfo;
  getTorchInfo(): TorchInfo;
  setTorch(on: boolean, strengthLevel?: number | null): Promise<boolean>;
  getCameraExtensions(): CameraExtensionsResult;
  getAppFunctionsInfo(): AppFunctionsInfo;
  getSpatialAudioInfo(): SpatialAudioInfo;
  getChannelSoundingInfo(): ChannelSoundingInfo;
  getPlayIntegrityInfo(): PlayIntegrityInfo;
  attestHardwareKey(challengeStr?: string | null): Promise<HardwareAttestationResult>;
  getPerfettoInfo(): PerfettoInfo;
  beginTraceSection(name: string): boolean;
  endTraceSection(): boolean;
  setTraceCounter(name: string, value: number): boolean;
  startPerfettoTrace(categories?: string[], bufferSizeKb?: number): Promise<boolean>;
  stopPerfettoTrace(): Promise<string | null>;
  getHealthConnectInfo(): HealthConnectInfo;
  getHapticsInfo(): HapticsInfo;
  playEnvelope(points: EnvelopePoint[], initialSharpness?: number | null): boolean;
  playPrimitives(steps: PrimitiveStep[]): boolean;
  cancelVibration(): boolean;
  getBatteryTelemetry(): BatteryTelemetry;
  getRadioInfo(): RadioInfo;
  startBleScan(timeoutMs?: number): Promise<{ success: boolean; scanning: boolean; error?: string }>;
  stopBleScan(): boolean;
  getDiscoveredBleDevices(): DiscoveredBleDevice[];
  /** Enables NfcAdapter reader mode on the foreground Activity; tags arrive on . */
  startNfcReader(flags?: number): Promise<{ success: boolean; flags?: number; started?: boolean; error?: string }>;
  /** Disables reader mode. Safe when no reader is running. */
  stopNfcReader(): Promise<{ success: boolean }>;
  /** Queues a text record written to the next tag that enters the field. */
  writeNdefText(text: string): Promise<{ success: boolean; queuedBytes?: number; error?: string }>;
  isNfcReaderActive(): boolean;
  startUwbRanging(sessionId?: number): Promise<UwbRangingResult>;
  stopUwbRanging(): boolean;
  isOfflineSpeechAvailable(): boolean;
  /** Resolves true on service readiness; rejects startup failure, timeout, cancellation or busy state. */
  startSpeechRecognition(requestId: string, onDevice: boolean): Promise<boolean>;
  stopSpeechRecognition(): boolean;
  cancelSpeechRecognition(): boolean;
  /** Android TTS services visible to this app; installation and models remain external. */
  listSpeechEngines(): SpeechEngineInfo[];
  /** Initializes one package and reports exact observed identity without synthesizing. */
  resolveSpeechEngine(packageName: string, language?: string | null, voice?: string | null): Promise<AndroidTtsIdentity>;
  /** Compatibility API retained for existing consumers. New code should use the detailed call. */
  speakWithSpeechEngine(packageName: string, text: string, rate: number, pitch: number, volume: number): Promise<void>;
  speakWithSpeechEngineDetails(request: SpeechEngineSynthesisRequest): Promise<SpeechSynthesisResult>;
  getSpeechEngineStatus(): SpeechEngineStatus;
  stopSpeechEngine(): boolean;
  isSpeechEngineSpeaking(): boolean;
  getAppFunctions(): AppFunctionInfo[];
  executeAppFunction(functionId: string, params?: Record<string, any>): Promise<any>;

  // Phase 1: Sensors & Acoustics
  getMicrophoneArray(): MicrophoneArrayResult;
  setPreferredMicrophoneDirection(direction: string, zoom: number): Promise<boolean>;
  getThermometerReading(): ThermometerReading;

  // Phase 2: Silicon & Battery
  getBatteryShareStatus(): BatteryShareStatus;
  setBatteryShareEnabled(enabled: boolean): Promise<boolean>;
  getChargingIntelligence(): ChargingIntelligence;
  createADPFHintSession(targetDurationNanos: number): Promise<boolean>;
  reportADPFWorkDuration(actualDurationNanos: number): boolean;
  updateADPFWorkDuration(targetDurationNanos: number): boolean;
  closeADPFHintSession(): boolean;

  // Phase 3: Radios & Mesh
  getWifi7MloInfo(): Wifi7MloResult;
  getWifiRttStatus(): WifiRttStatusResult;
  startWifiRttRanging(bssids: string[]): Promise<WifiRttStatusResult>;
  getSatelliteStatus(): SatelliteStatusResult;

  // Phase 4: Security
  getPrivateSpaceInfo(): PrivateSpaceInfo;
  generateKeyAgreementKeyPair(alias: string, preferStrongBox?: boolean): Promise<KeyAgreementKeyPairResult>;
  deriveSharedSecret(alias: string, peerPublicKeyBase64: string): Promise<SharedSecretResult>;
}

/** `null` when the native module is absent (web, Expo Go, or not yet built). */
const PixelNative = requireOptionalNativeModule<PixelNativeModule>('PixelNative');

export default PixelNative;
export const isPixelNativeAvailable = PixelNative != null;
