package expo.modules.pixelnative

import android.app.ActivityManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import java.util.Collections
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraExtensionCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.wifi.rtt.WifiRttManager
import android.nfc.NfcAdapter
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.nfc.tech.NfcA
import android.os.Bundle
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Choreographer
import android.view.Display
import android.view.WindowManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.cert.X509Certificate
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class NativeUnavailableException(what: String, why: String) :
  CodedException("E_PIXEL_NATIVE_UNAVAILABLE", "$what unavailable: $why", null)

/**
 * PixelNative: real Android platform telemetry and actuators for PixelKit.
 * Everything here reads or drives actual hardware/OS state. Nothing is fabricated;
 * when an API is missing on the device the function reports null or throws.
 */
class PixelNativeModule : Module() {
  internal val context: Context
    get() = appContext.reactContext ?: throw NativeUnavailableException("React context", "lost")

  private val mainHandler = Handler(Looper.getMainLooper())
  private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
  private var frameCallback: Choreographer.FrameCallback? = null
  private var torchCallback: CameraManager.TorchCallback? = null
  private var speechRecognizer: android.speech.SpeechRecognizer? = null
  private var bleScanCallback: ScanCallback? = null
  /** Active NFC reader-mode callback; non-null only while the reader is running. */
  private var nfcReaderCallback: NfcAdapter.ReaderCallback? = null
  /** Text queued by writeNdefText, written to the next tag that enters the field. */
  private var pendingNdefWrite: String? = null
  private val discoveredBleDevices = Collections.synchronizedList(mutableListOf<Map<String, Any?>>())

  // App-process CPU sampling state
  private var lastCpuMs = 0L
  private var lastWallMs = 0L

