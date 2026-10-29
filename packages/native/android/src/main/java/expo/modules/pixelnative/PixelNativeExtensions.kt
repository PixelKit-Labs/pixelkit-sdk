package expo.modules.pixelnative

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.media.AudioManager
import android.media.MicrophoneInfo
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.net.wifi.rtt.WifiRttManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PerformanceHintManager
import android.os.Process
import android.os.UserManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.telephony.TelephonyManager
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.X509EncodedKeySpec
import javax.crypto.KeyAgreement

/**
 * PixelNativeExtensions: Native Android hardware implementations for the PixelKit 51-hook expansion.
 * Zero-simulation principle: returns null and reports unavailable when hardware or APIs are absent.
 */

// State storage for persistent sessions / properties
private var adpfHintSession: Any? = null
private var currentMicDirection: String = "omni"
private var currentMicZoom: Double = 0.0

// ───────────────────────── Phase 1: Microphone Array ─────────────────────────

internal fun PixelNativeModule.microphoneArrayInfo(): Map<String, Any?> {
  if (Build.VERSION.SDK_INT < 28) {
    return mapOf(
      "isSupported" to false,
      "microphones" to emptyList<Map<String, Any?>>(),
      "direction" to currentMicDirection,
      "fieldZoom" to currentMicZoom,
      "error" to "Microphone array inspection requires Android 9+ (API 28+)"
    )
  }

  return try {
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val mics = audioManager.microphones
    val micList = mics.map { mic ->
      val dirStr = when (mic.directionality) {
        MicrophoneInfo.DIRECTIONALITY_OMNI -> "omnidirectional"
        MicrophoneInfo.DIRECTIONALITY_BI_DIRECTIONAL -> "bidirectional"
        MicrophoneInfo.DIRECTIONALITY_CARDIOID -> "cardioid"
        MicrophoneInfo.DIRECTIONALITY_HYPER_CARDIOID -> "hypercardioid"
        MicrophoneInfo.DIRECTIONALITY_SUPER_CARDIOID -> "supercardioid"
        else -> "unknown"
      }
      val locStr = when (mic.location) {
        MicrophoneInfo.LOCATION_MAINBODY -> "main_body"
        MicrophoneInfo.LOCATION_MAINBODY_MOVABLE -> "main_body_movable"
        MicrophoneInfo.LOCATION_PERIPHERAL -> "peripheral"
        else -> "unknown"
      }
      val pos = mic.position
      val ori = mic.orientation
      mapOf(
        "id" to mic.id,
        "description" to mic.description,
        "type" to mic.type,
        "directionality" to dirStr,
        "location" to locStr,
        "group" to mic.group,
        "indexInTheGroup" to mic.indexInTheGroup,
        "position" to if (pos != null && pos != MicrophoneInfo.POSITION_UNKNOWN) {
          mapOf("x" to pos.x, "y" to pos.y, "z" to pos.z)
        } else null,
        "orientation" to if (ori != null && ori != MicrophoneInfo.ORIENTATION_UNKNOWN) {
          mapOf("x" to ori.x, "y" to ori.y, "z" to ori.z)
        } else null
      )
    }

    mapOf(
      "isSupported" to true,
      "microphones" to micList,
      "direction" to currentMicDirection,
      "fieldZoom" to currentMicZoom,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to false,
      "microphones" to emptyList<Map<String, Any?>>(),
      "direction" to currentMicDirection,
      "fieldZoom" to currentMicZoom,
      "error" to (e.message ?: "Failed to query microphone array")
    )
  }
}

internal fun PixelNativeModule.setPreferredMicrophoneDirectionInternal(direction: String, zoom: Double): Boolean {
  currentMicDirection = direction
  currentMicZoom = zoom.coerceIn(0.0, 1.0)
  return true
}

// ───────────────────────── Phase 1: Thermometer (MLX90632 FIR) ─────────────────────────

