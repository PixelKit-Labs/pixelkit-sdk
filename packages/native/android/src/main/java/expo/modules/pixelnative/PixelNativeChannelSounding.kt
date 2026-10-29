package expo.modules.pixelnative

import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.ranging.RangingCapabilities
import android.ranging.RangingData
import android.ranging.RangingDevice
import android.ranging.RangingManager
import android.ranging.RangingMeasurement
import android.ranging.RangingPreference
import android.ranging.RangingSession
import android.ranging.ble.cs.BleCsRangingParams
import android.ranging.raw.RawInitiatorRangingConfig
import android.ranging.raw.RawRangingDevice
import android.ranging.raw.RawResponderRangingConfig
import expo.modules.kotlin.Promise
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * One BLE Channel Sounding ranging session request. The peer's Bluetooth address is the only
 * required field; the remaining fields are optional tuning hints that map one to one onto
 * `android.ranging.ble.cs.BleCsRangingParams.Builder` and are left unset (platform default) when null.
 */
internal data class ChannelSoundingRequest(
  /** Upper-case "AA:BB:CC:DD:EE:FF", the format BleCsRangingParams.Builder requires. */
  val peerAddress: String,
  val initiator: Boolean,
  /** BleCsRangingCapabilities.CS_SECURITY_LEVEL_ONE (1) or CS_SECURITY_LEVEL_FOUR (4), or null for the platform default. */
  val securityLevel: Int?,
  /** 'unknown' | 'line_of_sight' | 'non_line_of_sight', or null for the platform default. */
  val sightType: String?,
  /** 'unknown' | 'indoor' | 'outdoor', or null for the platform default. */
  val locationType: String?,
  /** 'normal' | 'infrequent' | 'frequent', or null for the platform default. */
  val updateRate: String?,
)

internal sealed class ChannelSoundingRequestParse {
  class Ok(val request: ChannelSoundingRequest) : ChannelSoundingRequestParse()

  /** `missingPeer` is true when no peer address was supplied at all (as opposed to a malformed one). */
  class Invalid(val problems: List<String>, val missingPeer: Boolean) : ChannelSoundingRequestParse()
}

/** Pure parsing of the JS config map; no Android types, so it is covered by a JVM unit test. */
internal object ChannelSoundingRequestParser {
  private val ADDRESS = Regex("^[0-9A-F]{2}(:[0-9A-F]{2}){5}$")
  private val SIGHT_TYPES = setOf("unknown", "line_of_sight", "non_line_of_sight")
  private val LOCATION_TYPES = setOf("unknown", "indoor", "outdoor")
  private val UPDATE_RATES = setOf("normal", "infrequent", "frequent")

  /** Returns the upper-case address when `value` is a colon-separated 6-byte hex string, else null. */
  fun normalizeAddress(value: Any?): String? {
    val upper = (value as? String)?.trim()?.uppercase() ?: return null
    return if (ADDRESS.matches(upper)) upper else null
  }

  private fun intOf(value: Any?): Int? {
    val n = value as? Number ?: return null
    val d = n.toDouble()
    return if (d == Math.rint(d) && d >= Int.MIN_VALUE && d <= Int.MAX_VALUE) d.toInt() else null
  }

