/**
 * @file types.ts
 * @description Centralized TypeScript definitions and telemetry interfaces for PixelKit SDK.
 * Covers physical sensors, Google Tensor TPU, Titan M3 security, ADPF, and AI pipelines.
 */

/**
 * Represents a 3-dimensional Cartesian vector for spatial orientation.
 */
export interface Vector3D {
  /** X-axis value (lateral tilt or movement) */
  x: number;
  /** Y-axis value (longitudinal tilt or movement) */
  y: number;
  /** Z-axis value (vertical gravitational force or spin) */
  z: number;
}

/**
 * Barometer telemetry representing atmospheric pressure and barometric altitude.
 */
export interface BarometerData {
  /** Atmospheric air pressure in hectopascals (hPa) */
  pressure: number | null;
  /** Estimated relative altitude in meters calculated via hypsometric equation */
  relativeAltitude?: number | null;
}

/**
 * Aggregated real-time sensor telemetry from the device's IMU and environment suite.
 */
export interface SensorTelemetry {
  /** 3-axis gravitational acceleration in g-units */
  accelerometer: Vector3D;
  /** 3-axis angular rotational velocity in radians per second (rad/s) */
  gyroscope: Vector3D;
  /** 3-axis geomagnetic field strength in microteslas (μT) */
  magnetometer: Vector3D;
  /** Barometric air pressure and altitude estimation */
  barometer: BarometerData;
  /** Ambient light level measured by the forward photodiode in Lux */
  lightLux?: number;
  /** Whether the physical hardware sensors are available and actively streaming */
  isAvailable: boolean;
}

/**
 * Linear Resonant Actuator (LRA) haptic vibration patterns.
 */
export type HapticType = 
  | 'selection' // Ultra-light tactile click for switches and pickers
  | 'light'     // Subtle mechanical tap for button presses
  | 'medium'    // Solid tactile feedback for toggles and draggable items
  | 'heavy'     // Firm thud for confirmations or significant actions
  | 'success'   // Double-pulse positive affirmation pattern
  | 'warning'   // Pulsed alert pattern
  | 'error';    // Rapid triple-pulse warning pattern

/**
 * Hardware identification, battery telemetry, and network status.
 */
export interface DeviceTelemetry {
  /** Commercial model name (e.g. "Pixel 11 Pro") */
  modelName: string;
  /** Hardware manufacturer brand (e.g. "Google") */
  brand: string;
  /** Operating system version (e.g. "Android 16") */
  osVersion: string;
  /** Battery percentage 0 to 100, or null when it has not been read yet. */
  batteryPercent: number | null;
  /** Whether external power is attached, even when charging is paused; null until observed. */
  isCharging: boolean | null;
  /** Whether Android Battery Saver mode is currently active */
  lowPowerMode: boolean;
  /** Active network interface type ('WIFI', 'CELLULAR', 'UNKNOWN') */
  networkType: string;
  /** Whether the device has an active internet route */
  isConnected: boolean;
  /** Total system LPDDR5X RAM in megabytes */
  totalMemoryMB?: number;
  /** Real-time battery pack temperature from fuel gauge NTC thermistor in °C, null if unavailable */
  batteryTemperatureC?: number | null;
  /** Instantaneous battery cell voltage in millivolts (e.g. 4120 mV), null if unavailable */
  batteryVoltageMv?: number | null;
  /** Instantaneous current flow in milliamperes (mA; negative discharging, positive charging), null if unavailable */
  batteryCurrentMa?: number | null;
  /** Rolling average current flow in milliamperes (mA), null if unavailable */
  batteryCurrentAvgMa?: number | null;
  /** Instantaneous power draw or charging wattage in Watts, null if unavailable */
  batteryPowerWatts?: number | null;
  /** Battery health condition ('GOOD' | 'OVERHEAT' | 'DEAD' | 'OVER_VOLTAGE' | 'COLD' | 'UNKNOWN') */
  batteryHealth?: string | null;
  /** Remaining charge capacity in milliampere-hours (mAh), null if unavailable */
  batteryChargeCounterMah?: number | null;
  /** Remaining stored energy in milliwatt-hours (mWh), null if unavailable */
  batteryEnergyCounterMwh?: number | null;
  /** Battery technology chemistry string (e.g. "Li-ion"), null if unavailable */
  batteryTechnology?: string | null;
  /** Lifetime charge cycle count from the battery fuel gauge EEPROM (Android 14+), null if unavailable */
  batteryCycleCount?: number | null;
  /** Power source when plugged ('AC' | 'USB' | 'WIRELESS' | 'DOCK' | 'NONE') */
  pluggedSource?: string | null;
}