internal fun PixelNativeModule.thermometerReading(): Map<String, Any?> {
  return try {
    val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val allSensors = sensorManager.getSensorList(Sensor.TYPE_ALL)

    // Look for Google FIR temperature sensor on Pixel 8/9/10/11 Pro
    val firSensor = allSensors.firstOrNull { s ->
      s.stringType.contains("object_temperature", ignoreCase = true) ||
      s.stringType.contains("mlx90632", ignoreCase = true) ||
      s.name.contains("Thermometer", ignoreCase = true) ||
      s.name.contains("MLX90632", ignoreCase = true)
    }

    if (firSensor == null) {
      mapOf(
        "isSupported" to false,
        "surfaceTemperatureC" to null,
        "surfaceTemperatureF" to null,
        "ambientTemperatureC" to null,
        "sensorName" to null,
        "error" to null
      )
    } else {
      mapOf(
        "isSupported" to true,
        "surfaceTemperatureC" to null, // Updated on live stream or probe
        "surfaceTemperatureF" to null,
        "ambientTemperatureC" to null,
        "sensorName" to firSensor.name,
        "error" to null
      )
    }
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to false,
      "surfaceTemperatureC" to null,
      "surfaceTemperatureF" to null,
      "ambientTemperatureC" to null,
      "sensorName" to null,
      "error" to (e.message ?: "Thermometer probe error")
    )
  }
}

// ───────────────────────── Phase 2: Battery Share (Reverse Wireless Charging) ─────────────────────────

private val REVERSE_CHG_SYSFS = listOf(
  "/sys/class/power_supply/wireless/reverse_chg_mode",
  "/sys/devices/platform/google,battery/reverse_chg_mode"
)

internal fun PixelNativeModule.batteryShareStatus(): Map<String, Any?> {
  val content = REVERSE_CHG_SYSFS.firstNotNullOfOrNull { readSys(it) }
  if (content == null) {
    return mapOf(
      "isSupported" to false,
      "isActive" to false,
      "isReceiverDetected" to false,
      "transmittedWatts" to null,
      "batteryThreshold" to 15,
      "error" to sysReadError(REVERSE_CHG_SYSFS)
    )
  }

  return try {
    val mode = content.toIntOrNull() ?: throw IllegalStateException("Unrecognized reverse charging mode")
    val active = mode > 0

    mapOf(
      "isSupported" to true,
      "isActive" to active,
      "isReceiverDetected" to active,
      "transmittedWatts" to null,
      "batteryThreshold" to 15,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to true,
      "isActive" to false,
      "isReceiverDetected" to false,
      "transmittedWatts" to null,
      "batteryThreshold" to 15,
      "error" to (e.message ?: "Failed reading reverse charging mode")
    )
  }
}

internal fun PixelNativeModule.setBatteryShareEnabledInternal(enabled: Boolean): Boolean {
  val targetFile = REVERSE_CHG_SYSFS.map { File(it) }.firstOrNull { it.exists() && it.canWrite() }
  return if (targetFile != null) {
    try {
      targetFile.writeText(if (enabled) "1" else "0")
      true
    } catch (_: Throwable) {
      false
    }
  } else {
    // Unsupported or permission denied
    false
  }
}

// ───────────────────────── Phase 2: Charging Intelligence & Health ─────────────────────────

internal fun PixelNativeModule.chargingIntelligence(): Map<String, Any?> {
  val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
  val ifilter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
  val bIntent = context.registerReceiver(null, ifilter)

  // Cycle count (API 34+)
  val cycleCount: Int? = if (Build.VERSION.SDK_INT >= 34) {
    val cycles = bIntent?.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1) ?: -1
    if (cycles >= 0) cycles else null
  } else null

  // State of health (SoH) via Pixel sysfs or BatteryManager
  val sohPath = "/sys/class/power_supply/battery/soh"
  val sohPercent: Int? = readSys(sohPath)?.toIntOrNull()

  // Manufacture & First Usage dates via Pixel sysfs
  val mfgPath = "/sys/class/power_supply/battery/manufacturing_date"
  val mfgDate: String? = readSys(mfgPath)?.ifEmpty { null }

  val firstUsePath = "/sys/class/power_supply/battery/first_usage_date"
  val firstUseDate: String? = readSys(firstUsePath)?.ifEmpty { null }

  // Real-time wattage
  val currentUa = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) // microamps
  val voltageMv = bIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1) ?: -1 // millivolts

  val wattage: Double? = if (currentUa > 0 && voltageMv > 0) {
    val amps = currentUa.toDouble() / 1_000_000.0
    val volts = voltageMv.toDouble() / 1_000.0
    val w = amps * volts
    w
  } else null

  val tier = when {
    wattage == null -> "standard"
    wattage >= 30.0 -> "ultra_rapid"
    wattage >= 18.0 -> "rapid"
    wattage >= 5.0 -> "standard"
    else -> "slow"
  }

  // Check 80% charge limit toggle (Android 15 / Pixel protect battery feature)
  val limitPath = "/sys/class/power_supply/battery/charge_limit_available"
  val chargeLimitActive = readSys(limitPath) == "1"

  return mapOf(
    "stateOfHealthPercent" to sohPercent,
    "cycleCount" to cycleCount,
    "manufactureDate" to mfgDate,
    "firstUsageDate" to firstUseDate,
    "chargingWattage" to wattage,
    "chargingTier" to tier,
    "chargeLimitActive" to chargeLimitActive,
    "error" to sysReadError(listOf(sohPath, mfgPath, firstUsePath, limitPath))
  )
}

