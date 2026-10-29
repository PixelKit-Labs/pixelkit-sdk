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

export type CapacityHeadroomUnavailableReason = 'api_unavailable' | 'unsupported' | 'temporarily_unavailable' | 'read_failed';
export type ThermalInfo = {
  thermalHeadroom: number | null; thermalStatus: number; thresholds: Record<string, number> | null;
  /** Android SystemHealthManager capacity remaining, not thermal headroom or utilization. */
  cpuHeadroom: number | null; gpuHeadroom: number | null;
  cpuHeadroomUnavailableReason: CapacityHeadroomUnavailableReason | null;
  gpuHeadroomUnavailableReason: CapacityHeadroomUnavailableReason | null;
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
  error?: string | null;
};

export type HardwareAttestationResult = {
  keyAlias: string;
  algorithm: string;
  /** `KeyInfo.getSecurityLevel()` (API 31+) of the generated key; below API 31 only 'STRONGBOX' (set when StrongBox generation succeeded) or null. */
  securityLevel: 'STRONGBOX' | 'TRUSTED_ENVIRONMENT' | 'SOFTWARE' | 'UNKNOWN_SECURE' | null;
  isStrongBoxBacked: boolean;
  certificateChainLength: number;
  /** DER certificates of the attestation chain, leaf first, base64 (no wrap). */
  certificateChainBase64: string[];
  leafCertificateSubject: string | null;
  leafCertificateIssuer: string | null;
  /** The challenge string whose UTF-8 bytes were embedded in the attestation; generated when none was supplied. */
  challenge: string;
  timestamp: number;
};

export type PerfettoBackend = 'profiling_manager' | 'perfetto_binary';

export type PerfettoInfo = {
  /** True when a system trace backend can be started: ProfilingManager (API 35+) or an executable perfetto binary. */
  isSupported: boolean;
  /** Parsed from `perfetto --version`; null when the app cannot execute the binary (see `perfettoVersionReason`). */
  perfettoVersion: string | null;
  /** Why `perfettoVersion` is null; null when the version was read. */
  perfettoVersionReason: string | null;
  /** atrace categories the perfetto binary accepts; empty for the ProfilingManager backend, which picks its own. */
  availableCategories: string[];
  isTracing: boolean;
  backend: PerfettoBackend | null;
  error?: string | null;
};

export type PerfettoStartResult = {
  started: boolean;
  backend: PerfettoBackend | null;
  /** Categories the backend was configured with; empty when it ignores the request. */
  activeCategories: string[];
  /** False for ProfilingManager, whose data sources are chosen by the platform. */
  categoriesApplied: boolean;
  error: string | null;
};

export type PerfettoStopResult = {
  /** A session existed and the platform delivered a result for it. */
  stopped: boolean;
  /** Absolute path, set only when the file exists with a non-zero length. */
  path: string | null;
  sizeBytes: number | null;
  error: string | null;
};

export type HealthConnectInfo = {
  /** Derived: `healthconnect` framework service (API 34+) or the `com.google.android.apps.healthdata` package is present. Not `HealthConnectClient.getSdkStatus()`. */
  isAvailable: boolean;
  sdkStatus: 'SDK_AVAILABLE' | 'SDK_UNAVAILABLE';
  hasStepCounter: boolean;
  hasHeartRateSensor: boolean;
  stepSensorName: string | null;
  heartRateSensorName: string | null;
  /** The `healthconnect` system service exists (Android 14+). */
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
  plugged: PluggedSource | null;
  status: BatteryStatus;
  technology: string | null;
  cycleCount: number | null;
  chargeCounterMah: number | null;
  energyCounterMwh: number | null;
  thermalZones: ThermalZone[];
};