/**
 * Android Dynamic Performance Framework (ADPF) real-time compute telemetry.
 */
export interface PerformanceHeadroom {
  /** Android 16+ SystemHealthManager CPU available-capacity fraction (0..1), null when not measured; not thermal headroom or utilization. */
  cpuHeadroom: number | null;
  /** Android 16+ SystemHealthManager GPU available-capacity fraction (0..1), null when not measured. */
  gpuHeadroom: number | null;
  /** Why the optional CPU capacity estimate is null; null when an estimate was measured. */
  cpuHeadroomUnavailableReason: 'api_unavailable' | 'unsupported' | 'temporarily_unavailable' | 'read_failed' | 'not_sampled' | null;
  /** Why the optional GPU capacity estimate is null; null when an estimate was measured. */
  gpuHeadroomUnavailableReason: 'api_unavailable' | 'unsupported' | 'temporarily_unavailable' | 'read_failed' | 'not_sampled' | null;
  /** PowerManager thermal headroom: 0.0 cool → 1.0 severe throttling, null if unsupported */
  thermalHeadroom?: number | null;
  /** Kernel thermal state indicating throttling level (PowerManager.THERMAL_STATUS_*) */
  thermalStatus: 'nominal' | 'light' | 'moderate' | 'severe' | 'critical';
  /** Display mode refresh rate in Hz, null until read */
  targetFps: number | null;
  /** Choreographer-measured frames per second, null until the first 1 s window */
  currentFps: number | null;
}

/**
 * Google Tensor TPU (Neural Processing Unit) acceleration metrics.
 */
export interface TPUAcceleration {
  /** Active hardware execution delegate */
  activeDelegate: 'Tensor TPU' | 'NPU' | 'GPU' | 'CPU Fallback';
  /** Whether neural tensor operations are accelerated by dedicated silicon */
  isHardwareAccelerated: boolean;
  /** Latency of the most recent neural inference run in milliseconds */
  lastInferenceLatencyMs: number | null;
  /** Estimated throughput in tokens per second */
  throughputTokensPerSec: number | null;
  /** Memory footprint allocated by on-device model weights in MB */
  memoryFootprintMB: number | null;
}

/**
 * Conversational message format for AI chat and reasoning.
 */
export interface AIMessage {
  /** Unique message identifier */
  id: string;
  /** Speaker role: 'user', 'model' (assistant), or 'system' */
  role: 'user' | 'model' | 'system';
  /** Text content of the prompt or reply */
  content: string;
  /** Epoch timestamp in milliseconds */
  timestamp: number;
  /** Inference execution latency in milliseconds */
  latencyMs?: number;
  /** Approximate token count of the message */
  tokenCount?: number;
}

/**
 * Output data structure from Multimodal Vision AI analysis.
 */
export interface VisionAnalysisResult {
  /** High-level textual description of the visual scene */
  description: string;
  /** Array of recognized labels, objects, and attributes */
  labels: string[];
  /** Vision model inference latency in milliseconds */
  latencyMs: number;
  /** Epoch timestamp of the capture */
  timestamp: number;
}

/**
 * Contactless NFC tag payload and metadata.
 */