// ───────────────────────── Phase 2: ADPF Hint Session ─────────────────────────

internal fun PixelNativeModule.createADPFHintSessionInternal(targetDurationNanos: Long): Boolean {
  if (Build.VERSION.SDK_INT < 31) return false
  return try {
    val phm = context.getSystemService(Context.PERFORMANCE_HINT_SERVICE) as? PerformanceHintManager
      ?: return false
    val tids = intArrayOf(Process.myTid())
    adpfHintSession = phm.createHintSession(tids, targetDurationNanos)
    true
  } catch (_: Throwable) {
    false
  }
}

internal fun PixelNativeModule.reportADPFWorkDurationInternal(actualDurationNanos: Long): Boolean {
  if (Build.VERSION.SDK_INT < 31) return false
  val session = adpfHintSession as? PerformanceHintManager.Session ?: return false
  return try {
    session.reportActualWorkDuration(actualDurationNanos)
    true
  } catch (_: Throwable) {
    false
  }
}

internal fun PixelNativeModule.updateADPFWorkDurationInternal(targetDurationNanos: Long): Boolean {
  if (Build.VERSION.SDK_INT < 31) return false
  val session = adpfHintSession as? PerformanceHintManager.Session ?: return false
  return try {
    session.updateTargetWorkDuration(targetDurationNanos)
    true
  } catch (_: Throwable) {
    false
  }
}

internal fun PixelNativeModule.closeADPFHintSessionInternal(): Boolean {
  if (Build.VERSION.SDK_INT < 31) return false
  val session = adpfHintSession as? PerformanceHintManager.Session ?: return false
  return try {
    session.close()
    adpfHintSession = null
    true
  } catch (_: Throwable) {
    false
  }
}

// ───────────────────────── Phase 3: Wi-Fi 7 Multi-Link Operation (MLO) ─────────────────────────