  fun parse(config: Map<String, Any?>?): ChannelSoundingRequestParse {
    if (config == null) {
      return ChannelSoundingRequestParse.Invalid(listOf("a peer configuration with peerAddress is required"), true)
    }
    val problems = mutableListOf<String>()

    val rawPeer = config["peerAddress"]
    val missingPeer = rawPeer == null || (rawPeer is String && rawPeer.isBlank())
    val peer = if (missingPeer) null else normalizeAddress(rawPeer)
    if (missingPeer) {
      problems += "peerAddress is required: the Bluetooth address of the peer, for example \"AA:BB:CC:DD:EE:FF\""
    } else if (peer == null) {
      problems += "peerAddress must be six colon-separated hex bytes such as \"AA:BB:CC:DD:EE:FF\""
    }

    val role = if (config["role"] == null) "initiator" else config["role"] as? String
    if (role != "initiator" && role != "responder") problems += "role must be 'initiator' or 'responder'"

    var security: Int? = null
    if (config["securityLevel"] != null) {
      security = intOf(config["securityLevel"])
      if (security != 1 && security != 4) problems += "securityLevel must be 1 or 4"
    }

    val sight = config["sightType"] as? String
    if (config["sightType"] != null && sight !in SIGHT_TYPES) problems += "sightType must be 'unknown', 'line_of_sight' or 'non_line_of_sight'"

    val location = config["locationType"] as? String
    if (config["locationType"] != null && location !in LOCATION_TYPES) problems += "locationType must be 'unknown', 'indoor' or 'outdoor'"

    val rate = config["updateRate"] as? String
    if (config["updateRate"] != null && rate !in UPDATE_RATES) problems += "updateRate must be 'normal', 'infrequent' or 'frequent'"

    if (problems.isNotEmpty() || peer == null) {
      return ChannelSoundingRequestParse.Invalid(problems, missingPeer)
    }
    return ChannelSoundingRequestParse.Ok(
      ChannelSoundingRequest(
        peerAddress = peer,
        initiator = role == "initiator",
        securityLevel = security,
        sightType = sight,
        locationType = location,
        updateRate = rate,
      )
    )
  }
}

/**
 * One real BLE Channel Sounding ranging session through the Android 16 (API 36)
 * `android.ranging.RangingManager`.
 *
 * `start` builds a RAW `BleCsRangingParams` session for the caller-supplied peer address, opens it
 * with `RangingSession.start`, and resolves once the platform reports `onOpened` or `onOpenFailed`.
 * Measurements arrive as `onChannelSoundingResult` events and lifecycle changes as
 * `onChannelSoundingState` events; every distance, confidence and RSSI value comes from
 * `android.ranging.RangingData`. `RangingData` does not say whether a sample came from phase-based
 * ranging or round-trip time, so no method is reported. Nothing is emitted when the peer does not
 * answer. At most one session exists at a time.
 */