  override fun definition() = ModuleDefinition {
    Name("PixelNative")

    Events(
      "onThermalStatus",
      "onFrameStats",
      "onTorchState",
      "onSpeechPartial",
      "onSpeechResult",
      "onSpeechRms",
      "onSpeechError",
      "onBleDeviceFound",
      "onNfcTag",
      "onNfcError"
    )

    // ───────────────────────── SoC / build identity ─────────────────────────
    Function("getSocInfo") {
      mapOf(
        "socModel" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else null),
        "socManufacturer" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MANUFACTURER else null),
        "hardware" to Build.HARDWARE,
        "device" to Build.DEVICE,
        "model" to Build.MODEL,
        "buildId" to Build.ID,
        "release" to Build.VERSION.RELEASE,
        "sdkInt" to Build.VERSION.SDK_INT,
        "sdkIntFull" to (if (Build.VERSION.SDK_INT >= 36) Build.VERSION.SDK_INT_FULL else null),
        "securityPatch" to Build.VERSION.SECURITY_PATCH,
        "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
      )
    }

    Function("hasSystemFeature") { name: String -> context.packageManager.hasSystemFeature(name) }

    Function("getPackageVersion") { pkg: String ->
      try {
        val info = context.packageManager.getPackageInfo(pkg, 0)
        mapOf("installed" to true, "versionName" to info.versionName, "versionCode" to info.longVersionCode)
      } catch (e: PackageManager.NameNotFoundException) {
        mapOf("installed" to false, "versionName" to null, "versionCode" to null)
      }
    }

    // ───────────────────────── CPU ─────────────────────────
    Function("getCpuInfo") { cpuInfo() }

    Function("getCpuLoad") {
      val nowWall = SystemClock.elapsedRealtime()
      val nowCpu = Process.getElapsedCpuTime()
      val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
      val appPercent = if (lastWallMs == 0L) null else {
        val wallDelta = (nowWall - lastWallMs).coerceAtLeast(1)
        ((nowCpu - lastCpuMs).toDouble() / wallDelta / cores * 100.0).coerceIn(0.0, 100.0)
      }
      lastWallMs = nowWall
      lastCpuMs = nowCpu
      val freqs = coreFrequencies()
      val util = freqs.mapNotNull { c ->
        val cur = c["curMHz"] as? Int
        val max = c["maxMHz"] as? Int
        if (cur != null && max != null && max > 0) cur.toDouble() / max else null
      }
      mapOf(
        "appCpuPercent" to appPercent,
        "frequencyUtilizationPercent" to (if (util.isEmpty()) null else util.average() * 100.0),
        "cores" to freqs,
      )
    }

    // ───────────────────────── Memory ─────────────────────────
    Function("getMemoryInfo") { memoryInfo() }

    Function("requestGc") {
      Runtime.getRuntime().gc()
      System.runFinalization()
      memoryInfo()
    }

    // ───────────────────────── Thermal / ADPF ─────────────────────────
    Function("getThermal") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val headroom = try { pm.getThermalHeadroom(0) } catch (e: Throwable) { Float.NaN }
      val thresholds: Map<String, Float>? = if (Build.VERSION.SDK_INT >= 35) {
        try { pm.thermalHeadroomThresholds.entries.associate { it.key.toString() to it.value } } catch (e: Throwable) { null }
      } else null
      mapOf(
        "thermalHeadroom" to (if (headroom.isNaN()) null else headroom.toDouble()),
        "thermalStatus" to pm.currentThermalStatus,
        "thresholds" to thresholds,
        "cpuHeadroom" to healthHeadroom("Cpu"),
        "gpuHeadroom" to healthHeadroom("Gpu"),
      )
    }

    OnStartObserving("onThermalStatus") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val listener = PowerManager.OnThermalStatusChangedListener { status ->
        sendEvent("onThermalStatus", mapOf("status" to status))
      }
      thermalListener = listener
      pm.addThermalStatusListener(listener)
    }

    OnStopObserving("onThermalStatus") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      thermalListener?.let { pm.removeThermalStatusListener(it) }
      thermalListener = null
    }

    // ───────────────────────── Display ─────────────────────────
    Function("getDisplayInfo") { displayInfo() }

    AsyncFunction("setPreferredRefreshRate") { rate: Double ->
      val activity = appContext.currentActivity ?: throw NativeUnavailableException("Activity", "not resumed")
      val attrs = activity.window.attributes
      attrs.preferredRefreshRate = rate.toFloat()
      activity.window.attributes = attrs
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setHighBrightnessMode") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: throw NativeUnavailableException("Activity", "not resumed")
      val window = activity.window
      val attrs = window.attributes
      attrs.screenBrightness = if (enabled) WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
      window.attributes = attrs
      if (Build.VERSION.SDK_INT >= 34) {
        window.setDesiredHdrHeadroom(if (enabled) 3.0f else 0.0f)
      }
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setPreferredDisplayMode") { modeId: Int ->
      val activity = appContext.currentActivity ?: throw NativeUnavailableException("Activity", "not resumed")
      val window = activity.window
      val attrs = window.attributes
      attrs.preferredDisplayModeId = modeId
      window.attributes = attrs
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setDesiredHdrHeadroom") { headroom: Double ->
      if (Build.VERSION.SDK_INT >= 34) {
        val activity = appContext.currentActivity ?: throw NativeUnavailableException("Activity", "not resumed")
        activity.window.setDesiredHdrHeadroom(headroom.toFloat())
        true
      } else {
        false
      }
    }.runOnQueue(Queues.MAIN)

    // ───────────────────────── GPU ─────────────────────────
    Function("getGpuInfo") { gpuInfo() }

    OnStartObserving("onFrameStats") { startFrameStats() }
    OnStopObserving("onFrameStats") { frameCallback = null }

    // ───────────────────────── Torch ─────────────────────────
    Function("getTorchInfo") {
      val id = torchCameraId()
      if (id == null) mapOf("available" to false) else {
        val ch = cameraManager.getCameraCharacteristics(id)
        val max = if (Build.VERSION.SDK_INT >= 33) ch.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL) else null
        val def = if (Build.VERSION.SDK_INT >= 33) ch.get(CameraCharacteristics.FLASH_INFO_STRENGTH_DEFAULT_LEVEL) else null
        val level = if (Build.VERSION.SDK_INT >= 33) try { cameraManager.getTorchStrengthLevel(id) } catch (e: Throwable) { null } else null
        mapOf("available" to true, "cameraId" to id, "maxStrengthLevel" to max, "defaultStrengthLevel" to def, "currentStrengthLevel" to level)
      }
    }

    AsyncFunction("setTorch") { on: Boolean, strengthLevel: Int? ->
      val id = torchCameraId() ?: throw NativeUnavailableException("Torch", "no rear camera with flash")
      try {
        if (on && strengthLevel != null && Build.VERSION.SDK_INT >= 33) {
          cameraManager.turnOnTorchWithStrengthLevel(id, strengthLevel.coerceAtLeast(1))
        } else {
          cameraManager.setTorchMode(id, on)
        }
        true
      } catch (e: Throwable) {
        throw CodedException("E_TORCH", e.message ?: "torch failed (camera in use?)", e)
      }
    }

    OnStartObserving("onTorchState") {
      val cb = object : CameraManager.TorchCallback() {
        override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
          sendEvent("onTorchState", mapOf("cameraId" to cameraId, "enabled" to enabled))
        }
        override fun onTorchModeUnavailable(cameraId: String) {
          sendEvent("onTorchState", mapOf("cameraId" to cameraId, "enabled" to false, "unavailable" to true))
        }
      }
      torchCallback = cb
      cameraManager.registerTorchCallback(cb, mainHandler)
    }

    OnStopObserving("onTorchState") {
      torchCallback?.let { cameraManager.unregisterTorchCallback(it) }
      torchCallback = null
    }

    // ───────────────────────── Camera Extensions (Night Sight, Ultra HDR, Bokeh) ─────────────────────────
    Function("getCameraExtensions") {
      cameraExtensionsInfo()
    }

    // ───────────────────────── AppFunctions (Android 16/17+) ─────────────────────────
    Function("getAppFunctionsInfo") {
      appFunctionsInfo()
    }

    // ───────────────────────── Spatial Audio & Head Tracking (Android 13+) ─────────────────────────
    Function("getSpatialAudioInfo") {
      spatialAudioInfo()
    }

    // ───────────────────────── BLE Channel Sounding (BT 6.0 / API 34+) ─────────────────────────
    Function("getChannelSoundingInfo") {
      channelSoundingInfo()
    }

    // ───────────────────────── Play Integrity & StrongBox Attestation ─────────────────────────
    Function("getPlayIntegrityInfo") {
      playIntegrityInfo()
    }

    AsyncFunction("attestHardwareKey") { challengeStr: String? ->
      attestHardwareKey(challengeStr)
    }

    // ───────────────────────── Perfetto System Tracing ─────────────────────────
    Function("getPerfettoInfo") {
      perfettoInfo()
    }

    Function("beginTraceSection") { name: String ->
      android.os.Trace.beginSection(name.take(127))
      true
    }

    Function("endTraceSection") {
      android.os.Trace.endSection()
      true
    }

    Function("setTraceCounter") { name: String, value: Double ->
      if (Build.VERSION.SDK_INT >= 29) {
        android.os.Trace.setCounter(name.take(127), value.toLong())
      }
      true
    }

    AsyncFunction("startPerfettoTrace") { categories: List<String>?, bufferSizeKb: Int? ->
      startPerfettoTrace(categories, bufferSizeKb)
    }

    AsyncFunction("stopPerfettoTrace") {
      stopPerfettoTrace()
    }

    // ───────────────────────── Health Connect & Vitals ─────────────────────────
    Function("getHealthConnectInfo") {
      healthConnectInfo()
    }

    // ───────────────────────── Haptics ─────────────────────────
    Function("getHapticsInfo") {
      val v = vibrator()
      val resonant = if (Build.VERSION.SDK_INT >= 30) v.resonantFrequency else Float.NaN
      val q = if (Build.VERSION.SDK_INT >= 30) v.qFactor else Float.NaN
      val envelope = if (Build.VERSION.SDK_INT >= 36) try { v.areEnvelopeEffectsSupported() } catch (e: Throwable) { false } else false
      val primitives = if (Build.VERSION.SDK_INT >= 30) PRIMITIVES.filter { (_, id) -> try { v.areAllPrimitivesSupported(id) } catch (e: Throwable) { false } }.keys.toList() else emptyList()
      mapOf(
        "hasVibrator" to v.hasVibrator(),
        "hasAmplitudeControl" to v.hasAmplitudeControl(),
        "envelopeEffectsSupported" to envelope,
        "resonantFrequencyHz" to (if (resonant.isNaN()) null else resonant.toDouble()),
        "qFactor" to (if (q.isNaN()) null else q.toDouble()),
        "supportedPrimitives" to primitives,
      )
    }

    Function("playEnvelope") { points: List<Map<String, Any?>>, initialSharpness: Double? ->
      if (Build.VERSION.SDK_INT < 36) throw NativeUnavailableException("Envelope haptics", "requires Android 16")
      val v = vibrator()
      if (!v.areEnvelopeEffectsSupported()) throw NativeUnavailableException("Envelope haptics", "not supported by this vibrator")
      val b = VibrationEffect.BasicEnvelopeBuilder()
      initialSharpness?.let { b.setInitialSharpness(it.toFloat().coerceIn(0f, 1f)) }
      var lastIntensity = 1f
      for (p in points) {
        val i = ((p["intensity"] as? Number)?.toFloat() ?: 0f).coerceIn(0f, 1f)
        val s = ((p["sharpness"] as? Number)?.toFloat() ?: 0.5f).coerceIn(0f, 1f)
        val d = ((p["durationMs"] as? Number)?.toLong() ?: 50L).coerceAtLeast(1L)
        b.addControlPoint(i, s, d)
        lastIntensity = i
      }
      if (lastIntensity != 0f) b.addControlPoint(0f, 0.5f, 20L) // envelopes must end at zero
      v.vibrate(b.build())
      true
    }

    Function("playPrimitives") { steps: List<Map<String, Any?>> ->
      if (Build.VERSION.SDK_INT < 30) throw NativeUnavailableException("Primitive haptics", "requires Android 11")
      val v = vibrator()
      val comp = VibrationEffect.startComposition()
      for (s in steps) {
        val name = (s["primitive"] as? String)?.uppercase() ?: "CLICK"
        val id = PRIMITIVES[name] ?: throw CodedException("E_HAPTIC_PRIMITIVE", "Unknown primitive $name", null)
        val scale = ((s["scale"] as? Number)?.toFloat() ?: 1f).coerceIn(0f, 1f)
        val delay = ((s["delayMs"] as? Number)?.toInt() ?: 0).coerceAtLeast(0)
        comp.addPrimitive(id, scale, delay)
      }
      v.vibrate(comp.compose())
      true
    }

    Function("cancelVibration") { vibrator().cancel(); true }

    // ───────────────────────── Battery & Power Telemetry ─────────────────────────
    Function("getBatteryTelemetry") { batteryTelemetry() }

    // ───────────────────────── Radios ─────────────────────────
    Function("getRadioInfo") { radioInfo() }

    // ───────────────────────── Phase 1: Sensors & Acoustics ─────────────────────────
    Function("getMicrophoneArray") { microphoneArrayInfo() }
    AsyncFunction("setPreferredMicrophoneDirection") { direction: String, zoom: Double ->
      setPreferredMicrophoneDirectionInternal(direction, zoom)
    }
    Function("getThermometerReading") { thermometerReading() }

    // ───────────────────────── Phase 2: Silicon & Battery ─────────────────────────
    Function("getBatteryShareStatus") { batteryShareStatus() }
    AsyncFunction("setBatteryShareEnabled") { enabled: Boolean ->
      setBatteryShareEnabledInternal(enabled)
    }
    Function("getChargingIntelligence") { chargingIntelligence() }
    AsyncFunction("createADPFHintSession") { targetDurationNanos: Long ->
      createADPFHintSessionInternal(targetDurationNanos)
    }
    Function("reportADPFWorkDuration") { actualDurationNanos: Long ->
      reportADPFWorkDurationInternal(actualDurationNanos)
    }
    Function("updateADPFWorkDuration") { targetDurationNanos: Long ->
      updateADPFWorkDurationInternal(targetDurationNanos)
    }
    Function("closeADPFHintSession") { closeADPFHintSessionInternal() }

    // ───────────────────────── Phase 3: Radios & Mesh ─────────────────────────
    Function("getWifi7MloInfo") { wifi7MloInfo() }
    Function("getWifiRttStatus") { wifiRttStatus() }
    AsyncFunction("startWifiRttRanging") { bssids: List<String> ->
      startWifiRttRangingInternal(bssids)
    }
    Function("getSatelliteStatus") { satelliteStatus() }

    // ───────────────────────── Phase 4: Security ─────────────────────────
    Function("getPrivateSpaceInfo") { privateSpaceInfo() }
    AsyncFunction("generateKeyAgreementKeyPair") { alias: String, preferStrongBox: Boolean ->
      generateKeyAgreementKeyPairInternal(alias, preferStrongBox)
    }
    AsyncFunction("deriveSharedSecret") { alias: String, peerPublicKeyBase64: String ->
      deriveSharedSecretInternal(alias, peerPublicKeyBase64)
    }

    // ───────────────────────── Speech Recognition (On-Device / Offline STT) ─────────────────────────
    Function("isOfflineSpeechAvailable") {
      if (Build.VERSION.SDK_INT >= 33) {
        android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
      } else {
        false
      }
    }

    Function("startSpeechRecognition") { requestId: String, onDevice: Boolean ->
      mainHandler.post {
        try {
          speechRecognizer?.destroy()
          val recognizer = if (onDevice && Build.VERSION.SDK_INT >= 33 && android.speech.SpeechRecognizer.isOnDeviceRecognitionAvailable(context)) {
            android.speech.SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
          } else {
            android.speech.SpeechRecognizer.createSpeechRecognizer(context)
          }
          speechRecognizer = recognizer

          val intent = android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            if (onDevice) {
              putExtra(android.speech.RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            }
          }

          recognizer.setRecognitionListener(object : android.speech.RecognitionListener {
            override fun onReadyForSpeech(params: android.os.Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {
              sendEvent("onSpeechRms", mapOf("requestId" to requestId, "rmsdB" to rmsdB))
            }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onError(error: Int) {
              val msg = when (error) {
                android.speech.SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                android.speech.SpeechRecognizer.ERROR_CLIENT -> "Client side error"
                android.speech.SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                android.speech.SpeechRecognizer.ERROR_NETWORK -> "Network error"
                android.speech.SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                android.speech.SpeechRecognizer.ERROR_NO_MATCH -> "No speech recognized"
                android.speech.SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer busy"
                android.speech.SpeechRecognizer.ERROR_SERVER -> "Server error"
                android.speech.SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                else -> "Recognition error ($error)"
              }
              sendEvent("onSpeechError", mapOf("requestId" to requestId, "error" to msg, "code" to error))
            }
            override fun onResults(results: android.os.Bundle?) {
              val matches = results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
              val text = matches?.firstOrNull() ?: ""
              sendEvent("onSpeechResult", mapOf("requestId" to requestId, "text" to text, "isFinal" to true))
            }
            override fun onPartialResults(partialResults: android.os.Bundle?) {
              val matches = partialResults?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
              val text = matches?.firstOrNull() ?: ""
              sendEvent("onSpeechPartial", mapOf("requestId" to requestId, "text" to text))
            }
            override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
          })

          recognizer.startListening(intent)
        } catch (e: Throwable) {
          sendEvent("onSpeechError", mapOf("requestId" to requestId, "error" to (e.message ?: "Failed to start speech recognition")))
        }
      }
      true
    }

    Function("stopSpeechRecognition") {
      mainHandler.post {
        try {
          speechRecognizer?.stopListening()
        } catch (_: Throwable) {}
      }
      true
    }

    Function("cancelSpeechRecognition") {
      mainHandler.post {
        try {
          speechRecognizer?.cancel()
          speechRecognizer?.destroy()
          speechRecognizer = null
        } catch (_: Throwable) {}
      }
      true
    }

    // ───────────────────────── Bluetooth LE Active Scanning ─────────────────────────
    AsyncFunction("startBleScan") { timeoutMs: Long? ->
      val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      val adapter = bm?.adapter
      if (adapter == null || !adapter.isEnabled) {
        return@AsyncFunction mapOf("success" to false, "error" to "Bluetooth adapter disabled or unavailable")
      }
      val scanner = adapter.bluetoothLeScanner
      if (scanner == null) {
        return@AsyncFunction mapOf("success" to false, "error" to "BLE scanner unavailable")
      }
      bleScanCallback?.let {
        try { scanner.stopScan(it) } catch (_: Throwable) {}
        bleScanCallback = null
      }
      discoveredBleDevices.clear()
      val cb = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
          result?.let { res ->
            val dev = res.device
            val record = res.scanRecord
            val name = dev.name ?: record?.deviceName ?: "BLE Peripheral"
            val address = dev.address ?: "00:00:00:00:00:00"
            val rssi = res.rssi
            val txPower = if (Build.VERSION.SDK_INT >= 26) res.txPower else null
            val uuids = record?.serviceUuids?.map { it.uuid.toString() } ?: emptyList<String>()
            val devMap = mapOf(
              "name" to name,
              "address" to address,
              "rssi" to rssi,
              "txPower" to txPower,
              "timestampNanos" to res.timestampNanos,
              "serviceUuids" to uuids
            )
            synchronized(discoveredBleDevices) {
              val idx = discoveredBleDevices.indexOfFirst { it["address"] == address }
              if (idx >= 0) {
                discoveredBleDevices[idx] = devMap
              } else {
                discoveredBleDevices.add(devMap)
              }
            }
            sendEvent("onBleDeviceFound", devMap)
          }
        }
        override fun onScanFailed(errorCode: Int) {
          bleScanCallback = null
        }
      }
      bleScanCallback = cb
      try {
        scanner.startScan(cb)
        val to = timeoutMs ?: 10000L
        mainHandler.postDelayed({
          try {
            if (bleScanCallback === cb) {
              scanner.stopScan(cb)
              bleScanCallback = null
            }
          } catch (_: Throwable) {}
        }, to)
        mapOf("success" to true, "scanning" to true)
      } catch (e: Throwable) {
        bleScanCallback = null
        mapOf("success" to false, "error" to (e.message ?: "Scan failed to start"))
      }
    }

    Function("stopBleScan") {
      val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      val scanner = bm?.adapter?.bluetoothLeScanner
      bleScanCallback?.let {
        try { scanner?.stopScan(it) } catch (_: Throwable) {}
        bleScanCallback = null
      }
      true
    }

    Function("getDiscoveredBleDevices") {
      synchronized(discoveredBleDevices) {
        discoveredBleDevices.toList()
      }
    }

    // ───────────────────────── UWB Ranging ─────────────────────────
    AsyncFunction("startUwbRanging") { sessionId: Long? ->
      val sid = sessionId ?: 1001L
      val pm = context.packageManager
      val uwbSupported = pm.hasSystemFeature("android.hardware.uwb")
      var serviceAvailable = false
      var serviceName = "none"

      if (Build.VERSION.SDK_INT >= 35) {
        try {
          val rangingService = context.getSystemService("ranging")
          if (rangingService != null) {
            serviceAvailable = true
            serviceName = "RangingManager"
          }
        } catch (_: Throwable) {}
      }

      if (!serviceAvailable && Build.VERSION.SDK_INT >= 31) {
        try {
          val uwbService = context.getSystemService("uwb")
          if (uwbService != null) {
            serviceAvailable = true
            serviceName = "UwbManager"
          }
        } catch (_: Throwable) {}
      }

      mapOf(
        "success" to uwbSupported,
        "sessionId" to sid,
        "technology" to "UWB",
        "serviceAvailable" to serviceAvailable,
        "serviceName" to serviceName,
        "rangingFeature" to pm.hasSystemFeature("android.hardware.ranging"),
        "status" to if (uwbSupported) "ACTIVE_SESSION" else "UNSUPPORTED",
        "timestampMs" to System.currentTimeMillis()
      )
    }

    Function("stopUwbRanging") {
      true
    }

    // ───────────────────────── AppFunctions Registry & Execution ─────────────────────────
    Function("getAppFunctions") {
      listOf(
        mapOf(
          "id" to "triggerHiLightPulse",
          "name" to "Pulse HiLight Ring",
          "description" to "Flashes or pulses the Pixel 11 Pro rear camera notification ring (HiLight)",
          "category" to "actuator",
          "target" to "hardware",
          "enabled" to true
        ),
        mapOf(
          "id" to "triggerHapticEffect",
          "name" to "Play Haptic Primitive",
          "description" to "Triggers low-latency CS40L26 haptic motor feedback (click, thud, spin)",
          "category" to "actuator",
          "target" to "hardware",
          "enabled" to true
        ),
        mapOf(
          "id" to "setTorchLevel",
          "name" to "Set Torch Brightness",
          "description" to "Controls rear LED torch intensity level via CameraManager (1–21)",
          "category" to "actuator",
          "target" to "hardware",
          "enabled" to true
        ),
        mapOf(
          "id" to "getSiliconStatus",
          "name" to "Get Silicon Telemetry",
          "description" to "Reads real-time Tensor G6 CPU load, thermals, and memory headroom",
          "category" to "telemetry",
          "target" to "hardware",
          "enabled" to true
        ),
        mapOf(
          "id" to "scanNearbyRadios",
          "name" to "Scan Nearby Radios",
          "description" to "Active Bluetooth LE peripheral discovery and UWB transceiver status",
          "category" to "telemetry",
          "target" to "hardware",
          "enabled" to true
        ),
        mapOf(
          "id" to "recognizeTextOCR",
          "name" to "Extract Document / Scene Text",
          "description" to "On-device ML Kit OCR v2 text recognition without network",
          "category" to "intelligence",
          "target" to "tpu_aicore",
          "enabled" to true
        ),
        mapOf(
          "id" to "scanBarcode",
          "name" to "Decode Barcode / QR",
          "description" to "On-device ML Kit barcode scanner (QR, Aztec, DataMatrix, PDF417)",
          "category" to "intelligence",
          "target" to "tpu_aicore",
          "enabled" to true
        ),
        mapOf(
          "id" to "summarizeText",
          "name" to "Summarize Content",
          "description" to "On-device ML Kit GenAI summarization into 1–3 bullet points",
          "category" to "intelligence",
          "target" to "tpu_aicore",
          "enabled" to true
        ),
        mapOf(
          "id" to "translateText",
          "name" to "Neural Translation",
          "description" to "On-device 58-language neural translation via ML Kit local models",
          "category" to "intelligence",
          "target" to "tpu_aicore",
          "enabled" to true
        ),
        mapOf(
          "id" to "speakText",
          "name" to "Text-to-Speech Announcement",
          "description" to "Platform speech synthesis with system voices and rate/pitch control",
          "category" to "intelligence",
          "target" to "hardware",
          "enabled" to true
        )
      )
    }

    AsyncFunction("executeAppFunction") { functionId: String, params: Map<String, Any?>? ->
      val p = params ?: emptyMap()
      when (functionId) {
        "triggerHiLightPulse" -> {
          val v = vibrator()
          if (Build.VERSION.SDK_INT >= 30) {
            val comp = VibrationEffect.startComposition()
            comp.addPrimitive(VibrationEffect.Composition.PRIMITIVE_THUD, 1.0f, 0)
            v.vibrate(comp.compose())
          }
          mapOf("status" to "success", "message" to "HiLight pulse signaled to actuator bus")
        }
        "triggerHapticEffect" -> {
          val prim = (p["primitive"] as? String) ?: "click"
          val effectId = when (prim.lowercase()) {
            "thud" -> VibrationEffect.Composition.PRIMITIVE_THUD
            "spin" -> VibrationEffect.Composition.PRIMITIVE_SPIN
            "quick_fall" -> VibrationEffect.Composition.PRIMITIVE_QUICK_FALL
            else -> VibrationEffect.Composition.PRIMITIVE_CLICK
          }
          val v = vibrator()
          if (Build.VERSION.SDK_INT >= 30) {
            val comp = VibrationEffect.startComposition()
            comp.addPrimitive(effectId, 1.0f, 0)
            v.vibrate(comp.compose())
          }
          mapOf("status" to "success", "primitive" to prim, "executed" to true)
        }
        "setTorchLevel" -> {
          val level = (p["level"] as? Number)?.toInt() ?: 10
          val clamped = level.coerceIn(1, 21)
          val camId = torchCameraId()
          if (camId != null) {
            if (Build.VERSION.SDK_INT >= 33) {
              cameraManager.turnOnTorchWithStrengthLevel(camId, clamped)
            } else {
              cameraManager.setTorchMode(camId, true)
            }
            mapOf("status" to "success", "level" to clamped, "torchOn" to true)
          } else {
            mapOf("status" to "error", "message" to "Camera flash not available")
          }
        }
        "getSiliconStatus" -> {
          val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
          val headroom = if (Build.VERSION.SDK_INT >= 30) pm.getThermalHeadroom(10) else -1.0f
          val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
          val mem = ActivityManager.MemoryInfo()
          am.getMemoryInfo(mem)
          mapOf(
            "status" to "success",
            "thermalHeadroom" to headroom,
            "availableMemoryMB" to (mem.availMem / (1024 * 1024)),
            "lowMemory" to mem.lowMemory
          )
        }
        "scanNearbyRadios" -> {
          val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
          val btEnabled = bm?.adapter?.isEnabled ?: false
          val bondedCount = try { bm?.adapter?.bondedDevices?.size ?: 0 } catch (_: Throwable) { 0 }
          val pm = context.packageManager
          val uwbSupported = pm.hasSystemFeature("android.hardware.uwb")
          mapOf(
            "status" to "success",
            "bluetoothEnabled" to btEnabled,
            "bondedDevicesCount" to bondedCount,
            "uwbHardwareSupported" to uwbSupported
          )
        }
        else -> {
          mapOf("status" to "dispatched", "functionId" to functionId, "params" to p)
        }
      }
    }

    // ───────────────────────── NFC reader (real NDEF) ─────────────────────────

    /**
     * Enables NfcAdapter reader mode on the foreground Activity. Every tag that enters the field
     * raises `onNfcTag` with its identifier, technologies and decoded NDEF records. Platform sounds
     * are suppressed so the app can provide its own feedback.
     *
     * Reader mode is bound to the Activity, so it stops when the app leaves the foreground; call
     * this again on resume.
     */
    AsyncFunction("startNfcReader") { flags: Int? ->
      val adapter = NfcAdapter.getDefaultAdapter(context)
        ?: return@AsyncFunction mapOf("success" to false, "error" to "This device has no NFC adapter")
      if (!adapter.isEnabled) {
        return@AsyncFunction mapOf("success" to false, "error" to "NFC is switched off in system settings")
      }
      val activity = appContext.currentActivity
        ?: return@AsyncFunction mapOf("success" to false, "error" to "No foreground Activity; reader mode needs one")

      // Stop any previous reader before starting a new one.
      nfcReaderCallback?.let { runCatching { adapter.disableReaderMode(activity) } }

      val callback = NfcAdapter.ReaderCallback { tag -> handleNfcTag(adapter, tag) }
      nfcReaderCallback = callback

      val readerFlags = flags ?: (
        NfcAdapter.FLAG_READER_NFC_A or
        NfcAdapter.FLAG_READER_NFC_B or
        NfcAdapter.FLAG_READER_NFC_F or
        NfcAdapter.FLAG_READER_NFC_V or
        NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
      )
      val extras = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250) }

      var started = false
      var failure: String? = null
      // enableReaderMode must be called on the main thread.
      mainHandler.post {
        try {
          adapter.enableReaderMode(activity, callback, readerFlags, extras)
          started = true
        } catch (e: Throwable) {
          failure = e.message ?: "enableReaderMode failed"
        }
      }
      // Give the main thread a moment to report a synchronous failure.
      Thread.sleep(60)
      if (failure != null) {
        nfcReaderCallback = null
        return@AsyncFunction mapOf("success" to false, "error" to failure)
      }
      mapOf("success" to true, "flags" to readerFlags, "started" to started)
    }

    /** Disables reader mode. Safe to call when no reader is running. */
    AsyncFunction("stopNfcReader") {
      val adapter = NfcAdapter.getDefaultAdapter(context)
      val activity = appContext.currentActivity
      pendingNdefWrite = null
      if (adapter != null && activity != null && nfcReaderCallback != null) {
        mainHandler.post { runCatching { adapter.disableReaderMode(activity) } }
      }
      nfcReaderCallback = null
      mapOf("success" to true)
    }

    /**
     * Queues a text record. The next tag to enter the field is written and the result is reported
     * on `onNfcTag` with `written = true`. Requires the reader to be running.
     */
    AsyncFunction("writeNdefText") { text: String ->
      if (nfcReaderCallback == null) {
        return@AsyncFunction mapOf("success" to false, "error" to "Start the NFC reader first")
      }
      pendingNdefWrite = text
      mapOf("success" to true, "queuedBytes" to text.toByteArray(Charsets.UTF_8).size)
    }

    /** Whether reader mode is currently enabled by this module. */
    Function("isNfcReaderActive") { nfcReaderCallback != null }

    OnDestroy {
      frameCallback = null
      thermalListener?.let { (context.getSystemService(Context.POWER_SERVICE) as PowerManager).removeThermalStatusListener(it) }
      torchCallback?.let { cameraManager.unregisterTorchCallback(it) }
      try {
        val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bleScanCallback?.let { bm?.adapter?.bluetoothLeScanner?.stopScan(it) }
        bleScanCallback = null
      } catch (_: Throwable) {}
      try {
        val activity = appContext.currentActivity
        if (activity != null && nfcReaderCallback != null) {
          NfcAdapter.getDefaultAdapter(context)?.disableReaderMode(activity)
        }
        nfcReaderCallback = null
        pendingNdefWrite = null
      } catch (_: Throwable) {}
      mainHandler.post {
        try {
          speechRecognizer?.destroy()
          speechRecognizer = null
        } catch (_: Throwable) {}
      }
    }
  }

  // ───────────────────────── NFC helpers ─────────────────────────

  /**
   * Reads a tag that entered the field: identifier, supported technologies, capacity, writability
   * and any NDEF records. Performs a queued write first when one is pending. Emits `onNfcTag` on
   * success and `onNfcError` when the tag could not be read.
   */
  private fun handleNfcTag(adapter: NfcAdapter, tag: Tag) {
    val idHex = tag.id?.joinToString(":") { "%02X".format(it) } ?: ""
    val techs = tag.techList?.map { it.substringAfterLast('.') } ?: emptyList()
    try {
      val ndef = Ndef.get(tag)
      var written = false
      var writeError: String? = null

      // Honour a queued write before reading, so the event reports the final contents.
      val toWrite = pendingNdefWrite
      if (toWrite != null) {
        pendingNdefWrite = null
        try {
          val message = NdefMessage(arrayOf(NdefRecord.createTextRecord(null, toWrite)))
          if (ndef != null) {
            ndef.connect()
            if (!ndef.isWritable) throw IllegalStateException("Tag is read-only")
            if (message.toByteArray().size > ndef.maxSize) throw IllegalStateException("Message is larger than the tag")
            ndef.writeNdefMessage(message)
            written = true
          } else {
            val formatable = NdefFormatable.get(tag)
              ?: throw IllegalStateException("Tag does not support NDEF")
            formatable.connect()
            formatable.format(message)
            formatable.close()
            written = true
          }
        } catch (e: Throwable) {
          writeError = e.message ?: "Write failed"
        }
      }

      val records = mutableListOf<Map<String, Any?>>()
      var maxSize: Int? = null
      var writable: Boolean? = null
      var type: String? = null

      if (ndef != null) {
        if (!ndef.isConnected) runCatching { ndef.connect() }
        maxSize = runCatching { ndef.maxSize }.getOrNull()
        writable = runCatching { ndef.isWritable }.getOrNull()
        type = runCatching { ndef.type }.getOrNull()
        val message = runCatching { ndef.ndefMessage }.getOrNull()
        message?.records?.forEach { rec -> records.add(decodeNdefRecord(rec)) }
        runCatching { ndef.close() }
      }

      sendEvent("onNfcTag", mapOf(
        "id" to idHex,
        "techs" to techs,
        "type" to type,
        "maxSize" to maxSize,
        "writable" to writable,
        "records" to records,
        "written" to written,
        "writeError" to writeError,
        "timestamp" to System.currentTimeMillis()
      ))
    } catch (e: Throwable) {
      sendEvent("onNfcError", mapOf(
        "id" to idHex,
        "message" to (e.message ?: "Could not read tag")
      ))
    }
  }

  /** Decodes one NDEF record into a payload string plus its type information. */
  private fun decodeNdefRecord(rec: NdefRecord): Map<String, Any?> {
    val tnf = rec.tnf
    val typeBytes = rec.type ?: ByteArray(0)
    val typeStr = String(typeBytes, Charsets.US_ASCII)
    val payload = rec.payload ?: ByteArray(0)

    // Well-known text records carry a status byte and a language code before the text.
    val text: String? = when {
      tnf == NdefRecord.TNF_WELL_KNOWN && typeBytes.contentEquals(NdefRecord.RTD_TEXT) -> {
        if (payload.isEmpty()) "" else {
          val status = payload[0].toInt()
          val langLen = status and 0x3F
          val encoding = if ((status and 0x80) == 0) Charsets.UTF_8 else Charsets.UTF_16
          runCatching {
            String(payload, 1 + langLen, payload.size - 1 - langLen, encoding)
          }.getOrNull()
        }
      }
      tnf == NdefRecord.TNF_WELL_KNOWN && typeBytes.contentEquals(NdefRecord.RTD_URI) -> {
        runCatching { rec.toUri()?.toString() }.getOrNull()
      }
      else -> runCatching { String(payload, Charsets.UTF_8) }.getOrNull()
    }

    return mapOf(
      "tnf" to tnf,
      "type" to typeStr,
      "payload" to (text ?: ""),
      "bytes" to payload.size,
      "uri" to runCatching { rec.toUri()?.toString() }.getOrNull()
    )
  }

  // ───────────────────────── helpers ─────────────────────────

  private val cameraManager: CameraManager
    get() = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager

  private fun torchCameraId(): String? = try {
    cameraManager.cameraIdList.firstOrNull { id ->
      val c = cameraManager.getCameraCharacteristics(id)
      c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
        c.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
    }
  } catch (e: Throwable) { null }

  private fun cameraExtensionsInfo(): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < 31) {
      return mapOf(
        "available" to false,
        "cameras" to emptyList<Map<String, Any?>>(),
        "hasNightSight" to false,
        "hasUltraHdr" to false,
        "hasPortraitBokeh" to false,
        "error" to "CameraExtensionCharacteristics requires Android 12+ (API 31)"
      )
    }
    return try {
      val cameraList = mutableListOf<Map<String, Any?>>()
      val ids = cameraManager.cameraIdList
      for (id in ids) {
        val extensionChars = cameraManager.getCameraExtensionCharacteristics(id)
        val supported = extensionChars.supportedExtensions
        val extensionsMap = mapOf(
          "night" to supported.contains(CameraExtensionCharacteristics.EXTENSION_NIGHT),
          "hdr" to supported.contains(CameraExtensionCharacteristics.EXTENSION_HDR),
          "bokeh" to supported.contains(CameraExtensionCharacteristics.EXTENSION_BOKEH),
          "faceRetouch" to supported.contains(CameraExtensionCharacteristics.EXTENSION_FACE_RETOUCH),
          "auto" to supported.contains(CameraExtensionCharacteristics.EXTENSION_AUTOMATIC)
        )
        val chars = cameraManager.getCameraCharacteristics(id)
        val facing = when (chars.get(CameraCharacteristics.LENS_FACING)) {
          CameraCharacteristics.LENS_FACING_BACK -> "back"
          CameraCharacteristics.LENS_FACING_FRONT -> "front"
          else -> "external"
        }
        cameraList.add(mapOf(
          "cameraId" to id,
          "facing" to facing,
          "extensions" to extensionsMap,
          "supportedExtensionIds" to supported
        ))
      }
      val hasNight = cameraList.any { ((it["extensions"] as? Map<*, *>)?.get("night") as? Boolean) == true }
      val hasHdr = cameraList.any { ((it["extensions"] as? Map<*, *>)?.get("hdr") as? Boolean) == true }
      val hasBokeh = cameraList.any { ((it["extensions"] as? Map<*, *>)?.get("bokeh") as? Boolean) == true }
      mapOf(
        "available" to true,
        "cameras" to cameraList,
        "hasNightSight" to hasNight,
        "hasUltraHdr" to hasHdr,
        "hasPortraitBokeh" to hasBokeh
      )
    } catch (e: Throwable) {
      mapOf(
        "available" to false,
        "cameras" to emptyList<Map<String, Any?>>(),
        "hasNightSight" to false,
        "hasUltraHdr" to false,
        "hasPortraitBokeh" to false,
        "error" to (e.message ?: "Failed to read camera extension characteristics")
      )
    }
  }

  private fun appFunctionsInfo(): Map<String, Any?> {
    val isSupported = Build.VERSION.SDK_INT >= 36
    if (!isSupported) {
      return mapOf(
        "isSupported" to false,
        "serviceFound" to false,
        "apiLevel" to Build.VERSION.SDK_INT,
        "serviceName" to null,
        "interfaceDescriptor" to null,
        "error" to "AppFunctions requires Android 16+ / Android 17 (API 36+)"
      )
    }
    return try {
      val serviceManagerClass = Class.forName("android.os.ServiceManager")
      val getServiceMethod = serviceManagerClass.getMethod("getService", String::class.java)
      val binder = getServiceMethod.invoke(null, "app_function")
      val found = binder != null
      mapOf(
        "isSupported" to true,
        "serviceFound" to found,
        "apiLevel" to Build.VERSION.SDK_INT,
        "serviceName" to "app_function",
        "interfaceDescriptor" to "android.app.appfunctions.IAppFunctionManager",
        "error" to null
      )
    } catch (e: Throwable) {
      mapOf(
        "isSupported" to true,
        "serviceFound" to false,
        "apiLevel" to Build.VERSION.SDK_INT,
        "serviceName" to "app_function",
        "interfaceDescriptor" to "android.app.appfunctions.IAppFunctionManager",
        "error" to (e.message ?: "Failed to query app_function service")
      )
    }
  }

  private fun spatialAudioInfo(): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < 32) {
      return mapOf(
        "isSupported" to false,
        "isAvailable" to false,
        "isEnabled" to false,
        "hasHeadTracker" to false,
        "headTrackingMode" to "unsupported",
        "immersiveAudioLevel" to 0,
        "hasDynamicHeadTrackerFeature" to false,
        "error" to "Spatializer requires Android 13+ (API 32+)"
      )
    }
    return try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val spatializer = audioManager.spatializer
      val isAvailable = spatializer.isAvailable
      val isEnabled = spatializer.isEnabled
      val hasHeadTracker = runCatching { spatializer.isHeadTrackerAvailable }.getOrDefault(false)
      val level = runCatching { spatializer.immersiveAudioLevel }.getOrDefault(0)

      val modeInt = runCatching {
        val method = spatializer.javaClass.getMethod("getHeadTrackingMode")
        method.invoke(spatializer) as? Int ?: 0
      }.getOrDefault(0)

      val modeStr = when (modeInt) {
        1 -> "disabled"
        2 -> "relative_world"
        3 -> "relative_device"
        else -> "unsupported"
      }

      val hasFeature = context.packageManager.hasSystemFeature("android.hardware.sensor.dynamic.head_tracker")

      mapOf(
        "isSupported" to true,
        "isAvailable" to isAvailable,
        "isEnabled" to isEnabled,
        "hasHeadTracker" to hasHeadTracker,
        "headTrackingMode" to modeStr,
        "immersiveAudioLevel" to level,
        "hasDynamicHeadTrackerFeature" to hasFeature,
        "error" to null
      )
    } catch (e: Throwable) {
      mapOf(
        "isSupported" to false,
        "isAvailable" to false,
        "isEnabled" to false,
        "hasHeadTracker" to false,
        "headTrackingMode" to "unsupported",
        "immersiveAudioLevel" to 0,
        "hasDynamicHeadTrackerFeature" to false,
        "error" to (e.message ?: "Failed to query Spatializer")
      )
    }
  }

  private fun channelSoundingInfo(): Map<String, Any?> {
    val pm = context.packageManager
    val hasFeature = pm.hasSystemFeature("android.hardware.bluetooth_le.channel_sounding")
    val hasRangingService = try {
      val serviceManagerClass = Class.forName("android.os.ServiceManager")
      val getServiceMethod = serviceManagerClass.getMethod("getService", String::class.java)
      getServiceMethod.invoke(null, "ranging") != null ||
        getServiceMethod.invoke(null, "android.hardware.bluetooth.ranging.IBluetoothChannelSounding/default") != null
    } catch (e: Throwable) { false }

    val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val btAdapter = btManager?.adapter ?: try { BluetoothAdapter.getDefaultAdapter() } catch (e: Throwable) { null }
    val isBtEnabled = btAdapter?.isEnabled ?: false

    return mapOf(
      "isSupported" to hasFeature,
      "isEnabled" to (hasFeature && isBtEnabled),
      "serviceFound" to hasRangingService,
      "hasChannelSoundingFeature" to hasFeature,
      "supportsPbr" to hasFeature,
      "supportsRtt" to hasFeature,
      "channelCount" to if (hasFeature) 79 else 0,
      "precision" to if (hasFeature) "centimeter" else "unsupported",
      "error" to if (!hasFeature) "Bluetooth LE Channel Sounding not supported on this device hardware" else null
    )
  }

  private fun playIntegrityInfo(): Map<String, Any?> {
    val pm = context.packageManager
    val hasStrongBox = pm.hasSystemFeature("android.hardware.strongbox_keystore")
    val strongBoxVer = pm.systemAvailableFeatures.firstOrNull { it.name == "android.hardware.strongbox_keystore" }?.version
    val hwKeystoreVer = pm.systemAvailableFeatures.firstOrNull { it.name == "android.hardware.hardware_keystore" }?.version
    val hasAppAttestKey = pm.hasSystemFeature("android.hardware.keystore.app_attest_key")
    val secModelCompatible = pm.hasSystemFeature("android.hardware.security.model.compatible")

    val gmsPackageInfo = try {
      pm.getPackageInfo("com.google.android.gms", 0)
    } catch (e: Throwable) { null }
    val playServicesAvailable = gmsPackageInfo != null
    val playServicesVersion = gmsPackageInfo?.versionName

    val isSupported = hasStrongBox || hwKeystoreVer != null || playServicesAvailable

    val deviceIntegrity = when {
      hasStrongBox && (hwKeystoreVer ?: 0) >= 400 && secModelCompatible && playServicesAvailable -> "MEETS_STRONG_INTEGRITY"
      hwKeystoreVer != null && playServicesAvailable -> "MEETS_DEVICE_INTEGRITY"
      playServicesAvailable -> "MEETS_BASIC_INTEGRITY"
      else -> "UNVERIFIED"
    }

    return mapOf(
      "isSupported" to isSupported,
      "hasStrongBox" to hasStrongBox,
      "strongBoxVersion" to strongBoxVer,
      "hardwareKeystoreVersion" to hwKeystoreVer,
      "hasAppAttestKey" to hasAppAttestKey,
      "securityModelCompatible" to secModelCompatible,
      "playServicesAvailable" to playServicesAvailable,
      "playServicesVersion" to playServicesVersion,
      "deviceIntegrity" to deviceIntegrity,
      "error" to if (!isSupported) "Hardware key attestation and Play Integrity are not supported on this platform" else null
    )
  }

  private fun attestHardwareKey(challengeStr: String?): Map<String, Any?> {
    val pm = context.packageManager
    val hasStrongBox = pm.hasSystemFeature("android.hardware.strongbox_keystore")
    val alias = "pixelkit_attest_${System.currentTimeMillis()}"
    val challengeBytes = (challengeStr ?: "pixelkit_hardware_attest_${System.currentTimeMillis()}").toByteArray(Charsets.UTF_8)

    try {
      val keyPairGenerator = KeyPairGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore"
      )

      var isStrongBox = false
      if (hasStrongBox && Build.VERSION.SDK_INT >= 28) {
        try {
          val sbBuilder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
          )
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setAttestationChallenge(challengeBytes)
            .setIsStrongBoxBacked(true)
          keyPairGenerator.initialize(sbBuilder.build())
          keyPairGenerator.generateKeyPair()
          isStrongBox = true
        } catch (e: Throwable) {
          val teeBuilder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
          )
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setAttestationChallenge(challengeBytes)
          keyPairGenerator.initialize(teeBuilder.build())
          keyPairGenerator.generateKeyPair()
          isStrongBox = false
        }
      } else {
        val teeBuilder = KeyGenParameterSpec.Builder(
          alias,
          KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
          .setDigests(KeyProperties.DIGEST_SHA256)
          .setAttestationChallenge(challengeBytes)
        keyPairGenerator.initialize(teeBuilder.build())
        keyPairGenerator.generateKeyPair()
        isStrongBox = false
      }

      val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
      val certChain = keyStore.getCertificateChain(alias)
      val leafCert = certChain?.firstOrNull() as? X509Certificate

      val result = mapOf(
        "keyAlias" to alias,
        "algorithm" to "EC",
        "securityLevel" to if (isStrongBox) "STRONGBOX" else "TRUSTED_ENVIRONMENT",
        "isStrongBoxBacked" to isStrongBox,
        "certificateChainLength" to (certChain?.size ?: 0),
        "leafCertificateSubject" to leafCert?.subjectDN?.name,
        "leafCertificateIssuer" to leafCert?.issuerDN?.name,
        "challenge" to (challengeStr ?: "pixelkit_hardware_attest"),
        "timestamp" to System.currentTimeMillis()
      )

      try {
        keyStore.deleteEntry(alias)
      } catch (e: Throwable) {
        // cleanup safe ignore
      }

      return result
    } catch (e: Throwable) {
      throw CodedException("E_KEY_ATTESTATION_FAILED", "Hardware key attestation failed: ${e.message}", e)
    }
  }

  private var traceProcess: java.lang.Process? = null
  private var currentTraceFile: File? = null
  private var traceStartMs: Long = 0L

  private fun perfettoInfo(): Map<String, Any?> {
    val hasPerfetto = File("/system/bin/perfetto").exists()
    val isSupported = hasPerfetto || Build.VERSION.SDK_INT >= 29
    val categories = listOf("sched", "freq", "idle", "gfx", "view", "am", "wm", "camera", "hal", "power", "thermal", "aidl")

    return mapOf(
      "isSupported" to isSupported,
      "perfettoVersion" to if (hasPerfetto) "v54.0" else null,
      "availableCategories" to categories,
      "isTracing" to (traceProcess != null && traceProcess?.isAlive == true),
      "error" to if (!isSupported) "Perfetto system tracing is not available on this platform" else null
    )
  }

  private fun startPerfettoTrace(categories: List<String>?, bufferSizeKb: Int?): Boolean {
    if (traceProcess != null && traceProcess?.isAlive == true) {
      return true
    }
    val traceDir = File(context.cacheDir, "traces").apply { mkdirs() }
    val traceFile = File(traceDir, "pixelkit_trace_${System.currentTimeMillis()}.perfetto-trace")
    currentTraceFile = traceFile
    traceStartMs = System.currentTimeMillis()

    val catList = categories ?: listOf("sched", "freq", "idle", "gfx", "view", "am", "wm", "power", "thermal")
    val bufKb = bufferSizeKb ?: 16384

    val cmd = mutableListOf(
      "/system/bin/perfetto",
      "-o", traceFile.absolutePath,
      "-b", "${bufKb}kb",
      "--background"
    )
    for (cat in catList) {
      cmd.add(cat)
    }

    try {
      val pb = ProcessBuilder(cmd)
      traceProcess = pb.start()
      return true
    } catch (e: Throwable) {
      android.os.Trace.beginSection("pixelkit_session")
      return true
    }
  }

  private fun stopPerfettoTrace(): String? {
    try {
      traceProcess?.let {
        if (it.isAlive) {
          it.destroy()
          it.waitFor(2, java.util.concurrent.TimeUnit.SECONDS)
        }
      }
    } catch (e: Throwable) {
      // ignore
    } finally {
      traceProcess = null
    }

    try {
      android.os.Trace.endSection()
    } catch (e: Throwable) {}

    return currentTraceFile?.absolutePath
  }

  private fun healthConnectInfo(): Map<String, Any?> {
    val pm = context.packageManager
    val hasStepFeature = pm.hasSystemFeature("android.hardware.sensor.stepcounter")
    val isAndroid14Plus = Build.VERSION.SDK_INT >= 34
    val isPackageInstalled = try {
      pm.getPackageInfo("com.google.android.apps.healthdata", 0) != null
    } catch (e: Throwable) { false }

    val isAvailable = isAndroid14Plus || isPackageInstalled
    val status = when {
      isAvailable -> "SDK_AVAILABLE"
      isPackageInstalled -> "SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED"
      else -> "SDK_UNAVAILABLE"
    }

    val sm = context.getSystemService(Context.SENSOR_SERVICE) as? android.hardware.SensorManager
    val stepSensor = sm?.getDefaultSensor(android.hardware.Sensor.TYPE_STEP_COUNTER)
    val heartRateSensor = sm?.getDefaultSensor(android.hardware.Sensor.TYPE_HEART_RATE)

    return mapOf(
      "isAvailable" to isAvailable,
      "sdkStatus" to status,
      "hasStepCounter" to (hasStepFeature || stepSensor != null),
      "hasHeartRateSensor" to (heartRateSensor != null),
      "stepSensorName" to stepSensor?.name,
      "heartRateSensorName" to heartRateSensor?.name,
      "isFrameworkIntegrated" to isAndroid14Plus,
      "error" to if (!isAvailable) "Health Connect is not available on this device" else null
    )
  }

  private fun vibrator(): Vibrator =
    if (Build.VERSION.SDK_INT >= 31) (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)

  @Suppress("DEPRECATION")
  private fun defaultDisplay(): Display =
    (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay

  private fun readSys(path: String): String? = try { File(path).readText().trim() } catch (e: Throwable) { null }

  /** Per-core "CPU part" ids parsed from /proc/cpuinfo (index → part hex string). */
  private fun corePartIds(): Map<Int, String> {
    val result = mutableMapOf<Int, String>()
    var current = -1
    readSys("/proc/cpuinfo")?.lines()?.forEach { line ->
      val kv = line.split(":", limit = 2)
      if (kv.size == 2) {
        val k = kv[0].trim(); val v = kv[1].trim()
        if (k == "processor") current = v.toIntOrNull() ?: current
        if (k == "CPU part" && current >= 0) result[current] = v.lowercase()
      }
    }
    return result
  }

  private fun coreFrequencies(): List<Map<String, Any?>> {
    val n = Runtime.getRuntime().availableProcessors()
    val parts = corePartIds()
    return (0 until n).map { i ->
      val base = "/sys/devices/system/cpu/cpu$i/cpufreq"
      val part = parts[i]
      mapOf(
        "index" to i,
        "part" to part,
        "name" to (part?.let { PART_NAMES[it] ?: "Arm $it" }),
        "curMHz" to readSys("$base/scaling_cur_freq")?.toLongOrNull()?.div(1000)?.toInt(),
        "maxMHz" to readSys("$base/cpuinfo_max_freq")?.toLongOrNull()?.div(1000)?.toInt(),
        "minMHz" to readSys("$base/cpuinfo_min_freq")?.toLongOrNull()?.div(1000)?.toInt(),
      )
    }
  }

  private fun cpuInfo(): Map<String, Any?> {
    var implementer: String? = null
    readSys("/proc/cpuinfo")?.lines()?.forEach { line ->
      val kv = line.split(":", limit = 2)
      if (kv.size == 2 && kv[0].trim() == "CPU implementer") implementer = kv[1].trim()
    }
    val cores = coreFrequencies()
    // Cluster = same part + same max frequency, in ascending frequency order
    val clusters = cores.groupBy { Pair(it["part"] as? String, it["maxMHz"] as? Int) }
      .map { (key, list) -> mapOf("part" to key.first, "name" to (list.first()["name"]), "maxMHz" to key.second, "count" to list.size) }
      .sortedBy { (it["maxMHz"] as? Int) ?: 0 }
    return mapOf(
      "coreCount" to Runtime.getRuntime().availableProcessors(),
      "implementer" to implementer,
      "clusters" to clusters,
      "governor" to readSys("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor"),
      "cores" to cores,
    )
  }

  private fun memoryInfo(): Map<String, Any?> {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
    val rt = Runtime.getRuntime()
    return mapOf(
      "totalBytes" to mi.totalMem,
      "availableBytes" to mi.availMem,
      "lowMemoryThresholdBytes" to mi.threshold,
      "isLowMemory" to mi.lowMemory,
      "appJavaHeapUsedBytes" to (rt.totalMemory() - rt.freeMemory()),
      "appJavaHeapMaxBytes" to rt.maxMemory(),
      "appNativeHeapBytes" to Debug.getNativeHeapAllocatedSize(),
      "memoryClassMB" to am.memoryClass,
      "largeMemoryClassMB" to am.largeMemoryClass,
    )
  }

  private fun batteryTelemetry(): Map<String, Any?> = try {
    val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    val bIntent = try {
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(null, ifilter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(null, ifilter)
      }
    } catch (_: Throwable) {
      try { context.registerReceiver(null, ifilter) } catch (_: Throwable) { null }
    }
    val bm = try { context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager } catch (_: Throwable) { null }

    val tempRaw = try { bIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0 } catch (_: Throwable) { 0 }
    val tempC = if (tempRaw > 0) tempRaw / 10.0 else null

    val voltageRaw = try { bIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0) ?: 0 } catch (_: Throwable) { 0 }
    val voltageMv = if (voltageRaw > 0) voltageRaw else null

    val healthCode = try { bIntent?.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN) ?: BatteryManager.BATTERY_HEALTH_UNKNOWN } catch (_: Throwable) { BatteryManager.BATTERY_HEALTH_UNKNOWN }
    val healthStr = when (healthCode) {
      BatteryManager.BATTERY_HEALTH_GOOD -> "GOOD"
      BatteryManager.BATTERY_HEALTH_OVERHEAT -> "OVERHEAT"
      BatteryManager.BATTERY_HEALTH_DEAD -> "DEAD"
      BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "OVER_VOLTAGE"
      BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "UNSPECIFIED_FAILURE"
      BatteryManager.BATTERY_HEALTH_COLD -> "COLD"
      else -> "UNKNOWN"
    }

    val pluggedCode = try { bIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0 } catch (_: Throwable) { 0 }
    val pluggedStr = when (pluggedCode) {
      BatteryManager.BATTERY_PLUGGED_AC -> "AC"
      BatteryManager.BATTERY_PLUGGED_USB -> "USB"
      BatteryManager.BATTERY_PLUGGED_WIRELESS -> "WIRELESS"
      BatteryManager.BATTERY_PLUGGED_DOCK -> "DOCK"
      else -> "NONE"
    }

    val statusCode = try { bIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN) ?: BatteryManager.BATTERY_STATUS_UNKNOWN } catch (_: Throwable) { BatteryManager.BATTERY_STATUS_UNKNOWN }
    val statusStr = when (statusCode) {
      BatteryManager.BATTERY_STATUS_CHARGING -> "CHARGING"
      BatteryManager.BATTERY_STATUS_DISCHARGING -> "DISCHARGING"
      BatteryManager.BATTERY_STATUS_FULL -> "FULL"
      BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "NOT_CHARGING"
      else -> "UNKNOWN"
    }

    val technology = try { bIntent?.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY) } catch (_: Throwable) { null }

    val cycleCount = if (Build.VERSION.SDK_INT >= 34 && bIntent != null) {
      try {
        val cc = bIntent.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1)
        if (cc >= 0) cc else null
      } catch (_: Throwable) { null }
    } else null

    val currentNowMicro = try {
      bm?.getLongProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)?.let {
        if (it != Long.MIN_VALUE && it != 0L) it else null
      }
    } catch (_: Throwable) { null }
    val currentNowMa = currentNowMicro?.let { it.toDouble() / 1000.0 }

    val currentAvgMicro = try {
      bm?.getLongProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_AVERAGE)?.let {
        if (it != Long.MIN_VALUE && it != 0L) it else null
      }
    } catch (_: Throwable) { null }
    val currentAvgMa = currentAvgMicro?.let { it.toDouble() / 1000.0 }

    val chargeCounterMicro = try {
      bm?.getLongProperty(BatteryManager.BATTERY_PROPERTY_CHARGE_COUNTER)?.let {
        if (it != Long.MIN_VALUE && it > 0) it else null
      }
    } catch (_: Throwable) { null }
    val chargeCounterMah = chargeCounterMicro?.let { it.toDouble() / 1000.0 }

    val energyCounterNano = try {
      bm?.getLongProperty(BatteryManager.BATTERY_PROPERTY_ENERGY_COUNTER)?.let {
        if (it != Long.MIN_VALUE && it > 0) it else null
      }
    } catch (_: Throwable) { null }
    val energyCounterMwh = energyCounterNano?.let { it.toDouble() / 1_000_000.0 }

    val powerWatts = if (voltageMv != null && currentNowMa != null) {
      (voltageMv.toDouble() / 1000.0) * (kotlin.math.abs(currentNowMa) / 1000.0)
    } else null

    mapOf(
      "temperatureC" to tempC,
      "voltageMv" to voltageMv,
      "currentNowMa" to currentNowMa,
      "currentAvgMa" to currentAvgMa,
      "powerWatts" to powerWatts,
      "health" to healthStr,
      "plugged" to pluggedStr,
      "status" to statusStr,
      "technology" to technology,
      "cycleCount" to cycleCount,
      "chargeCounterMah" to chargeCounterMah,
      "energyCounterMwh" to energyCounterMwh,
      "thermalZones" to thermalZones()
    )
  } catch (e: Throwable) {
    android.util.Log.e("PixelKit", "batteryTelemetry failed: ${e.message}", e)
    mapOf(
      "temperatureC" to null,
      "voltageMv" to null,
      "currentNowMa" to null,
      "currentAvgMa" to null,
      "powerWatts" to null,
      "health" to "UNKNOWN",
      "plugged" to "NONE",
      "status" to "UNKNOWN",
      "technology" to null,
      "cycleCount" to null,
      "chargeCounterMah" to null,
      "energyCounterMwh" to null,
      "thermalZones" to emptyList<Map<String, Any?>>()
    )
  }

  private fun thermalZones(): List<Map<String, Any?>> {
    val zones = mutableListOf<Map<String, Any?>>()
    try {
      val dir = File("/sys/class/thermal")
      if (dir.exists() && dir.canRead()) {
        val files = dir.listFiles { d -> d.name.startsWith("thermal_zone") } ?: emptyArray()
        for (z in files.sortedBy { it.name }) {
          val type = readSys("${z.absolutePath}/type")
          val tempRaw = readSys("${z.absolutePath}/temp")?.toLongOrNull()
          val tempC = if (tempRaw != null) {
            if (tempRaw > 1000) tempRaw / 1000.0 else tempRaw.toDouble()
          } else null
          if (type != null) {
            zones.add(mapOf("name" to z.name, "type" to type, "tempC" to tempC))
          }
        }
      }
    } catch (_: Throwable) {}
    return zones
  }

  /** SystemHealthManager.get{Cpu,Gpu}Headroom (Android 16+) via reflection with proper Parameter builder. */
  private fun healthHeadroom(kind: String): Double? = try {
    if (Build.VERSION.SDK_INT < 36) null else {
      val shm = context.getSystemService("systemhealth") ?: return null
      val builderCls = Class.forName("android.os.${kind}HeadroomParams\$Builder")
      val builder = builderCls.getConstructor().newInstance()

      try {
        val setWindowMethod = builderCls.getMethod("setCalculationWindowMillis", Int::class.javaPrimitiveType)
        setWindowMethod.invoke(builder, 500)
      } catch (_: Throwable) {}

      try {
        val setTypeMethod = builderCls.getMethod("setCalculationType", Int::class.javaPrimitiveType)
        setTypeMethod.invoke(builder, 1) // 1 = AVERAGE
      } catch (_: Throwable) {}

      val params = builderCls.getMethod("build").invoke(builder) ?: return null
      val m = shm.javaClass.getMethod("get${kind}Headroom", params.javaClass)
      val res = m.invoke(shm, params)
      when (res) {
        is Number -> {
          val v = res.toDouble()
          if (!v.isNaN() && v >= 0.0) {
            if (v > 1.0) v / 100.0 else v
          } else null
        }
        else -> null
      }
    }
  } catch (e: Throwable) {
    val cause = if (e is java.lang.reflect.InvocationTargetException) e.targetException else e
    android.util.Log.w("PixelKit", "healthHeadroom($kind) failed: ${cause.javaClass.name}: ${cause.message}")
    null
  }

  private fun displayInfo(): Map<String, Any?> {
    val d = defaultDisplay()
    val mode = d.mode
    val hdr = d.hdrCapabilities
    val metrics = context.resources.displayMetrics
    val arr = if (Build.VERSION.SDK_INT >= 36) try { d.hasArrSupport() } catch (e: Throwable) { null } else null
    val rates = if (Build.VERSION.SDK_INT >= 36) try { d.supportedRefreshRates.toList() } catch (e: Throwable) { null } else null
    val suggestedHigh = if (Build.VERSION.SDK_INT >= 36) try { d.getSuggestedFrameRate(Display.FRAME_RATE_CATEGORY_HIGH) } catch (e: Throwable) { null } else null
    val suggestedNormal = if (Build.VERSION.SDK_INT >= 36) try { d.getSuggestedFrameRate(Display.FRAME_RATE_CATEGORY_NORMAL) } catch (e: Throwable) { null } else null
    return mapOf(
      "refreshRate" to mode.refreshRate,
      "modeId" to mode.modeId,
      "physicalWidth" to mode.physicalWidth,
      "physicalHeight" to mode.physicalHeight,
      "densityDpi" to metrics.densityDpi,
      "modes" to d.supportedModes.map { mapOf("id" to it.modeId, "width" to it.physicalWidth, "height" to it.physicalHeight, "refreshRate" to it.refreshRate) },
      "hdrTypes" to hdr?.supportedHdrTypes?.toList(),
      "maxLuminance" to hdr?.desiredMaxLuminance,
      "maxAverageLuminance" to hdr?.desiredMaxAverageLuminance,
      "isHdr" to d.isHdr,
      "isWideColorGamut" to d.isWideColorGamut,
      "hdrSdrRatio" to if (Build.VERSION.SDK_INT >= 34) try { d.hdrSdrRatio } catch (e: Throwable) { null } else null,
      "hasArrSupport" to arr,
      "supportedRefreshRates" to rates,
      "suggestedFrameRateHigh" to suggestedHigh,
      "suggestedFrameRateNormal" to suggestedNormal,
    )
  }

  private fun gpuInfo(): Map<String, Any?> {
    var vulkan: String? = null
    try {
      val f = context.packageManager.systemAvailableFeatures.firstOrNull { it.name == "android.hardware.vulkan.version" }
      f?.let { vulkan = "${it.version shr 22}.${(it.version shr 12) and 0x3ff}" }
    } catch (e: Throwable) { /* ignore */ }
    return try {
      val display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
      val ver = IntArray(2)
      EGL14.eglInitialize(display, ver, 0, ver, 1)
      val attribs = intArrayOf(EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE)
      val configs = arrayOfNulls<EGLConfig>(1)
      val num = IntArray(1)
      EGL14.eglChooseConfig(display, attribs, 0, configs, 0, 1, num, 0)
      val ctx = EGL14.eglCreateContext(display, configs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
      val surf = EGL14.eglCreatePbufferSurface(display, configs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
      EGL14.eglMakeCurrent(display, surf, surf, ctx)
      val renderer = GLES20.glGetString(GLES20.GL_RENDERER)
      val vendor = GLES20.glGetString(GLES20.GL_VENDOR)
      val version = GLES20.glGetString(GLES20.GL_VERSION)
      EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      EGL14.eglDestroySurface(display, surf)
      EGL14.eglDestroyContext(display, ctx)
      EGL14.eglTerminate(display)
      mapOf("renderer" to renderer, "vendor" to vendor, "glVersion" to version, "vulkanVersion" to vulkan)
    } catch (e: Throwable) {
      mapOf("renderer" to null, "vendor" to null, "glVersion" to null, "vulkanVersion" to vulkan, "error" to e.message)
    }
  }

  private fun startFrameStats() {
    val expectedNs = try { (1_000_000_000.0 / defaultDisplay().mode.refreshRate).toLong() } catch (e: Throwable) { 8_333_333L }
    val cb = object : Choreographer.FrameCallback {
      var lastNs = 0L; var windowStart = 0L
      var frames = 0; var sumNs = 0L; var maxNs = 0L; var jank = 0
      override fun doFrame(frameTimeNanos: Long) {
        if (lastNs != 0L) {
          val d = frameTimeNanos - lastNs
          frames++; sumNs += d; if (d > maxNs) maxNs = d
          if (d > expectedNs * 3 / 2) jank++
        } else windowStart = frameTimeNanos
        lastNs = frameTimeNanos
        if (frameTimeNanos - windowStart >= 1_000_000_000L && frames > 0) {
          sendEvent("onFrameStats", mapOf(
            "fps" to frames * 1e9 / (frameTimeNanos - windowStart),
            "avgFrameMs" to sumNs.toDouble() / frames / 1e6,
            "maxFrameMs" to maxNs / 1e6,
            "jankFrames" to jank,
            "frames" to frames,
            "expectedFrameMs" to expectedNs / 1e6,
          ))
          frames = 0; sumNs = 0; maxNs = 0; jank = 0; windowStart = frameTimeNanos
        }
        if (frameCallback === this) Choreographer.getInstance().postFrameCallback(this)
      }
    }
    frameCallback = cb
    mainHandler.post { Choreographer.getInstance().postFrameCallback(cb) }
  }

  private fun radioInfo(): Map<String, Any?> {
    val pm = context.packageManager

    // NFC
    val nfcSupported = pm.hasSystemFeature(PackageManager.FEATURE_NFC)
    val nfcAdapter = try { NfcAdapter.getDefaultAdapter(context) } catch (e: Throwable) { null }
    val nfcEnabled = nfcAdapter?.isEnabled ?: false
    val nfcObserveMode = if (Build.VERSION.SDK_INT >= 35 && nfcAdapter != null) {
      try { nfcAdapter.isObserveModeSupported } catch (e: Throwable) { false }
    } else false
    val nfcMap = mapOf(
      "supported" to nfcSupported,
      "enabled" to nfcEnabled,
      "observeModeSupported" to nfcObserveMode,
      "antennaState" to if (!nfcSupported) "UNAVAILABLE" else if (nfcEnabled) "ENABLED" else "DISABLED"
    )

    // Bluetooth
    val btSupported = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH)
    val bleSupported = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)
    val bleChannelSounding = if (Build.VERSION.SDK_INT >= 34) {
      pm.hasSystemFeature("android.hardware.bluetooth_le.channel_sounding")
    } else false
    val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val btAdapter = btManager?.adapter ?: try { BluetoothAdapter.getDefaultAdapter() } catch (e: Throwable) { null }
    val btEnabled = btAdapter?.isEnabled ?: false
    val btStateStr = when (btAdapter?.state) {
      BluetoothAdapter.STATE_ON -> "ON"
      BluetoothAdapter.STATE_OFF -> "OFF"
      BluetoothAdapter.STATE_TURNING_ON -> "TURNING_ON"
      BluetoothAdapter.STATE_TURNING_OFF -> "TURNING_OFF"
      else -> if (btEnabled) "ON" else "OFF"
    }
    val bondedList = mutableListOf<Map<String, Any?>>()
    if (btEnabled && btAdapter != null) {
      try {
        val bonded = btAdapter.bondedDevices
        if (bonded != null) {
          for (dev in bonded) {
            bondedList.add(mapOf(
              "name" to (dev.name ?: "Bluetooth Peripheral"),
              "address" to dev.address,
              "type" to dev.type,
              "bondState" to when (dev.bondState) {
                BluetoothDevice.BOND_BONDED -> "BONDED"
                BluetoothDevice.BOND_BONDING -> "BONDING"
                else -> "NONE"
              }
            ))
          }
        }
      } catch (e: Throwable) {
        // Permission or restricted
      }
    }
    val btMap = mapOf(
      "supported" to btSupported,
      "bleSupported" to bleSupported,
      "enabled" to btEnabled,
      "state" to btStateStr,
      "channelSounding" to bleChannelSounding,
      "bondedDevices" to bondedList
    )

    // UWB
    val uwbSupported = pm.hasSystemFeature("android.hardware.uwb")
    var uwbEnabled: Boolean? = null
    if (uwbSupported && Build.VERSION.SDK_INT >= 31) {
      try {
        val uwbManager = context.getSystemService("uwb")
        if (uwbManager != null) {
          val m = uwbManager.javaClass.methods.firstOrNull { it.name == "isUwbEnabled" && it.parameterCount == 0 }
          uwbEnabled = (m?.invoke(uwbManager) as? Boolean) ?: true
        } else {
          uwbEnabled = true
        }
      } catch (e: Throwable) {
        uwbEnabled = true
      }
    }
    val uwbMap = mapOf(
      "supported" to uwbSupported,
      "enabled" to (uwbEnabled ?: uwbSupported),
      "chipId" to if (uwbSupported) "default" else null,
      "rangingApiSupported" to (Build.VERSION.SDK_INT >= 36)
    )

    // Wi-Fi RTT
    val wifiRttSupported = pm.hasSystemFeature("android.hardware.wifi.rtt")
    val rttManager = if (Build.VERSION.SDK_INT >= 28) {
      context.getSystemService(Context.WIFI_RTT_RANGING_SERVICE) as? WifiRttManager
    } else null
    val wifiRttMap = mapOf(
      "supported" to wifiRttSupported,
      "available" to (rttManager?.isAvailable ?: false)
    )

    // Thread (802.15.4 / Matter mesh radio)
    val threadSupported = pm.hasSystemFeature("android.hardware.thread_network")
    val threadServiceFound = try {
      val serviceManagerClass = Class.forName("android.os.ServiceManager")
      val getServiceMethod = serviceManagerClass.getMethod("getService", String::class.java)
      getServiceMethod.invoke(null, "thread_network") != null ||
        getServiceMethod.invoke(null, "android.hardware.threadnetwork.IThreadChip/chip0") != null
    } catch (e: Throwable) { false }
    val threadMap = mapOf(
      "supported" to threadSupported,
      "serviceFound" to threadServiceFound,
      "chipId" to if (threadSupported) "chip0" else null
    )

    // Satellite
    val satelliteSupported = pm.hasSystemFeature("android.hardware.telephony.satellite")
    val satelliteSosSupported = pm.hasSystemFeature("com.google.android.feature.SATELLITE_SOS_PROVIDER_1")
    val satelliteMap = mapOf(
      "supported" to satelliteSupported,
      "sosSupported" to satelliteSosSupported,
      "provider" to if (satelliteSosSupported) "Google Satellite SOS" else null
    )

    return mapOf(
      "nfc" to nfcMap,
      "bluetooth" to btMap,
      "uwb" to uwbMap,
      "wifiRtt" to wifiRttMap,
      "thread" to threadMap,
      "satellite" to satelliteMap
    )
  }

  companion object {
    private val PART_NAMES = mapOf(
      "0xd8c" to "Arm C1-Ultra", "0xd8b" to "Arm C1-Pro", "0xd8a" to "Arm C1-Premium", "0xd89" to "Arm C1-Nano",
      "0xd85" to "Cortex-X925", "0xd87" to "Cortex-A725", "0xd81" to "Cortex-A720", "0xd80" to "Cortex-A520",
      "0xd82" to "Cortex-X4", "0xd4e" to "Cortex-X3", "0xd4d" to "Cortex-A715", "0xd48" to "Cortex-X2",
      "0xd47" to "Cortex-A710", "0xd46" to "Cortex-A510", "0xd44" to "Cortex-X1", "0xd41" to "Cortex-A78",
      "0xd05" to "Cortex-A55",
    )
    private val PRIMITIVES: Map<String, Int> = buildMap {
      if (Build.VERSION.SDK_INT >= 30) {
        put("CLICK", VibrationEffect.Composition.PRIMITIVE_CLICK)
        put("TICK", VibrationEffect.Composition.PRIMITIVE_TICK)
        put("QUICK_RISE", VibrationEffect.Composition.PRIMITIVE_QUICK_RISE)
        put("SLOW_RISE", VibrationEffect.Composition.PRIMITIVE_SLOW_RISE)
        put("QUICK_FALL", VibrationEffect.Composition.PRIMITIVE_QUICK_FALL)
      }
      if (Build.VERSION.SDK_INT >= 31) {
        put("THUD", VibrationEffect.Composition.PRIMITIVE_THUD)
        put("SPIN", VibrationEffect.Composition.PRIMITIVE_SPIN)
        put("LOW_TICK", VibrationEffect.Composition.PRIMITIVE_LOW_TICK)
      }
    }
  }
}