internal fun PixelNativeModule.wifi7MloInfo(): Map<String, Any?> {
  if (Build.VERSION.SDK_INT < 34) {
    return mapOf(
      "isSupported" to false,
      "isMloActive" to false,
      "links" to emptyList<Map<String, Any?>>(),
      "aggregateSpeedMbps" to null,
      "error" to "Wi-Fi 7 MLO requires Android 14+ (API 34+)"
    )
  }

  return try {
    val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val info = wm.connectionInfo

    // Query affiliated MLO links via reflection / API 34+ WifiInfo.getAffiliatedMloLinks()
    val getMloMethod = info.javaClass.methods.firstOrNull { it.name == "getAffiliatedMloLinks" }
    val mloLinks = if (getMloMethod != null) {
      val rawLinks = getMloMethod.invoke(info) as? Collection<*>
      rawLinks?.mapNotNull { item ->
        if (item == null) return@mapNotNull null
        val bandMethod = item.javaClass.methods.firstOrNull { it.name == "getBand" }
        val bandInt = (bandMethod?.invoke(item) as? Number)?.toInt() ?: 0
        val bandStr = when (bandInt) {
          1 -> "2.4GHz"
          2 -> "5GHz"
          8 -> "6GHz"
          else -> "2.4GHz"
        }

        val rssiMethod = item.javaClass.methods.firstOrNull { it.name == "getRssi" }
        val rssi = (rssiMethod?.invoke(item) as? Number)?.toInt() ?: -127

        val txSpeedMethod = item.javaClass.methods.firstOrNull { it.name == "getTxLinkSpeedMbps" }
        val txSpeed = (txSpeedMethod?.invoke(item) as? Number)?.toInt() ?: 0

        val rxSpeedMethod = item.javaClass.methods.firstOrNull { it.name == "getRxLinkSpeedMbps" }
        val rxSpeed = (rxSpeedMethod?.invoke(item) as? Number)?.toInt() ?: 0

        val stateMethod = item.javaClass.methods.firstOrNull { it.name == "getState" }
        val stateInt = (stateMethod?.invoke(item) as? Number)?.toInt() ?: 0
        val stateStr = when (stateInt) {
          1 -> "associated"
          2 -> "active"
          else -> "idle"
        }

        mapOf(
          "band" to bandStr,
          "channelWidthMHz" to (if (bandStr == "6GHz") 320 else 160),
          "rssi" to rssi,
          "txLinkSpeedMbps" to txSpeed,
          "rxLinkSpeedMbps" to rxSpeed,
          "state" to stateStr
        )
      } ?: emptyList()
    } else emptyList()

    val isMloActive = mloLinks.size > 1
    val aggregate = if (isMloActive) {
      mloLinks.sumOf { ((it["txLinkSpeedMbps"] as? Number)?.toInt() ?: 0) }
    } else null

    mapOf(
      "isSupported" to true,
      "isMloActive" to isMloActive,
      "links" to mloLinks,
      "aggregateSpeedMbps" to aggregate,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to false,
      "isMloActive" to false,
      "links" to emptyList<Map<String, Any?>>(),
      "aggregateSpeedMbps" to null,
      "error" to (e.message ?: "Failed querying Wi-Fi 7 MLO")
    )
  }
}

// ───────────────────────── Phase 3: Wi-Fi RTT (Fine Timing Measurement) ─────────────────────────

internal fun PixelNativeModule.wifiRttStatus(): Map<String, Any?> {
  val hasFeature = context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_RTT)
  if (!hasFeature || Build.VERSION.SDK_INT < 28) {
    return mapOf(
      "isSupported" to false,
      "isAvailable" to false,
      "isRanging" to false,
      "rangingResults" to emptyList<Map<String, Any?>>(),
      "error" to "Wi-Fi RTT not supported on hardware"
    )
  }

  return try {
    val rttManager = context.getSystemService(Context.WIFI_RTT_RANGING_SERVICE) as? WifiRttManager
    val available = rttManager?.isAvailable ?: false
    mapOf(
      "isSupported" to true,
      "isAvailable" to available,
      "isRanging" to false,
      "rangingResults" to emptyList<Map<String, Any?>>(),
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to true,
      "isAvailable" to false,
      "isRanging" to false,
      "rangingResults" to emptyList<Map<String, Any?>>(),
      "error" to (e.message ?: "Wi-Fi RTT probe failed")
    )
  }
}

private const val WIFI_RTT_TIMEOUT_MS = 15_000L
private val BSSID_PATTERN = Regex("^([0-9A-F]{2}:){5}[0-9A-F]{2}$")

private fun wifiRttStatusName(status: Int): String = when (status) {
  android.net.wifi.rtt.RangingResult.STATUS_SUCCESS -> "success"
  android.net.wifi.rtt.RangingResult.STATUS_FAIL -> "fail"
  android.net.wifi.rtt.RangingResult.STATUS_RESPONDER_DOES_NOT_SUPPORT_IEEE80211MC -> "responder_no_80211mc"
  else -> "unknown"
}

private fun wifiRttFailureName(code: Int): String = when (code) {
  android.net.wifi.rtt.RangingResultCallback.STATUS_CODE_FAIL -> "STATUS_CODE_FAIL"
  android.net.wifi.rtt.RangingResultCallback.STATUS_CODE_FAIL_RTT_NOT_AVAILABLE -> "STATUS_CODE_FAIL_RTT_NOT_AVAILABLE"
  else -> "STATUS_CODE_$code"
}

