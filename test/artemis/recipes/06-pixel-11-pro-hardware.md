# Recipe 06: Pixel 11 Pro & Android 17 Hardware Extensions

## Objective
Verify all Pixel 11 Pro (Tensor G6, grizzly) and Android 17 hardware extensions: In-App DevTools HUD, CameraX ISP extensions, Android 17 AppFunctions, Spatial Audio, BLE 6.0 Channel Sounding, Titan M2 Key Attestation, Perfetto Silicon Tracing, and Health Connect.

## Target Application
- App Name: `PixelKit` or `PixelKit Template`
- Package: `com.pixelkit.sdk` (or `com.pixelkit.template`)

---

## Verification Flow

### 1. In-App Developer HUD (`<PixelKitDevTools />`)
- Verify floating DevTools HUD badge is visible on the display.
- Verify live metrics render:
  - Real-time FPS (e.g. 60 or 120 Hz)
  - ADPF Thermal headroom status (`Normal`, `Moderate`, or `Severe`)
  - Tensor G6 CPU cluster loads
- Tap badge to expand details, drag across screen to confirm PanResponder responsiveness.

### 2. Android Perfetto Silicon Tracing (`usePerfetto`)
- Navigate to **Silicon** tab -> **Trace** section.
- Locate the **Silicon Tracing** subsection:
  - Verify card displays the trace backend (`profiling_manager` or `perfetto_binary`). The Perfetto version is shown only when `perfettoVersion` is non-null; when the app cannot execute the binary, verify the card shows the unavailable reason, not a version.
  - Verify source indicates `hardware`.
- Tap **Capture 5s silicon trace**:
  - Verify state transitions to `TRACING`, or that an error with the reason is shown and the state stays idle.
  - After 5 seconds, verify a trace file path and size in bytes are populated only when the file exists (`adb shell run-as <package> ls -l <path>` shows a non-empty file); otherwise verify an error is shown instead of a path.

### 3. Android 17 AppFunctions System Agent Bridge (`useAppFunctions`)
- Navigate to **AI Lab** tab -> **Agents** section.
- Verify **Android 17 AppFunctions** header and card:
  - Status shows `REGISTRY ACTIVE` on Android 16/17 dev builds.
  - Lists registered agent tools (`check_phone_thermals`, `purge_memory_cache`, `get_device_silicon_info`, etc.). `pulse_hilight` / `triggerHiLightPulse` is not an AppFunction; the HiLight ring is driven by `useHiLight`.
- Tap **Run it** on any tool card:
  - Verify feedback banner displays `Executed [tool] ... (X ms)`.
  - Verify zero native exceptions in Logcat.

### 4. CameraX Computational Photography Extensions (`useCameraExtensions`)
- Navigate to **Sensors** tab -> **Capture** section.
- Scroll to **CameraX Extensions**:
  - Verify badge shows `TENSOR ISP`.
  - Verify detected camera extension modes (Night Sight, Ultra HDR, Portrait Bokeh).
  - Confirm `source` is `hardware` on Pixel hardware.

### 5. Spatial Audio & Dynamic Head Tracking (`useSpatialAudio`)
- Navigate to **Sensors** tab -> **Audio** section.
- Scroll to **Spatial Audio**:
  - Verify card displays Android Spatializer status.
  - If Pixel Buds Pro are paired, verify head tracking mode indicates `relative_world` or `relative_device`.
  - Confirm `source` is `hardware` or `unavailable` (never synthetic).

### 6. BLE 6.0 Channel Sounding & Ambient Radios (`useChannelSounding`, `useRadios`)
- Navigate to **Sensors** tab -> **Radios** section.
- Under **Radio inventory**:
  - Verify Thread 802.15.4 mesh (`chip0`) and Satellite SOS availability.
- Under the Channel Sounding card (the template's visible label may still read **BLE 6.0 Channel Sounding**):
  - Verify `isSupported` follows the `android.hardware.bluetooth_le.channel_sounding` feature flag and `rangingAvailability` shows what `RangingManager` reports, or `—` when it did not.
  - Tap start ranging without a peer address: the expected result is `needs_peer_address` in `sessionError` and no session; the card must not show a distance or a precision claim.
  - With a Channel Sounding peer's Bluetooth address and `android.permission.RANGING` granted, the expected result is `isRanging` true after `onOpened` and `measurements` filled only by platform samples (distance may be `—` until the peer answers). Without a peer, record this step as not exercised.

### 7. Keystore Key Attestation (`usePlayIntegrity`)
- Navigate to **Sensors** tab -> **Security** section.
- Locate **Play Integrity & Key Attestation** (the template's visible label may still mention Play Integrity; the hook returns no integrity verdict):
  - Verify `hasStrongBox` and `strongBoxVersion` follow the `android.hardware.strongbox_keystore` feature and no integrity verdict (`MEETS_*`) is shown.
- Tap **Attest Hardware Key**:
  - Verify button shows `Attesting…`.
  - Verify the attestation returns a `securityLevel` read from `KeyInfo` (`—` when null), the challenge actually used, and `certificateChainBase64`.
  - Verify certificate chain length is displayed (e.g. `3 certs`).

### 8. Health Connect & Sensor Vitals (`useHealthConnect`)
- Navigate to **Sensors** tab -> **Motion** section.
- Locate **Health Connect & Vitals**:
  - Verify API 34+ status and hardware step counter detection.
- Tap **Refresh vitals** and confirm zero native crashes.

---

## Logcat Diagnostics & Pass Criteria
- Run: `adb logcat -d *:E | grep -iE "pixelkit|pixelnative"`
- **Pass Criteria**:
  - Zero fatal unhandled exceptions or crashes.
  - All hardware features report `source: 'hardware'` or graceful `unavailable` on non-supported configurations.
  - Nothing simulated.