export interface NFCTag {
  /** Hexadecimal hardware UID of the physical tag */
  id: string;
  /** Textual or NDEF URI payload read from the tag */
  payload: string;
  /** Wireless standard technology type */
  tech: 'NfcA' | 'IsoDep' | 'Ndef';
  /** Timestamp when the tag was scanned */
  timestamp: number;
}

/**
 * Hardware biometric readiness and enrolled authenticators.
 */
export interface BiometricState {
  /** Whether physical biometric sensor hardware exists */
  hasHardware: boolean;
  /** Whether the user has enrolled fingerprints or face data */
  isEnrolled: boolean;
  /** List of supported modalities ('Fingerprint', 'Face Unlock', etc.) */
  supportedTypes: string[];
}

/**
 * GNSS multi-band satellite location telemetry.
 */
export interface LocationTelemetry {
  /** Latitude in decimal degrees */
  latitude: number;
  /** Longitude in decimal degrees */
  longitude: number;
  /** Altitude above sea level in meters */
  altitude: number | null;
  /** Horizontal positional accuracy radius in meters */
  accuracy: number | null;
  /** Direction of travel in degrees (0 = North) */
  heading: number | null;
  /** Ground speed in meters per second */
  speed: number | null;
  /** Whether fine location permissions are granted */
  hasPermission: boolean;
}

/**
 * Multi-core CPU cluster telemetry and compute metrics.
 */
export interface CPUTelemetry {
  /** CPU core topology built from /proc/cpuinfo parts and cpufreq max frequencies */
  coreTopology: string;
  /** Number of CPU cores visible to the process (7 on Tensor G6) */
  coreCount: number;
  /** Cluster frequency utilisation (avg of current/max over cores), null when sysfs is unreadable */
  cpuLoadPercent: number | null;
  /** Kernel cpufreq governor name for cpu0 (e.g. "schedutil"); read-only for apps */
  governorMode: string;
  /** Last JS single-thread benchmark duration in milliseconds, null until run */
  lastBenchmarkDurationMs: number | null;
}

/**
 * GPU graphics acceleration and Vulkan/OpenGLES telemetry.
 */
export interface GPUTelemetry {
  /** GL_RENDERER read through an offscreen EGL context, null until read */
  gpuRenderer: string | null;
  /** GL_VERSION plus the Vulkan feature version, null until read */
  graphicsApi: string | null;
  /** Average UI-thread frame interval over the last second in ms, null until measured */
  frameRenderTimeMs: number | null;
  /** Cumulative jank frames (interval > 1.5× the display's expected frame time) */
  droppedFrameCount: number;
  /** Always null here: not readable by an app. `useSystemLoad().gpuMemoryUsedMB` is the daemon-sourced value */
  gpuMemoryUsageMB: number | null;
}

/**
 * LPDDR5X system memory and cache metrics.
 */
export interface MemoryTelemetry {
  /** Total system physical RAM in MB */
  totalRAMMB: number;
  /** Currently allocated RAM in MB */
  usedRAMMB: number;
  /** Free available RAM in MB */
  freeRAMMB: number;
  /** Whether the OS Low Memory Killer has issued a memory pressure warning */
  isLowMemory: boolean;
}

/**
 * Bluetooth Low Energy (BLE) peripheral discovery data.
 */
export interface BLEPeripheral {
  /** Unique MAC or Bluetooth UUID */
  id: string;
  /** Advertised device name */
  name: string;
  /** Received Signal Strength Indicator in dBm */
  rssi: number;
  /** Estimated distance in meters based on RSSI path-loss */
  estimatedDistanceMeters: number;
  /** Timestamp when beacon/advertisement was received */
  lastSeenTimestamp: number;
}

/**
 * Ultra-Wideband (UWB) ranging target.
 */