export type BondedDevice = {
  /** `BluetoothDevice.getName()`; null when unnamed or BLUETOOTH_CONNECT is not granted. */
  name: string | null;
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
    /** `UwbManager.isUwbEnabled()` by reflection; null when that call is not reachable by apps. */
    enabled: boolean | null;
    /** The Android 16 `android.ranging.RangingManager` service exists. */
    rangingApiSupported: boolean;
  };
  wifiRtt: {
    supported: boolean;
    available: boolean;
  };
  thread: {
    supported: boolean;
    /** `ServiceManager` lookup of the Thread network service; null when the (hidden) lookup is not possible. */
    serviceFound: boolean | null;
  };
  satellite: {
    supported: boolean;
    sosSupported?: boolean;
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

/** Result of `executeAppFunction`; function-specific fields accompany `status`. */
export type AppFunctionExecution = {
  status: 'success' | 'error';
  /** Present when `status` is 'error'. */
  message?: string;
  [key: string]: unknown;
};

export type DiscoveredBleDevice = {
  /** `BluetoothDevice.getName()` or the advertised local name; null when the device has neither. */
  name: string | null;
  address: string;
  rssi: number;
  txPower?: number | null;
  timestampNanos: number;
  /** Wall-clock ms of the advertisement: now minus (`SystemClock.elapsedRealtimeNanos()` − `timestampNanos`). */
  lastSeenEpochMs: number;
  serviceUuids: string[];
};

/** Peer parameters for one UWB ranging session; all must match what the peer was given. */
export type UwbRangingConfig = {
  /** FiRa session id agreed with the peer. */
  sessionId: number;
  role: 'initiator' | 'responder';
  /** This device's UWB address as hex bytes (2-byte short or 8-byte extended). */
  localAddress: string;
  /** The peer's UWB address as hex bytes. */
  peerAddress: string;
  /** UwbRangingParams CONFIG_* id 1..6; default 1 (unicast DS-TWR). */
  configId?: number;
  /** UWB channel; must be supplied together with `preambleIndex`. */
  channel?: number;
  preambleIndex?: number;
  /** Hex session key info, required by the provisioned config ids. */
  sessionKeyInfo?: string;
  updateRate?: 'normal' | 'infrequent' | 'frequent';
  slotDurationMs?: 1 | 2;
  /** Ask the platform for azimuth/elevation. */
  angleOfArrival?: boolean;
};

export type UwbRangingStatus =
  | 'opened'
  | 'needs_peer_configuration'
  | 'uwb_unsupported'
  | 'ranging_api_unavailable'
  | 'uwb_disabled'
  | 'permission_denied'
  | 'session_active'
  | 'invalid_parameters'
  | 'open_failed';

export type UwbRangingResult = {
  /** True only when the platform reported `RangingSession.Callback.onOpened`. */
  success: boolean;
  status: UwbRangingStatus;
  /** Reason text for every status other than 'opened'. */
  error: string | null;
  sessionId: number | null;
  technology: 'UWB';
  serviceAvailable: boolean;
  serviceName: 'RangingManager' | null;
  rangingFeature: boolean;
  timestampMs: number;
};

export type UwbStopResult = {
  /** A session (or a pending open) existed when stop was called. */
  wasActive: boolean;
  /** stop() and close() raised no error. */
  closed: boolean;
  sessionId: number | null;
  error: string | null;
  timestampMs: number;
};

export type UwbRangingState = {
  active: boolean;
  opened: boolean;
  sessionId: number | null;
};

export type UwbConfidence = 'low' | 'medium' | 'high';

/** One `android.ranging.RangingData` sample. Distance is meters, angles are degrees; null when the platform omitted it. */
export type UwbMeasurementEvent = {
  sessionId: number;
  deviceId: string;
  distanceMeters: number | null;
  distanceConfidence: UwbConfidence | null;
  azimuthDegrees: number | null;
  azimuthConfidence: UwbConfidence | null;
  elevationDegrees: number | null;
  elevationConfidence: UwbConfidence | null;
  rssi: number | null;
  technology: 'UWB';
  timestampMs: number;
};

export type UwbSessionEvent = {
  sessionId: number;
  state: 'opened' | 'started' | 'stopped' | 'closed' | 'open_failed';
  deviceId: string | null;
  /** RangingSession.Callback reason name (local_request, remote_request, system_policy, no_peers_found, unsupported, unknown). */
  reason: string | null;
  timestampMs: number;
};

/**
 * One BLE Channel Sounding ranging request. `peerAddress` is required: Channel Sounding measures the
 * distance to a specific Bluetooth peer, so there is nothing to range without one.
 */
export type ChannelSoundingRangingConfig = {
  /** The peer's Bluetooth address as six colon-separated hex bytes, for example "AA:BB:CC:DD:EE:FF". */
  peerAddress: string;
  /** Local role; default 'initiator'. */
  role?: 'initiator' | 'responder';
  /** BleCsRangingCapabilities security level: 1 or 4. Omitted means the platform default. */
  securityLevel?: 1 | 4;
  /** Hint passed to BleCsRangingParams.setSightType. Omitted means the platform default. */
  sightType?: 'unknown' | 'line_of_sight' | 'non_line_of_sight';
  /** Hint passed to BleCsRangingParams.setLocationType. Omitted means the platform default. */
  locationType?: 'unknown' | 'indoor' | 'outdoor';
  updateRate?: 'normal' | 'infrequent' | 'frequent';
};

export type ChannelSoundingRangingStatus =
  | 'opened'
  | 'needs_peer_address'
  | 'channel_sounding_unsupported'
  | 'channel_sounding_disabled'
  | 'ranging_api_unavailable'
  | 'bluetooth_disabled'
  | 'permission_denied'
  | 'session_active'
  | 'invalid_parameters'
  | 'open_failed';

export type ChannelSoundingRangingResult = {
  /** True only when the platform reported `RangingSession.Callback.onOpened`. */
  success: boolean;
  status: ChannelSoundingRangingStatus;
  /** Reason text for every status other than 'opened'. */
  error: string | null;
  /** Counter assigned per start request that reached the platform; null when refused earlier. */
  sessionId: number | null;
  peerAddress: string | null;
  technology: 'BLE_CS';
  serviceAvailable: boolean;
  serviceName: 'RangingManager' | null;
  /** android.hardware.bluetooth_le.channel_sounding is declared. */
  channelSoundingFeature: boolean;
  timestampMs: number;
};

export type ChannelSoundingStopResult = {
  /** A session (or a pending open) existed when stop was called. */
  wasActive: boolean;
  /** stop() and close() raised no error. */
  closed: boolean;
  sessionId: number | null;
  error: string | null;
  timestampMs: number;
};

export type ChannelSoundingRangingState = {
  active: boolean;
  opened: boolean;
  sessionId: number | null;
  peerAddress: string | null;
};

export type ChannelSoundingAvailability =
  | 'enabled'
  | 'not_supported'
  | 'disabled_user'
  | 'disabled_regulatory'
  | 'disabled_user_restrictions'
  | `code_${number}`;

/** What android.ranging.RangingManager reported; fields are null when the platform did not deliver them, with `error` saying why. */
export type ChannelSoundingCapabilities = {
  rangingApiAvailable: boolean;
  availability: ChannelSoundingAvailability | null;
  /** BleCsRangingCapabilities.getSupportedSecurityLevels (1 and/or 4). */
  supportedSecurityLevels: number[] | null;
  error: string | null;
  timestampMs: number;
};

export type ChannelSoundingConfidence = 'low' | 'medium' | 'high';

/**
 * One `android.ranging.RangingData` sample from a BLE CS peer. `RangingData` does not say whether
 * phase-based ranging or round-trip time produced it, so no method field exists. Distance is meters;
 * null when the platform omitted it.
 */
export type ChannelSoundingMeasurementEvent = {
  sessionId: number;
  deviceAddress: string;
  distanceMeters: number | null;
  confidence: ChannelSoundingConfidence | null;
  rssi: number | null;
  timestampMs: number;
};

export type ChannelSoundingSessionEvent = {
  sessionId: number;
  state: 'opened' | 'started' | 'stopped' | 'closed' | 'open_failed';
  deviceAddress: string;
  /** RangingSession.Callback reason name (local_request, remote_request, system_policy, no_peers_found, unsupported, unknown). */
  reason: string | null;
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
  transmittedWatts: number | null;
  error?: string | null;
};

export type ChargingTier = 'slow' | 'standard' | 'rapid' | 'ultra_rapid';

export type ChargingIntelligence = {
  stateOfHealthPercent: number | null;
  cycleCount: number | null;
  manufactureDate: string | null;
  firstUsageDate: string | null;
  chargingWattage: number | null;
  /** Classification of `chargingWattage`; null when no wattage was read. */
  chargingTier: ChargingTier | null;
  /** `charge_limit_available` sysfs node is "1"; null when it cannot be read. It says the limit is offered, not that it is on. */
  chargeLimitAvailable: boolean | null;
  error?: string | null;
};

export type MloLinkInfo = {
  /** `MloLink.getBand()`; null when the platform reports it as unspecified. */
  band: '2.4GHz' | '5GHz' | '6GHz' | '60GHz' | null;
  /** `MloLink.getChannel()`. */
  channel: number;
  /** dBm; null when the platform reports `WifiInfo.INVALID_RSSI`. */
  rssi: number | null;
  /** Mbps; null when the platform reports `LINK_SPEED_UNKNOWN`. */
  txLinkSpeedMbps: number | null;
  rxLinkSpeedMbps: number | null;
  /** `MloLink.getState()`: 1 unassociated, 2 idle, 3 active; 'invalid' for 0 or any other value. */
  state: 'invalid' | 'unassociated' | 'idle' | 'active';
};

export type Wifi7MloResult = {
  isSupported: boolean;
  isMloActive: boolean;
  links: MloLinkInfo[];
  aggregateSpeedMbps: number | null;
  error?: string | null;
};

/** One access point measured by `WifiRttManager.startRanging`. */
export type WifiRttResult = {
  bssid: string;
  /** `RangingResult.getStatus()`: 0 success, 1 fail, 2 responder without 802.11mc. */
  status: number;
  statusName: 'success' | 'fail' | 'responder_no_80211mc' | 'unknown';
  /** Distance, standard deviation, RSSI and counters are null unless `status` is 0 (the platform throws otherwise). */
  distanceMm: number | null;
  distanceStdDevMm: number | null;
  rssi: number | null;
  numAttemptedMeasurements: number | null;
  numSuccessfulMeasurements: number | null;
  timestampMs: number | null;
};

export type WifiRttUnresolvedBssid = {
  bssid: string;
  /**
   * Why this BSSID produced no measurement: invalid_bssid, not_in_scan_results, not_80211mc_responder,
   * exceeds_max_peers_N, permission_denied, rtt_unavailable, ranging_timeout, ranging_failed or
   * no_result_returned.
   */
  reason: string;
};

export type WifiRttStatusResult = {
  isSupported: boolean;
  isAvailable: boolean;
  isRanging: boolean;
  rangingResults: WifiRttResult[];
  /** Requested BSSIDs that were not ranged; present on `startWifiRttRanging` results. */
  unresolvedBssids?: WifiRttUnresolvedBssid[];
  /** `RangingResultCallback.onRangingFailure` code when the whole request failed. */
  failureCode?: number | null;
  error?: string | null;
};

export type SatelliteGuidance = {
  azimuthDeg: number;
  elevationDeg: number;
  isAligned: boolean;
};

export type SatelliteStatusResult = {
  /** `android.hardware.telephony.satellite` system feature. */
  isSupported: boolean;
  /** Always null: Android's public API exposes no satellite connection state. */
  connectionState: 'disconnected' | 'searching' | 'connected' | 'pointing_assist' | null;
  /** Always null: no public carrier read. */
  carrier: string | null;
  /** Always null: no public signal read. */
  signalQualityBars: number | null;
  /** Always null: no public pointing data. */
  pointingGuidance: SatelliteGuidance | null;
  /** Always null: no public emergency-readiness read. */
  emergencyServicesReady: boolean | null;
  /** Why the null fields are null. */
  unreadReason: string;
  error?: string | null;
};

export type PrivateSpaceInfo = {
  /** Null when the app runs in a profile whose type cannot be read. */
  isInsidePrivateSpace: boolean | null;
  /** True only when the app itself runs inside the Private Space; null otherwise (Android hides the profile from apps). */
  isPrivateSpaceConfigured: boolean | null;
  /** Why unreadable values are null. */
  reason: string | null;
  error?: string | null;
};

export type KeyAgreementKeyPairResult = {
  alias: string;
  publicKeyBase64: string | null;
  /** `KeyInfo.getSecurityLevel()` of the generated key (API 31+); null when unreadable or generation failed. */
  securityLevel: 'STRONGBOX' | 'TRUSTED_ENVIRONMENT' | 'SOFTWARE' | 'UNKNOWN_SECURE' | null;
  /** Why `securityLevel` is null after a successful generation. */
  securityLevelReason?: string | null;
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
  onUwbRangingResult(e: UwbMeasurementEvent): void;
  onUwbRangingState(e: UwbSessionEvent): void;
  onChannelSoundingResult(e: ChannelSoundingMeasurementEvent): void;
  onChannelSoundingState(e: ChannelSoundingSessionEvent): void;
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
  /** Starts a real system trace; `started` is false with `error` when no backend could start one. */
  startPerfettoTrace(categories?: string[], bufferSizeKb?: number): Promise<PerfettoStartResult>;
  /** `path` is set only when the trace file exists with a non-zero length. */
  stopPerfettoTrace(): Promise<PerfettoStopResult>;
  getHealthConnectInfo(): HealthConnectInfo;
  getHapticsInfo(): HapticsInfo;
  playEnvelope(points: EnvelopePoint[], initialSharpness?: number | null): boolean;
  playPrimitives(steps: PrimitiveStep[]): boolean;
  cancelVibration(): boolean;
  getBatteryTelemetry(): BatteryTelemetry;
  getRadioInfo(): RadioInfo;
  /** True when the active network lacks `NET_CAPABILITY_NOT_METERED`; null when there is no active network or the read is not permitted. */
  getNetworkMetered(): boolean | null;
  startBleScan(timeoutMs?: number): Promise<{ success: boolean; scanning: boolean; error?: string }>;
  stopBleScan(): boolean;
  getDiscoveredBleDevices(): DiscoveredBleDevice[];
  /** `scanning` is true while a scan callback is registered; `errorCode`/`error` come from `ScanCallback.onScanFailed`. */
  getBleScanState(): { scanning: boolean; errorCode: number | null; error: string | null };
  /** Enables NfcAdapter reader mode on the foreground Activity; tags arrive on `onNfcTag`. `success` is true only after `enableReaderMode` returned on the main thread. */
  startNfcReader(flags?: number): Promise<{ success: boolean; flags?: number; started?: boolean; error?: string }>;
  /** Disables reader mode. Safe when no reader is running. */
  stopNfcReader(): Promise<{ success: boolean; error?: string }>;
  /** Queues a text record written to the next tag that enters the field. */
  writeNdefText(text: string): Promise<{ success: boolean; queuedBytes?: number; error?: string }>;
  isNfcReaderActive(): boolean;
  /**
   * Opens a real android.ranging UWB session with the peer described by `config` (Android 16+, needs
   * android.permission.RANGING). Resolves with a `status` explaining refusals; measurements arrive as
   * `onUwbRangingResult` events.
   */
  startUwbRanging(config: UwbRangingConfig): Promise<UwbRangingResult>;
  /** Closes the running session. `wasActive` is false when nothing was running. */
  stopUwbRanging(): UwbStopResult;
  getUwbRangingState(): UwbRangingState;
  /**
   * Opens a real android.ranging BLE Channel Sounding session with the peer at `config.peerAddress`
   * (Android 16+, needs android.permission.RANGING). Resolves with a `status` explaining refusals;
   * distances arrive as `onChannelSoundingResult` events.
   */
  startChannelSounding(config: ChannelSoundingRangingConfig): Promise<ChannelSoundingRangingResult>;
  /** Closes the running session. `wasActive` is false when nothing was running. */
  stopChannelSounding(): ChannelSoundingStopResult;
  getChannelSoundingState(): ChannelSoundingRangingState;
  /** RangingManager's availability for BLE Channel Sounding and the supported CS security levels. */
  getChannelSoundingCapabilities(): Promise<ChannelSoundingCapabilities>;
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
  /** Only functions that `executeAppFunction` really performs are listed. */
  getAppFunctions(): AppFunctionInfo[];
  /** Rejects with E_APP_FUNCTION_UNKNOWN for an id that `getAppFunctions` does not list. */
  executeAppFunction(functionId: string, params?: Record<string, any>): Promise<AppFunctionExecution>;

  // Phase 1: Sensors & Acoustics
  getMicrophoneArray(): MicrophoneArrayResult;
  getThermometerReading(): ThermometerReading;

  // Phase 2: Silicon & Battery
  getBatteryShareStatus(): BatteryShareStatus;
  setBatteryShareEnabled(enabled: boolean): Promise<boolean>;
  getChargingIntelligence(): ChargingIntelligence;
  /** Closes any previous session, then creates one for `tids` (default: the app's main thread). Resolves true only when the platform returned a session. */
  createADPFHintSession(targetDurationNanos: number, tids?: number[]): Promise<boolean>;
  reportADPFWorkDuration(actualDurationNanos: number): boolean;
  updateADPFWorkDuration(targetDurationNanos: number): boolean;
  closeADPFHintSession(): boolean;

  // Phase 3: Radios & Mesh
  getWifi7MloInfo(): Wifi7MloResult;
  getWifiRttStatus(): WifiRttStatusResult;
  /**
   * Runs one real `WifiRttManager.startRanging` round. BSSIDs must be 802.11mc responders present in
   * the latest Wi-Fi scan results; the rest come back in `unresolvedBssids` with the reason.
   * Needs ACCESS_FINE_LOCATION (and NEARBY_WIFI_DEVICES on Android 13+) granted by the app.
   */
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
