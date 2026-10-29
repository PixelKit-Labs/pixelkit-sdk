# Recipe 07: Next-Gen Hardware & AI Capabilities (Phase 1–4 Expansion)

## Objective
Verify all 12 next-generation PixelKit capabilities across Sensors, Acoustics, Silicon, Battery, Advanced Radios, Security, and Edge AI on connected Google Pixel hardware (or Android emulator):
1. `useAltimeter` (Sensors & Barometric Altitude)
2. `useMicrophoneArray` (Audio Beamforming & Microphone Directionality)
3. `useThermometer` (FIR MLX90632 Temperature Sensor on Pixel 8/9/10/11 Pro)
4. `useBatteryShare` (Reverse Wireless Charging Qi TX)
5. `useChargingIntelligence` (Battery Cycle Count & State of Health)
6. `useADPFHintSession` (PerformanceHintManager Frame Hints & Work Duration)
7. `useWifi7MLO` (802.11be Multi-Link Operation)
8. `useWifiRTT` (802.11az / 802.11mc Fine Timing Measurement Ranging)
9. `useSatelliteNTN` (satellite telephony system feature; no public connection state)
10. `usePrivateSpace` (Android 15+ UserManager Profile Isolation)
11. `useKeyAgreement` (Keystore ECDH Key Agreement, security level read from KeyInfo)
12. `useEmbeddings` (MediaPipe TextEmbedder Vector Embeddings & Cosine Similarity)

## Target Application
- App Name: `PixelKit` or `PixelKit Template`
- Package: `com.pixelkit.sdk` (or `com.pixelkit.template`)

---

## Verification Flow

### 1. High-Precision Barometric Altimeter (`useAltimeter`)
- Navigate to **Sensors** tab -> **Motion** section.
- Locate the **Altimeter & Climb Velocity** card:
  - Verify pressure readings update in real time (hPa).
  - Verify ICAO altitude (meters) is computed from barometric pressure when available.
  - Verify climb velocity (m/s) displays rate of vertical motion.
  - Confirm pressure trend is `null` (shown as an em dash) for the first 10 s of sampling, then reports `steady`, `rising`, `falling`, or `rapid_fall`.
  - Tap **Calibrate QNH (1013.25 hPa)** to test sea-level reference adjustment.
  - Confirm `source` reports `'derived'` when pressure sensor is present, or `'unavailable'` with `null` readings if no barometer exists (Zero-simulation principle).

### 2. Directional Microphone Array & Beamforming (`useMicrophoneArray`)
- Navigate to **Sensors** tab -> **Audio** section.
- Locate **Microphone Array & Directivity**:
  - Verify list of physical microphones detected on device with ID, location (`back`, `bottom`, `main`), and directionality.
  - Tap beam direction selectors: **User**, **Away**, **Omni**.
  - Adjust field zoom slider (0.0 to 1.0) to test acoustic focus narrowing.
  - Verify `source` reports `'hardware'` or `'unavailable'` on devices without multi-mic hardware.

### 3. FIR Infrared Object & Ambient Thermometer (`useThermometer`)
- Navigate to **Sensors** tab -> **Capture** or **Sensors** section.
- Locate **Infrared Thermometer**:
  - On Pixel 8/9/10/11 Pro devices with the MLX90632 FIR sensor:
    - Verify `isSupported` is `true`.
    - Verify surface temperature (°C / °F) and ambient sensor temperature update.
    - Switch measurement modes (`object`, `body`, `ambient`).
    - Adjust emissivity setting for target surface materials.
  - On non-Pro Pixel models or emulators lacking the FIR sensor:
    - Verify `isSupported` is `false`.
    - Verify all temperature values return `null` and em dash (`—`).
    - Verify `source` reports `'unavailable'` (no fake temperatures).

### 4. Reverse Wireless Charging Battery Share (`useBatteryShare`)
- Navigate to **Silicon** tab -> **System** section.
- Locate **Battery Share (Qi TX)**:
  - Verify reverse charging capability status (`isSupported`).
  - Toggle **Enable Battery Share**:
    - If hardware supports wireless TX: verify state transitions to active and transmitted wattage displays when receiver is placed.
    - Set battery cutoff threshold (e.g. 20% or 30%) to ensure host protection.
  - On devices without Qi TX hardware:
    - Verify `isSupported: false`, `isActive: false`, `transmittedWatts: null`, `source: 'unavailable'`.

### 5. Charging Intelligence & Battery Health (`useChargingIntelligence`)
- Navigate to **Silicon** tab -> **System** section.
- Locate **Charging Intelligence & Battery Health**:
  - Verify battery cycle count (e.g. `142 cycles`).
  - Verify State of Health percentage (e.g. `98%`).
  - Verify manufacture date and first usage date when available via HAL.
  - Verify charging tier classification (`slow`, `standard`, `rapid`, `ultra_rapid`) when plugged into power.
  - Confirm zero synthetic or estimated health percentages: unreadable values display as `null` / `—` and report `source: 'unavailable'`.

