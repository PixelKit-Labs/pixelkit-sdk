package expo.modules.pixelnative

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.media.AudioManager
import android.media.MicrophoneInfo
import android.net.wifi.MloLink
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
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
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

// ───────────────────────── Phase 1: Microphone Array ─────────────────────────

internal fun PixelNativeModule.microphoneArrayInfo(): Map<String, Any?> {
  if (Build.VERSION.SDK_INT < 28) {
    return mapOf(
      "isSupported" to false,
      "microphones" to emptyList<Map<String, Any?>>(),
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
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to false,
      "microphones" to emptyList<Map<String, Any?>>(),
      "error" to (e.message ?: "Failed to query microphone array")
    )
  }
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
        "error" to "SensorManager lists no far-infrared temperature sensor on this device"
      )
    } else {
      // SensorManager lists the sensor, but this module has no verified decoder for its samples
      // (unit, channel layout), so it reports the sensor and no temperature.
      mapOf(
        "isSupported" to true,
        "surfaceTemperatureC" to null,
        "surfaceTemperatureF" to null,
        "ambientTemperatureC" to null,
        "sensorName" to firSensor.name,
        "error" to "Sensor '${firSensor.name}' (type '${firSensor.stringType}') is listed by SensorManager, but PixelKit has no verified decoder for its samples, so no temperature is reported"
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
      "transmittedWatts" to null,
      "error" to sysReadError(REVERSE_CHG_SYSFS)
    )
  }

  return try {
    val mode = content.toIntOrNull() ?: throw IllegalStateException("Unrecognized reverse charging mode")
    val active = mode > 0

    mapOf(
      "isSupported" to true,
      "isActive" to active,
      "transmittedWatts" to null,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isSupported" to true,
      "isActive" to false,
      "transmittedWatts" to null,
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

  // Classification of the measured wattage; null when no wattage was read.
  val tier: String? = when {
    wattage == null -> null
    wattage >= 30.0 -> "ultra_rapid"
    wattage >= 18.0 -> "rapid"
    wattage >= 5.0 -> "standard"
    else -> "slow"
  }

  // Contents of the Pixel sysfs node charge_limit_available: true for "1", false for any other
  // value, null when the node cannot be read. The node says whether the limit is offered, not
  // whether it is switched on.
  val limitPath = "/sys/class/power_supply/battery/charge_limit_available"
  val limitRaw = readSys(limitPath)
  val chargeLimitAvailable: Boolean? = limitRaw?.let { it == "1" }

  return mapOf(
    "stateOfHealthPercent" to sohPercent,
    "cycleCount" to cycleCount,
    "manufactureDate" to mfgDate,
    "firstUsageDate" to firstUseDate,
    "chargingWattage" to wattage,
    "chargingTier" to tier,
    "chargeLimitAvailable" to chargeLimitAvailable,
    "error" to sysReadError(listOf(sohPath, mfgPath, firstUsePath, limitPath))
  )
}

// ───────────────────────── Phase 2: ADPF Hint Session ─────────────────────────

/**
 * Creates a PerformanceHintManager session for [tids] (default: the app's main thread, whose
 * tid equals the process id). Any previous session is closed first. Returns true only when
 * `createHintSession` returned a session; the framework returns null when the device has no
 * hint support or the tids are rejected.
 */
internal fun PixelNativeModule.createADPFHintSessionInternal(targetDurationNanos: Long, tids: IntArray?): Boolean {
  if (Build.VERSION.SDK_INT < 31) return false
  return try {
    val phm = context.getSystemService(Context.PERFORMANCE_HINT_SERVICE) as? PerformanceHintManager
      ?: return false
    (adpfHintSession as? PerformanceHintManager.Session)?.close()
    adpfHintSession = null
    val sessionTids = if (tids != null && tids.isNotEmpty()) tids else intArrayOf(Process.myPid())
    val session = phm.createHintSession(sessionTids, targetDurationNanos)
    adpfHintSession = session
    session != null
  } catch (_: Throwable) {
    adpfHintSession = null
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
/** Value MloLink.getRssi() returns when no RSSI is known; equals the non-public WifiInfo.INVALID_RSSI (-127). */
private const val MLO_LINK_RSSI_UNKNOWN = -127


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

    // WifiInfo.getAffiliatedMloLinks(): links of the AP MLD. getAssociatedMloLinks(): the subset
    // this station is associated to. MloLink.getBand() returns ScanResult.WIFI_BAND_* values.
    val affiliated = info.affiliatedMloLinks
    val associated = info.associatedMloLinks
    val mloLinks = affiliated.map { link ->
      val band = when (link.band) {
        android.net.wifi.ScanResult.WIFI_BAND_24_GHZ -> "2.4GHz"
        android.net.wifi.ScanResult.WIFI_BAND_5_GHZ -> "5GHz"
        android.net.wifi.ScanResult.WIFI_BAND_6_GHZ -> "6GHz"
        android.net.wifi.ScanResult.WIFI_BAND_60_GHZ -> "60GHz"
        else -> null
      }
      val state = when (link.state) {
        MloLink.MLO_LINK_STATE_UNASSOCIATED -> "unassociated"
        MloLink.MLO_LINK_STATE_IDLE -> "idle"
        MloLink.MLO_LINK_STATE_ACTIVE -> "active"
        else -> "invalid"
      }
      mapOf(
        "band" to band,
        "channel" to link.channel,
        "rssi" to link.rssi.takeIf { it != MLO_LINK_RSSI_UNKNOWN },
        "txLinkSpeedMbps" to link.txLinkSpeedMbps.takeIf { it != WifiInfo.LINK_SPEED_UNKNOWN },
        "rxLinkSpeedMbps" to link.rxLinkSpeedMbps.takeIf { it != WifiInfo.LINK_SPEED_UNKNOWN },
        "state" to state
      )
    }

    val isMloActive = associated.size > 1
    val associatedTx = associated.mapNotNull { it.txLinkSpeedMbps.takeIf { v -> v != WifiInfo.LINK_SPEED_UNKNOWN } }
    val aggregate = if (isMloActive && associatedTx.isNotEmpty()) associatedTx.sum() else null

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

/**
 * Support comes from the `android.hardware.telephony.satellite` system feature. The public
 * `android.telephony.satellite.SatelliteManager` (API 36) exposes only
 * register/unregisterStateChangeListener with an enabled-state callback, so there is no public
 * read for connection state, carrier, signal bars or SOS readiness; those fields are null.
 */
internal fun PixelNativeModule.satelliteStatus(): Map<String, Any?> {
  val hasFeature = context.packageManager.hasSystemFeature("android.hardware.telephony.satellite")
  return mapOf(
    "isSupported" to hasFeature,
    "connectionState" to null,
    "carrier" to null,
    "signalQualityBars" to null,
    "pointingGuidance" to null,
    "emergencyServicesReady" to null,
    "unreadReason" to "Android's public API exposes no satellite connection state, carrier, signal or emergency readiness to apps",
    "error" to null
  )
}

// ───────────────────────── Phase 4: Private Space Isolation ─────────────────────────

/**
 * Android hides the Private Space profile from third-party apps (UserManager.getUserProfiles()
 * does not list it), so whether one exists cannot be read from outside it. When the app runs
 * inside the profile, existence is implied. No public API exposes the auto-lock setting.
 */
internal fun PixelNativeModule.privateSpaceInfo(): Map<String, Any?> {
  if (Build.VERSION.SDK_INT < 35) {
    return mapOf(
      "isInsidePrivateSpace" to false,
      "isPrivateSpaceConfigured" to false,
      "reason" to null,
      "error" to "Private Space requires Android 15+ (API 35+)"
    )
  }

  return try {
    val um = context.getSystemService(Context.USER_SERVICE) as UserManager
    // A private profile is a profile: a process outside any profile is not inside Private Space.
    var isInside: Boolean? = if (!um.isProfile) false else null
    if (isInside == null) {
      val launcherApps = context.getSystemService(Context.LAUNCHER_APPS_SERVICE) as? android.content.pm.LauncherApps
      val userType = try {
        launcherApps?.getLauncherUserInfo(Process.myUserHandle())?.userType
      } catch (_: Throwable) { null }
      if (userType != null) isInside = userType == UserManager.USER_TYPE_PROFILE_PRIVATE
    }
    val reason = if (isInside == true) {
      "No public API exposes the Private Space auto-lock setting"
    } else {
      "Android hides the Private Space profile from third-party apps; whether one exists is not readable from outside it. No public API exposes the auto-lock setting"
    }
    mapOf(
      "isInsidePrivateSpace" to isInside,
      "isPrivateSpaceConfigured" to (if (isInside == true) true else null),
      "reason" to reason,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "isInsidePrivateSpace" to null,
      "isPrivateSpaceConfigured" to null,
      "reason" to null,
      "error" to (e.message ?: "Failed querying Private Space")
    )
  }
}

// ───────────────────────── Phase 4: Keystore ECDH Key Agreement ─────────────────────────

/** Maps KeyInfo.getSecurityLevel() (API 31+) of an AndroidKeyStore private key; null when unreadable. */
internal fun keystoreSecurityLevel(privateKey: java.security.PrivateKey): String? {
  if (Build.VERSION.SDK_INT < 31) return null
  val info = KeyFactory.getInstance(privateKey.algorithm, "AndroidKeyStore")
    .getKeySpec(privateKey, KeyInfo::class.java)
  return when (info.securityLevel) {
    KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
    KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TRUSTED_ENVIRONMENT"
    KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
    KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE -> "UNKNOWN_SECURE"
    else -> null
  }
}

internal fun PixelNativeModule.generateKeyAgreementKeyPairInternal(alias: String, preferStrongBox: Boolean): Map<String, Any?> {
  val hasStrongBox = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
  return try {
    val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
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
    var level: String? = null
    var levelReason: String? = null
    try {
      level = keystoreSecurityLevel(keyPair.private)
      if (level == null) levelReason = "KeyInfo.getSecurityLevel() is unavailable below Android 12 or reported an unknown level"
    } catch (e: Throwable) {
      levelReason = e.message ?: "KeyInfo security level read failed"
    }

    mapOf(
      "alias" to alias,
      "publicKeyBase64" to pubKeyBase64,
      "securityLevel" to level,
      "securityLevelReason" to levelReason,
      "isStrongBoxSupported" to hasStrongBox,
      "error" to null
    )
  } catch (e: Throwable) {
    mapOf(
      "alias" to alias,
      "publicKeyBase64" to null,
      "securityLevel" to null,
      "securityLevelReason" to null,
      "isStrongBoxSupported" to hasStrongBox,
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