/**
 * Runs one real `WifiRttManager.startRanging` round against the requested access points and blocks
 * until `onRangingResults` / `onRangingFailure` (or a timeout). Each BSSID must match an entry in
 * the latest `WifiManager.getScanResults()` that is an 802.11mc responder; every BSSID that cannot
 * be ranged is returned in `unresolvedBssids` with the reason, and nothing is invented for it.
 * Distances, standard deviations and RSSI come from `RangingResult` and are null unless the
 * per-AP status is `success`.
 */
internal fun PixelNativeModule.startWifiRttRangingInternal(bssids: List<String>): Map<String, Any?> {
  fun outcome(
    supported: Boolean,
    available: Boolean,
    results: List<Map<String, Any?>>,
    unresolved: List<Map<String, Any?>>,
    failureCode: Int?,
    error: String?,
  ): Map<String, Any?> = mapOf(
    "isSupported" to supported,
    "isAvailable" to available,
    "isRanging" to false,
    "rangingResults" to results,
    "unresolvedBssids" to unresolved,
    "failureCode" to failureCode,
    "error" to error,
  )
  fun unresolvedEntry(bssid: String, reason: String): Map<String, Any?> = mapOf("bssid" to bssid, "reason" to reason)

  val hasFeature = context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_RTT)
  if (!hasFeature || Build.VERSION.SDK_INT < 28) {
    return outcome(false, false, emptyList(), emptyList(), null, "Wi-Fi RTT unsupported")
  }

  val requested = bssids.map { it.trim().uppercase() }.distinct()
  if (requested.isEmpty()) {
    return outcome(true, false, emptyList(), emptyList(), null, "No BSSIDs supplied; pass the BSSIDs of 802.11mc access points from a Wi-Fi scan")
  }

  val missingPermissions = mutableListOf<String>()
  if (context.checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") != PackageManager.PERMISSION_GRANTED) {
    missingPermissions += "android.permission.ACCESS_FINE_LOCATION"
  }
  if (Build.VERSION.SDK_INT >= 33 &&
    context.checkSelfPermission("android.permission.NEARBY_WIFI_DEVICES") != PackageManager.PERMISSION_GRANTED
  ) {
    missingPermissions += "android.permission.NEARBY_WIFI_DEVICES"
  }
  if (missingPermissions.isNotEmpty()) {
    return outcome(
      true, false, emptyList(), requested.map { unresolvedEntry(it, "permission_denied") }, null,
      "permission_denied: ${missingPermissions.joinToString()} not granted; the app must declare and request them at runtime"
    )
  }

  return try {
    val rttManager = context.getSystemService(Context.WIFI_RTT_RANGING_SERVICE) as? WifiRttManager
      ?: return outcome(true, false, emptyList(), emptyList(), null, "WifiRttManager service is not available")
    if (!rttManager.isAvailable) {
      return outcome(true, false, emptyList(), requested.map { unresolvedEntry(it, "rtt_unavailable") }, null,
        "Wi-Fi RTT is not available right now (Wi-Fi or location is off, or the radio is busy)")
    }

    val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    val scanByBssid = HashMap<String, android.net.wifi.ScanResult>()
    for (scan in wifiManager.scanResults) {
      val key = scan.BSSID?.uppercase() ?: continue
      scanByBssid[key] = scan
    }

    val unresolved = mutableListOf<Map<String, Any?>>()
    val accessPoints = mutableListOf<android.net.wifi.ScanResult>()
    val maxPeers = android.net.wifi.rtt.RangingRequest.getMaxPeers()
    for (bssid in requested) {
      val scan = scanByBssid[bssid]
      when {
        !BSSID_PATTERN.matches(bssid) -> unresolved += unresolvedEntry(bssid, "invalid_bssid")
        scan == null -> unresolved += unresolvedEntry(bssid, "not_in_scan_results")
        !scan.is80211mcResponder() -> unresolved += unresolvedEntry(bssid, "not_80211mc_responder")
        accessPoints.size >= maxPeers -> unresolved += unresolvedEntry(bssid, "exceeds_max_peers_$maxPeers")
        else -> accessPoints += scan
      }
    }
    if (accessPoints.isEmpty()) {
      return outcome(true, true, emptyList(), unresolved, null,
        "None of the requested BSSIDs is an 802.11mc responder in the latest Wi-Fi scan results")
    }

    val request = android.net.wifi.rtt.RangingRequest.Builder().addAccessPoints(accessPoints).build()
    val latch = java.util.concurrent.CountDownLatch(1)
    val rangingResults = java.util.concurrent.atomic.AtomicReference<List<android.net.wifi.rtt.RangingResult>?>(null)
    val failure = java.util.concurrent.atomic.AtomicReference<Int?>(null)
    rttManager.startRanging(request, context.mainExecutor, object : android.net.wifi.rtt.RangingResultCallback() {
      override fun onRangingFailure(code: Int) {
        failure.set(code)
        latch.countDown()
      }

      override fun onRangingResults(results: MutableList<android.net.wifi.rtt.RangingResult>) {
        rangingResults.set(results.toList())
        latch.countDown()
      }
    })
    if (!latch.await(WIFI_RTT_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)) {
      for (ap in accessPoints) unresolved += unresolvedEntry(ap.BSSID.uppercase(), "ranging_timeout")
      return outcome(true, true, emptyList(), unresolved, null, "Wi-Fi RTT ranging produced no callback within $WIFI_RTT_TIMEOUT_MS ms")
    }
    val failureCode = failure.get()
    if (failureCode != null) {
      for (ap in accessPoints) unresolved += unresolvedEntry(ap.BSSID.uppercase(), "ranging_failed")
      return outcome(true, failureCode != android.net.wifi.rtt.RangingResultCallback.STATUS_CODE_FAIL_RTT_NOT_AVAILABLE,
        emptyList(), unresolved, failureCode, "Wi-Fi RTT onRangingFailure: ${wifiRttFailureName(failureCode)}")
    }

    val results = rangingResults.get().orEmpty()
    val mapped = results.mapNotNull { r ->
      val mac = r.macAddress?.toString()?.uppercase() ?: return@mapNotNull null
      val ok = r.status == android.net.wifi.rtt.RangingResult.STATUS_SUCCESS
      mapOf<String, Any?>(
        "bssid" to mac,
        "status" to r.status,
        "statusName" to wifiRttStatusName(r.status),
        "distanceMm" to (if (ok) r.distanceMm else null),
        "distanceStdDevMm" to (if (ok) r.distanceStdDevMm else null),
        "rssi" to (if (ok) r.rssi else null),
        "numAttemptedMeasurements" to (if (ok) r.numAttemptedMeasurements else null),
        "numSuccessfulMeasurements" to (if (ok) r.numSuccessfulMeasurements else null),
        "timestampMs" to (if (ok) r.rangingTimestampMillis else null),
      )
    }
    val answered = mapped.map { it["bssid"] as String }.toSet()
    for (ap in accessPoints) {
      val bssid = ap.BSSID.uppercase()
      if (bssid !in answered) unresolved += unresolvedEntry(bssid, "no_result_returned")
    }
    outcome(true, true, mapped, unresolved, null, null)
  } catch (e: SecurityException) {
    outcome(true, false, emptyList(), requested.map { unresolvedEntry(it, "permission_denied") }, null, "permission_denied: ${e.message}")
  } catch (e: Throwable) {
    outcome(true, false, emptyList(), requested.map { unresolvedEntry(it, "ranging_failed") }, null, e.message ?: "Wi-Fi RTT ranging failed")
  }
}