export interface UWBSpatialTarget {
  /** Identifier of the target UWB anchor or peer device */
  deviceId: string;
  /** Distance in meters */
  distanceMeters: number;
  /** Horizontal azimuth angle in degrees (-180 to +180) */
  azimuthDegrees: number;
  /** Vertical elevation angle in degrees (-90 to +90) */
  elevationDegrees: number;
  /** Line-of-sight signal quality (0.0 to 1.0) */
  signalQuality: number;
}

/**
 * Camera Looks names from the Pixel Camera app. Not controllable by third-party apps; kept as UI state.
 */
export type CameraLook =
  | 'Original'
  | 'Natural'
  | 'Shadows'
  | 'Vanilla'
  | 'Editorial'
  | 'Velvet'
  | 'Classic'
  | 'Digi'
  | 'Black Tie'
  | 'Minimal';

/**
 * Camera lens configuration and zoom ratio telemetry.
 */
export interface CameraTelemetry {
  /** Selected lens orientation: 'back' (main array) or 'front' (selfie) */
  facing: 'back' | 'front';
  /** Zoom factor requested from expo-camera */
  zoomFactor: number;
  /** App-side zoom ceiling */
  maxZoomFactor: number;
  /** Flash illumination mode ('auto', 'on', 'off') */
  flashMode: 'auto' | 'on' | 'off';
  /** Whether camera hardware permission has been granted */
  hasPermission: boolean;
  /** Active sensor-level Camera Look profile */
  selectedLook: CameraLook;
  /** UI flag for the Pixel Camera low-light video mode; not controllable by third-party apps */
  isUltraLowLightVideoActive: boolean;
}

/**
 * Detailed network interface and carrier telemetry.
 */
export interface NetworkTelemetry {
  /** IP address string of device */
  ipAddress: string | null;
  /** Network connection type (WIFI, CELLULAR, NONE, UNKNOWN) */
  networkType: string;
  /** Whether internet is reachable */
  isConnected: boolean;
  /** Whether device is metered (e.g. cellular data) */
  isMetered: boolean;
  /** Whether airplane mode is enabled */
  isAirplaneMode: boolean;
}

/**
 * Speech recognition and voice transcription output.
 */
export interface SpeechTranscriptionResult {
  /** Transcribed textual content */
  transcript: string;
  /** Confidence score between 0.0 and 1.0; null when the engine does not report one (Gemini cloud) */
  confidence: number | null;
  /** Duration of recorded audio in seconds */
  durationSeconds: number;
  /** Time taken to perform transcription in milliseconds */
  latencyMs: number;
  /** Language detected or specified (e.g. 'en-US') */
  language: string;
}

// ───────────────────────── 51-Hook Expansion Telemetry Types ─────────────────────────

export type {
  AltimeterTelemetry,
  PressureTrend,
} from '../hardware/useAltimeter';

export type {
  MicrophoneArrayTelemetry,
  MicrophoneBeamDirection,
} from '../hardware/useMicrophoneArray';

export type {
  ThermometerTelemetry,
  ThermometerMode,
} from '../hardware/useThermometer';

export type {
  BatteryShareTelemetry,
} from '../hardware/useBatteryShare';

export type {
  ChargingIntelligenceTelemetry,
  ChargingTier,
} from '../hardware/useChargingIntelligence';

export type {
  ADPFHintSessionTelemetry,
} from '../hardware/useADPFHintSession';

export type {
  Wifi7MloTelemetry,
} from '../hardware/useWifi7MLO';

export type {
  WifiRTTTelemetry,
} from '../hardware/useWifiRTT';

export type {
  SatelliteNTNTechTelemetry,
  SatelliteConnectionState,
} from '../hardware/useSatelliteNTN';

export type {
  PrivateSpaceTelemetry,
  PrivateSpaceAutoLockPolicy,
} from '../hardware/usePrivateSpace';

export type {
  KeyAgreementTelemetry,
} from '../hardware/useKeyAgreement';

export type {
  EmbeddingsTelemetry,
} from '../ai/useEmbeddings';