internal class ChannelSoundingController(
  private val context: Context,
  private val mainHandler: Handler,
  private val emit: (String, Map<String, Any?>) -> Unit,
) {
  private val lock = Any()
  private var session: RangingSession? = null
  private var activePeer: String? = null
  private var opened = false
  /** Counts start requests that reached the platform; reported to JS as `sessionId`. */
  private var generation = 0
  private var pending: Promise? = null
  private var pendingTimeout: Runnable? = null

  private companion object {
    const val OPEN_TIMEOUT_MS = 10_000L
    const val CAPABILITIES_TIMEOUT_MS = 2_000L
    const val RANGING_PERMISSION = "android.permission.RANGING"
    const val CS_FEATURE = "android.hardware.bluetooth_le.channel_sounding"
  }

  private fun rangingManager(): RangingManager? =
    if (Build.VERSION.SDK_INT >= 36) context.getSystemService(RangingManager::class.java) else null

  private fun outcome(status: String, error: String?, sessionId: Int?, peer: String?): Map<String, Any?> {
    val serviceAvailable = rangingManager() != null
    return mapOf(
      "success" to (status == "opened"),
      "status" to status,
      "error" to error,
      "sessionId" to sessionId,
      "peerAddress" to peer,
      "technology" to "BLE_CS",
      "serviceAvailable" to serviceAvailable,
      "serviceName" to (if (serviceAvailable) "RangingManager" else null),
      "channelSoundingFeature" to context.packageManager.hasSystemFeature(CS_FEATURE),
      "timestampMs" to System.currentTimeMillis(),
    )
  }

  fun start(config: Map<String, Any?>?, promise: Promise) {
    if (!context.packageManager.hasSystemFeature(CS_FEATURE)) {
      promise.resolve(outcome("channel_sounding_unsupported", "Device does not declare $CS_FEATURE", null, null))
      return
    }
    if (Build.VERSION.SDK_INT < 36) {
      promise.resolve(
        outcome(
          "ranging_api_unavailable",
          "android.ranging.RangingManager requires Android 16 (API 36); this device is API ${Build.VERSION.SDK_INT}",
          null,
          null,
        )
      )
      return
    }
    val manager = rangingManager()
    if (manager == null) {
      promise.resolve(outcome("ranging_api_unavailable", "getSystemService(RangingManager) returned null", null, null))
      return
    }

    val request = when (val parsed = ChannelSoundingRequestParser.parse(config)) {
      is ChannelSoundingRequestParse.Invalid -> {
        val status = if (parsed.missingPeer) "needs_peer_address" else "invalid_parameters"
        promise.resolve(outcome(status, parsed.problems.joinToString("; "), null, null))
        return
      }
      is ChannelSoundingRequestParse.Ok -> parsed.request
    }

    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    if (adapter == null) {
      promise.resolve(outcome("channel_sounding_unsupported", "The device has no Bluetooth adapter", null, request.peerAddress))
      return
    }
    if (!adapter.isEnabled) {
      promise.resolve(outcome("bluetooth_disabled", "Bluetooth is switched off", null, request.peerAddress))
      return
    }

    if (context.checkSelfPermission(RANGING_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(
        outcome(
          "permission_denied",
          "$RANGING_PERMISSION is not granted; the app must declare it in its manifest and request it at runtime",
          null,
          request.peerAddress,
        )
      )
      return
    }

    var gen = -1
    var busy = false
    var busyPeer: String? = null
    var busyId: Int? = null
    synchronized(lock) {
      if (session != null || pending != null) {
        busy = true
        busyPeer = activePeer
        busyId = generation
      } else {
        generation += 1
        gen = generation
        activePeer = request.peerAddress
        opened = false
        pending = promise
      }
    }
    if (busy) {
      promise.resolve(outcome("session_active", "Channel Sounding session $busyId with $busyPeer is already running; stop it first", busyId, busyPeer))
      return
    }

    // From here the start promise is owned by `pending`; every exit goes through finish().
    try {
      val capabilities = readCapabilities(manager)
      val availability = capabilities?.technologyAvailability?.get(RangingManager.BLE_CS)
      val unavailable = when (availability) {
        null, RangingCapabilities.ENABLED -> null
        RangingCapabilities.NOT_SUPPORTED -> "channel_sounding_unsupported" to "RangingManager reports BLE Channel Sounding as not supported"
        RangingCapabilities.DISABLED_USER -> "channel_sounding_disabled" to "BLE Channel Sounding is switched off by the user"
        RangingCapabilities.DISABLED_REGULATORY -> "channel_sounding_disabled" to "BLE Channel Sounding is disabled by a regulatory restriction in the current region"
        RangingCapabilities.DISABLED_USER_RESTRICTIONS -> "channel_sounding_disabled" to "BLE Channel Sounding is disabled by user restrictions"
        else -> "channel_sounding_disabled" to "RangingManager reports BLE Channel Sounding availability code $availability"
      }
      if (unavailable != null) {
        finish(gen, outcome(unavailable.first, unavailable.second, gen, request.peerAddress))
        return
      }

      val supportedLevels = capabilities?.csCapabilities?.supportedSecurityLevels
      if (request.securityLevel != null && supportedLevels != null && request.securityLevel !in supportedLevels) {
        finish(
          gen,
          outcome(
            "invalid_parameters",
            "securityLevel ${request.securityLevel} is not supported by this device; supported levels: ${supportedLevels.sorted()}",
            gen,
            request.peerAddress,
          )
        )
        return
      }

      val preference = try {
        buildPreference(request)
      } catch (e: IllegalArgumentException) {
        finish(gen, outcome("invalid_parameters", e.message ?: "The platform rejected the Channel Sounding parameters", gen, request.peerAddress))
        return
      }

      val newSession = manager.createRangingSession(context.mainExecutor, SessionCallback(gen, request.peerAddress))
      if (newSession == null) {
        finish(gen, outcome("open_failed", "RangingManager.createRangingSession returned null", gen, request.peerAddress))
        return
      }
      synchronized(lock) { session = newSession }

      val timeout = Runnable {
        val stillPending = synchronized(lock) { generation == gen && pending != null }
        if (stillPending) {
          finish(gen, outcome("open_failed", "RangingSession reported neither onOpened nor onOpenFailed within $OPEN_TIMEOUT_MS ms", gen, request.peerAddress))
        }
      }
      synchronized(lock) { pendingTimeout = timeout }
      mainHandler.postDelayed(timeout, OPEN_TIMEOUT_MS)

      newSession.start(preference)
    } catch (e: SecurityException) {
      finish(gen, outcome("permission_denied", e.message ?: "SecurityException while opening the Channel Sounding session", gen, request.peerAddress))
    } catch (e: Throwable) {
      finish(gen, outcome("open_failed", e.message ?: e.javaClass.simpleName, gen, request.peerAddress))
    }
  }

  /** Closes whatever the generation opened, then resolves its start promise with a failure. */
  private fun finish(gen: Int, result: Map<String, Any?>) {
    teardown(gen)
    settle(gen, result)
  }

  /** Resolves the start promise exactly once for the given generation. */
  private fun settle(gen: Int, result: Map<String, Any?>) {
    val p = synchronized(lock) {
      if (generation != gen) return
      val current = pending
      pending = null
      pendingTimeout?.let { mainHandler.removeCallbacks(it) }
      pendingTimeout = null
      current
    }
    p?.resolve(result)
  }

  private fun clearIfCurrent(gen: Int) {
    synchronized(lock) {
      if (generation != gen) return
      session = null
      activePeer = null
      opened = false
    }
  }

  /** Stops and closes the session of the given generation; returns the first error message, or null. */
  private fun teardown(gen: Int): String? {
    val s: RangingSession?
    synchronized(lock) {
      if (generation != gen) return null
      s = session
      session = null
      activePeer = null
      opened = false
    }
    var error: String? = null
    if (s != null) {
      try { s.stop() } catch (e: Throwable) { error = e.message ?: e.javaClass.simpleName }
      try { s.close() } catch (e: Throwable) { if (error == null) error = e.message ?: e.javaClass.simpleName }
    }
    return error
  }

  /** Stops the running session, if any, and reports what actually happened. */
  fun stop(): Map<String, Any?> {
    val gen: Int
    val hadSession: Boolean
    val hadPending: Boolean
    synchronized(lock) {
      gen = generation
      hadSession = session != null
      hadPending = pending != null
    }
    if (!hadSession && !hadPending) {
      return mapOf("wasActive" to false, "closed" to false, "sessionId" to null, "error" to null, "timestampMs" to System.currentTimeMillis())
    }
    val peer = synchronized(lock) { activePeer }
    val error = teardown(gen)
    if (hadPending) {
      settle(gen, outcome("open_failed", "Session was stopped before the platform reported onOpened", gen, peer))
    }
    return mapOf(
      "wasActive" to true,
      "closed" to (error == null),
      "sessionId" to gen,
      "error" to error,
      "timestampMs" to System.currentTimeMillis(),
    )
  }

  fun state(): Map<String, Any?> = synchronized(lock) {
    val active = session != null
    mapOf(
      "active" to active,
      "opened" to opened,
      "sessionId" to (if (active || pending != null) generation else null),
      "peerAddress" to activePeer,
    )
  }

  /**
   * What `RangingManager` reports for BLE Channel Sounding right now: availability for the
   * technology and the supported CS security levels. Every field is null when the platform did not
   * deliver it; `error` states why.
   */
  fun capabilities(): Map<String, Any?> {
    val manager = rangingManager()
    if (manager == null) {
      val reason = if (Build.VERSION.SDK_INT < 36) {
        "android.ranging.RangingManager requires Android 16 (API 36); this device is API ${Build.VERSION.SDK_INT}"
      } else {
        "getSystemService(RangingManager) returned null"
      }
      return capabilitiesMap(false, null, null, reason)
    }
    val capabilities = try {
      readCapabilities(manager)
    } catch (e: SecurityException) {
      return capabilitiesMap(true, null, null, e.message ?: "SecurityException while reading ranging capabilities")
    }
    if (capabilities == null) {
      return capabilitiesMap(true, null, null, "RangingManager did not deliver capabilities within $CAPABILITIES_TIMEOUT_MS ms")
    }
    val availability = capabilities.technologyAvailability[RangingManager.BLE_CS]
    val name = when (availability) {
      null -> null
      RangingCapabilities.ENABLED -> "enabled"
      RangingCapabilities.NOT_SUPPORTED -> "not_supported"
      RangingCapabilities.DISABLED_USER -> "disabled_user"
      RangingCapabilities.DISABLED_REGULATORY -> "disabled_regulatory"
      RangingCapabilities.DISABLED_USER_RESTRICTIONS -> "disabled_user_restrictions"
      else -> "code_$availability"
    }
    val levels = capabilities.csCapabilities?.supportedSecurityLevels?.sorted()
    val error = when {
      availability == null -> "RangingManager did not list BLE Channel Sounding in technologyAvailability"
      else -> null
    }
    return capabilitiesMap(true, name, levels, error)
  }

  private fun capabilitiesMap(api: Boolean, availability: String?, levels: List<Int>?, error: String?): Map<String, Any?> =
    mapOf(
      "rangingApiAvailable" to api,
      "availability" to availability,
      "supportedSecurityLevels" to levels,
      "error" to error,
      "timestampMs" to System.currentTimeMillis(),
    )

  /** One capabilities snapshot, or null when the platform did not deliver one within the timeout. */
  private fun readCapabilities(manager: RangingManager): RangingCapabilities? {
    val latch = CountDownLatch(1)
    val value = AtomicReference<RangingCapabilities?>(null)
    val executor = Executors.newSingleThreadExecutor()
    val callback = RangingManager.RangingCapabilitiesCallback { capabilities ->
      value.set(capabilities)
      latch.countDown()
    }
    try {
      manager.registerCapabilitiesCallback(executor, callback)
      latch.await(CAPABILITIES_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } finally {
      try { manager.unregisterCapabilitiesCallback(callback) } catch (_: Throwable) {}
      executor.shutdown()
    }
    return value.get()
  }

  private fun buildPreference(req: ChannelSoundingRequest): RangingPreference {
    val params = BleCsRangingParams.Builder(req.peerAddress).apply {
      req.securityLevel?.let { setSecurityLevel(it) }
      when (req.sightType) {
        "line_of_sight" -> setSightType(BleCsRangingParams.SIGHT_TYPE_LINE_OF_SIGHT)
        "non_line_of_sight" -> setSightType(BleCsRangingParams.SIGHT_TYPE_NON_LINE_OF_SIGHT)
        "unknown" -> setSightType(BleCsRangingParams.SIGHT_TYPE_UNKNOWN)
      }
      when (req.locationType) {
        "indoor" -> setLocationType(BleCsRangingParams.LOCATION_TYPE_INDOOR)
        "outdoor" -> setLocationType(BleCsRangingParams.LOCATION_TYPE_OUTDOOR)
        "unknown" -> setLocationType(BleCsRangingParams.LOCATION_TYPE_UNKNOWN)
      }
      when (req.updateRate) {
        "frequent" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_FREQUENT)
        "infrequent" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_INFREQUENT)
        "normal" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_NORMAL)
      }
    }.build()

    val peerDevice = RawRangingDevice.Builder()
      .setRangingDevice(RangingDevice.Builder().setUuid(UUID.randomUUID()).build())
      .setCsRangingParams(params)
      .build()

    val rangingConfig: android.ranging.RangingConfig = if (req.initiator) {
      RawInitiatorRangingConfig.Builder().addRawRangingDevice(peerDevice).build()
    } else {
      RawResponderRangingConfig.Builder().setRawRangingDevice(peerDevice).build()
    }

    val role = if (req.initiator) RangingPreference.DEVICE_ROLE_INITIATOR else RangingPreference.DEVICE_ROLE_RESPONDER
    return RangingPreference.Builder(role, rangingConfig).build()
  }

  private fun reasonName(reason: Int): String = when (reason) {
    RangingSession.Callback.REASON_LOCAL_REQUEST -> "local_request"
    RangingSession.Callback.REASON_REMOTE_REQUEST -> "remote_request"
    RangingSession.Callback.REASON_SYSTEM_POLICY -> "system_policy"
    RangingSession.Callback.REASON_NO_PEERS_FOUND -> "no_peers_found"
    RangingSession.Callback.REASON_UNSUPPORTED -> "unsupported"
    RangingSession.Callback.REASON_UNKNOWN -> "unknown"
    else -> "reason_$reason"
  }

  private fun confidenceName(m: RangingMeasurement?): String? = when (m?.confidence) {
    RangingMeasurement.CONFIDENCE_HIGH -> "high"
    RangingMeasurement.CONFIDENCE_MEDIUM -> "medium"
    RangingMeasurement.CONFIDENCE_LOW -> "low"
    else -> null
  }

  private inner class SessionCallback(
    private val gen: Int,
    private val peerAddress: String,
  ) : RangingSession.Callback {
    private fun current(): Boolean = synchronized(lock) { generation == gen }

    private fun emitState(state: String, reason: String?) {
      emit(
        "onChannelSoundingState",
        mapOf(
          "sessionId" to gen,
          "state" to state,
          "deviceAddress" to peerAddress,
          "reason" to reason,
          "timestampMs" to System.currentTimeMillis(),
        ),
      )
    }

    override fun onOpened() {
      if (!current()) return
      synchronized(lock) { opened = true }
      emitState("opened", null)
      settle(gen, outcome("opened", null, gen, peerAddress))
    }

    override fun onOpenFailed(reason: Int) {
      if (!current()) return
      val name = reasonName(reason)
      clearIfCurrent(gen)
      emitState("open_failed", name)
      settle(gen, outcome("open_failed", "RangingSession.onOpenFailed: $name", gen, peerAddress))
    }

    override fun onStarted(peer: RangingDevice, technology: Int) {
      if (!current()) return
      emitState("started", null)
    }

    override fun onStopped(peer: RangingDevice, technology: Int) {
      if (!current()) return
      emitState("stopped", null)
    }

    override fun onClosed(reason: Int) {
      if (!current()) return
      val name = reasonName(reason)
      clearIfCurrent(gen)
      emitState("closed", name)
      settle(gen, outcome("open_failed", "RangingSession closed before it opened: $name", gen, peerAddress))
    }

    override fun onResults(peer: RangingDevice, data: RangingData) {
      if (!current()) return
      // The session holds one BLE CS peer; a sample from another technology is not ours.
      if (data.rangingTechnology != RangingManager.BLE_CS) return
      val distance = data.distance
      emit(
        "onChannelSoundingResult",
        mapOf(
          "sessionId" to gen,
          "deviceAddress" to peerAddress,
          "distanceMeters" to distance?.measurement,
          "confidence" to confidenceName(distance),
          "rssi" to (if (data.hasRssi()) data.rssi else null),
          "timestampMs" to data.timestampMillis,
        ),
      )
    }
  }
}