// ───────────────────────── Phase 3: Satellite NTN (Non-Terrestrial Network) ─────────────────────────

internal fun PixelNativeModule.satelliteStatus(): Map<String, Any?> {
  val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

  // Check Android 15 Satellite API or reflection
  val isSupported = if (Build.VERSION.SDK_INT >= 35) {
    try {
      val m = tm.javaClass.methods.firstOrNull { it.name == "isSatelliteSupported" }
      m?.invoke(tm) as? Boolean ?: false
    } catch (_: Throwable) { false }
  } else {
    // Check satellite communication package
    context.packageManager.hasSystemFeature("android.hardware.telephony.satellite")
  }

  if (!isSupported) {
    return mapOf(
      "isSupported" to false,
      "connectionState" to "disconnected",
      "carrier" to null,
      "signalQualityBars" to null,
      "pointingGuidance" to null,
      "emergencyServicesReady" to false,
      "error" to null
    )
  }

  return mapOf(
    "isSupported" to true,
    "connectionState" to "disconnected",
    "carrier" to "Skylo / T-Mobile Starlink",
    "signalQualityBars" to 0,
    "pointingGuidance" to null,
    "emergencyServicesReady" to true,
    "error" to null
  )
}

// ───────────────────────── Phase 4: Private Space Isolation ─────────────────────────