### 6. ADPF Performance Hint Session (`useADPFHintSession`)
- Navigate to **Silicon** tab -> **Compute** section.
- Locate **ADPF Work Duration Hint Session**:
  - Verify `isSupported` is true only when `PerformanceHintManager.createHintSession` returned a session; when it is false, `error` states that no session was returned.
  - Verify target frame duration is set (e.g. `16.6 ms` for 60Hz or `8.3 ms` for 120Hz).
  - Report a work duration for the session's thread (the main thread unless thread ids were passed):
    - Verify `reportWorkDuration()` returns `true` only when the platform accepted the call, with zero native JNI crashes.
    - Verify `closeSession()` returns `true` and leaves `isSupported` unchanged.
    - Verify `source: 'hardware'` only while a session exists.

### 7. Wi-Fi 7 Multi-Link Operation MLO (`useWifi7MLO`)
- Navigate to **Sensors** tab -> **Radios** section.
- Locate **Wi-Fi 7 MLO (802.11be)**:
  - If connected to a Wi-Fi 7 access point with MLO enabled:
    - Verify affiliated links display separate bands (e.g. 5GHz + 6GHz) with `state` `unassociated`, `idle` or `active`.
    - Verify individual link RSSI, TX/RX speeds and channel number; unknown values display as `—` (null). No channel width is reported.
    - Verify `isMloActive` is true only when more than one link is associated, and `aggregateSpeedMbps` is the sum of TX speeds of the associated links.
  - If connected to Wi-Fi 6/5 or offline:
    - Verify `isMloActive: false`, empty links array, `aggregateSpeedMbps: null`, `source: 'unavailable'`.

### 8. Wi-Fi RTT Indoor Positioning (`useWifiRTT`)
- Navigate to **Sensors** tab -> **Radios** section.
- Locate **Wi-Fi RTT (802.11az / 802.11mc FTM)**:
  - Verify `isSupported` reflects hardware FTM ranging support in `WifiRttManager`.
  - Tap **Scan RTT Responders**:
    - Verifies ranging query completes without throwing unhandled exceptions.
    - If FTM-capable access points respond, verify distance in millimeters and standard deviation.

### 9. Rel-17 Satellite Non-Terrestrial Network (`useSatelliteNTN`)
- Navigate to **Sensors** tab -> **Radios** section.
- Locate **Satellite NTN (Rel-17 SOS)**:
  - Verify `isSupported` follows the `android.hardware.telephony.satellite` system feature.
  - Verify connection state, carrier, signal bars, pointing guidance and SOS readiness display as `—` (null) with `unreadReason` shown: Android exposes none of them to apps.
  - Confirm zero synthetic satellite connections on any hardware.

### 10. Android 15 Private Space Isolation (`usePrivateSpace`)
- Navigate to **Sensors** tab -> **Security** section.
- Locate **Android 15 Private Space**:
  - Verify `isInsidePrivateSpace` is `false` when the app runs in the main user profile; inside the private profile it is `true`, or `null` when the profile type cannot be read.
  - Verify `isPrivateSpaceConfigured` is `null` from the main profile (Android hides the Private Space from apps) and `true` only when running inside it; `reason` explains the null.
  - Confirm no auto-lock policy is shown: it is not readable by apps.

### 11. Keystore ECDH Key Agreement (`useKeyAgreement`)
- Navigate to **Sensors** tab -> **Security** section.
- Locate **Keystore Key Agreement (ECDH)**:
  - Verify `isStrongBoxSupported` reflects the `android.hardware.strongbox_keystore` feature.
  - Tap **Generate ECDH Keypair**:
    - Generates an EC keypair in the Android Keystore (StrongBox requested when the device declares it).
    - Displays public key in base64 format and `securityLevel` as read from `KeyInfo` (`—` when null).
  - Tap **Derive Shared Secret**:
    - Executes ECDH key agreement via `javax.crypto.KeyAgreement` with the Keystore private key.
    - Confirms shared secret is derived with zero keystore corruption.

### 12. On-Device Vector Embeddings (`useEmbeddings`)
- Navigate to **AI Lab** tab -> **Tasks** or **Vision** section.
- Locate the embeddings card (the template app's visible label may still read **EdgeTPU Vector Embeddings**; inference is MediaPipe TextEmbedder on CPU):
  - Verify `isAvailable` for the local embedding model. If `filesDir/models/text_embedder.tflite` is not installed, the expected result is unavailable with `unavailableReason` shown, not a vector.
  - With the model installed, enter test prompt: `"PixelKit hardware telemetry on Tensor G6"` and tap **Generate Embedding**:
    - Generates a float vector on-device whose length equals `vectorDimension` (the model's real output size).
    - Verifies the vector is non-empty and unit-length (L2-normalised).
  - Test **Cosine Similarity**:
    - Compares two test texts and verifies the similarity score is within -1.0 to 1.0.

---

## Logcat Diagnostics & Pass Criteria
- Run:
  ```bash
  adb logcat -d *:E | grep -iE "pixelkit|pixelnative|pixelnano|PerformanceHint|MLX90632|KeyAgreement"
  ```
- **Pass Criteria**:
  - Zero fatal unhandled exceptions or crashes across all 12 modules.
  - All hooks strictly obey the **Zero-Simulation Principle**:
    - Values are read from hardware where supported (`source: 'hardware'` or `'derived'`).
    - Unavailable features report `source: 'unavailable'` and `null` values.
    - No fabricated readings or mock data.