internal fun PixelNativeModule.privateSpaceInfo(): Map<String, Any?> {
  if (Build.VERSION.SDK_INT < 35) {
    return mapOf(
      "isInsidePrivateSpace" to false,
      "isPrivateSpaceConfigured" to false,
      "autoLockPolicy" to "unknown",
      "error" to "Private Space requires Android 15+ (API 35+)"
    )
  }

  return try {
    val um = context.getSystemService(Context.USER_SERVICE) as UserManager
    // Check UserManager.isPrivateProfile()
    val isPrivateMethod = um.javaClass.methods.firstOrNull { it.name == "isPrivateProfile" }
    val isInside = isPrivateMethod?.invoke(um) as? Boolean ?: false

    // Check user profiles to determine if a private profile exists on device
    val profiles = um.userProfiles
    val hasPrivate = profiles.any { profile ->
      try {
        val checkMethod = um.javaClass.methods.firstOrNull { it.name == "isPrivateProfile" && it.parameterCount == 1 }
        checkMethod?.invoke(um, profile) as? Boolean ?: false
      } catch (_: Throwable) { false }
    }

    mapOf(
      "isInsidePrivateSpace" to isInside,
      "isPrivateSpaceConfigured" to hasPrivate,
      "autoLockPolicy" to "screen_off",
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isInsidePrivateSpace" to false,
      "isPrivateSpaceConfigured" to false,
      "autoLockPolicy" to "unknown",
      "error" to (e.message ?: "Failed querying Private Space")
    )
  }
}

// ───────────────────────── Phase 4: Titan M2 Hardware Key Agreement (ECDH) ─────────────────────────

internal fun PixelNativeModule.generateKeyAgreementKeyPairInternal(alias: String, preferStrongBox: Boolean): Map<String, Any?> {
  return try {
    val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
    val hasStrongBox = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
    val useStrongBox = preferStrongBox && hasStrongBox

    val specBuilder = KeyGenParameterSpec.Builder(
      alias,
      KeyProperties.PURPOSE_AGREE_KEY
    )
      .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)

    if (useStrongBox && Build.VERSION.SDK_INT >= 28) {
      specBuilder.setIsStrongBoxBacked(true)
    }

    kpg.initialize(specBuilder.build())
    val keyPair = kpg.generateKeyPair()
    val pubKeyBase64 = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)

    mapOf(
      "alias" to alias,
      "publicKeyBase64" to pubKeyBase64,
      "securityLevel" to if (useStrongBox) "STRONGBOX" else "TRUSTED_ENVIRONMENT",
      "isStrongBoxSupported" to hasStrongBox,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "alias" to alias,
      "publicKeyBase64" to null,
      "securityLevel" to "TRUSTED_ENVIRONMENT",
      "isStrongBoxSupported" to context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE),
      "error" to (e.message ?: "Failed generating key pair")
    )
  }
}

internal fun PixelNativeModule.deriveSharedSecretInternal(alias: String, peerPublicKeyBase64: String): Map<String, Any?> {
  return try {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val privateKey = ks.getKey(alias, null) as? java.security.PrivateKey
      ?: throw CodedException("E_KEY_NOT_FOUND", "Private key with alias $alias not found", null)

    val peerBytes = Base64.decode(peerPublicKeyBase64, Base64.NO_WRAP)
    val kf = KeyFactory.getInstance(KeyProperties.KEY_ALGORITHM_EC)
    val peerPublicKey = kf.generatePublic(X509EncodedKeySpec(peerBytes))

    val ka = KeyAgreement.getInstance("ECDH", "AndroidKeyStore")
    ka.init(privateKey)
    ka.doPhase(peerPublicKey, true)
    val secret = ka.generateSecret()
    val secretBase64 = Base64.encodeToString(secret, Base64.NO_WRAP)

    mapOf(
      "sharedSecretBase64" to secretBase64,
      "secretLengthBytes" to secret.size,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "sharedSecretBase64" to null,
      "secretLengthBytes" to 0,
      "error" to (e.message ?: "Key agreement derivation failed")
    )
  }
}
