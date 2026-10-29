package expo.modules.pixelnative

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
import android.ranging.SessionConfig
import android.ranging.raw.RawInitiatorRangingConfig
import android.ranging.raw.RawRangingDevice
import android.ranging.raw.RawResponderRangingConfig
import android.ranging.uwb.UwbAddress
import android.ranging.uwb.UwbComplexChannel
import android.ranging.uwb.UwbRangingParams
import expo.modules.kotlin.Promise
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Peer configuration for one UWB ranging session. UWB ranging needs a second device: the addresses,
 * session id and channel parameters must be the ones agreed with that peer over an out-of-band
 * channel (BLE, NFC, QR), so every field here is supplied by the caller and none is defaulted
 * except the optional tuning fields.
 */
internal data class UwbSessionRequest(
  val sessionId: Int,
  val initiator: Boolean,
  val configId: Int,
  val localAddress: ByteArray,
  val peerAddress: ByteArray,
  val channel: Int?,
  val preambleIndex: Int?,
  val sessionKeyInfo: ByteArray?,
  /** 'normal' | 'infrequent' | 'frequent', or null for the platform default. */
  val updateRate: String?,
  val slotDurationMs: Int?,
  val angleOfArrival: Boolean,
)

internal sealed class UwbRequestParse {
  class Ok(val request: UwbSessionRequest) : UwbRequestParse()
  class Invalid(val problems: List<String>) : UwbRequestParse()
}

/** Pure parsing of the JS config map; no Android types, so it is covered by a JVM unit test. */
internal object UwbRequestParser {
  /** android.ranging.uwb.UwbRangingParams CONFIG_* ids are 1..6. */
  private val CONFIG_IDS = 1..6
  private val UPDATE_RATES = setOf("normal", "infrequent", "frequent")

  /** Accepts "1234", "0x1234", "12:34" or "12-34". Returns null for anything that is not whole hex bytes. */
  fun hexBytes(value: Any?): ByteArray? {
    val raw = (value as? String)?.trim() ?: return null
    val stripped = raw.removePrefix("0x").removePrefix("0X").filterNot { it == ':' || it == '-' || it == ' ' }
    if (stripped.isEmpty() || stripped.length % 2 != 0) return null
    if (!stripped.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
    return ByteArray(stripped.length / 2) { i -> stripped.substring(i * 2, i * 2 + 2).toInt(16).toByte() }
  }

  private fun intOf(value: Any?): Int? {
    val n = value as? Number ?: return null
    val d = n.toDouble()
    return if (d == Math.rint(d) && d >= Int.MIN_VALUE && d <= Int.MAX_VALUE) d.toInt() else null
  }

  private fun addressOf(config: Map<String, Any?>, key: String, problems: MutableList<String>): ByteArray? {
    val bytes = hexBytes(config[key])
    if (bytes == null) {
      problems += "$key must be hex address bytes (2-byte short or 8-byte extended)"
      return null
    }
    if (bytes.size != 2 && bytes.size != 8) {
      problems += "$key must be 2 bytes (short address) or 8 bytes (extended address), got ${bytes.size}"
      return null
    }
    return bytes
  }

  fun parse(config: Map<String, Any?>?): UwbRequestParse {
    if (config == null) {
      return UwbRequestParse.Invalid(listOf("a peer configuration is required: sessionId, role, localAddress, peerAddress"))
    }
    val problems = mutableListOf<String>()

    val sessionId = intOf(config["sessionId"])
    if (sessionId == null) problems += "sessionId must be an integer agreed with the peer"

    val role = config["role"] as? String
    if (role != "initiator" && role != "responder") problems += "role must be 'initiator' or 'responder'"

    val local = addressOf(config, "localAddress", problems)
    val peer = addressOf(config, "peerAddress", problems)

    val configId = if (config["configId"] == null) 1 else intOf(config["configId"])
    if (configId == null || configId !in CONFIG_IDS) problems += "configId must be an integer 1..6"

    val channel = if (config["channel"] == null) null else intOf(config["channel"])
    val preamble = if (config["preambleIndex"] == null) null else intOf(config["preambleIndex"])
    if (config["channel"] != null && channel == null) problems += "channel must be an integer"
    if (config["preambleIndex"] != null && preamble == null) problems += "preambleIndex must be an integer"
    if ((channel == null) != (preamble == null) && problems.none { it.startsWith("channel") || it.startsWith("preambleIndex") }) {
      problems += "channel and preambleIndex must be supplied together"
    }

    var sessionKey: ByteArray? = null
    if (config["sessionKeyInfo"] != null) {
      sessionKey = hexBytes(config["sessionKeyInfo"])
      if (sessionKey == null) problems += "sessionKeyInfo must be hex bytes"
    }

    val rate = config["updateRate"] as? String
    if (config["updateRate"] != null && rate !in UPDATE_RATES) problems += "updateRate must be 'normal', 'infrequent' or 'frequent'"

    val slot = if (config["slotDurationMs"] == null) null else intOf(config["slotDurationMs"])
    if (config["slotDurationMs"] != null && slot != 1 && slot != 2) problems += "slotDurationMs must be 1 or 2"

    if (problems.isNotEmpty() || sessionId == null || local == null || peer == null || configId == null) {
      return UwbRequestParse.Invalid(problems)
    }
    return UwbRequestParse.Ok(
      UwbSessionRequest(
        sessionId = sessionId,
        initiator = role == "initiator",
        configId = configId,
        localAddress = local,
        peerAddress = peer,
        channel = channel,
        preambleIndex = preamble,
        sessionKeyInfo = sessionKey,
        updateRate = rate,
        slotDurationMs = slot,
        angleOfArrival = config["angleOfArrival"] == true,
      )
    )
  }
}

/**
 * One real UWB ranging session through the Android 16 (API 36) `android.ranging.RangingManager`.
 *
 * `start` builds a RAW UWB session from the caller-supplied peer configuration, opens it with
 * `RangingSession.start`, and resolves once the platform reports `onOpened` or `onOpenFailed`.
 * Measurements arrive as `onUwbRangingResult` events and lifecycle changes as `onUwbRangingState`
 * events; every value comes from `android.ranging.RangingData`. Nothing is emitted when the peer
 * does not answer. At most one session exists at a time.
 */
internal class UwbRangingController(
  private val context: Context,
  private val mainHandler: Handler,
  private val emit: (String, Map<String, Any?>) -> Unit,
) {
  private val lock = Any()
  private var session: RangingSession? = null
  private var activeSessionId: Int? = null
  private var opened = false
  private var generation = 0
  private var pending: Promise? = null
  private var pendingTimeout: Runnable? = null

  private companion object {
    const val OPEN_TIMEOUT_MS = 10_000L
    const val CAPABILITIES_TIMEOUT_MS = 2_000L
    const val RANGING_PERMISSION = "android.permission.RANGING"
  }

  private fun rangingManager(): RangingManager? =
    if (Build.VERSION.SDK_INT >= 36) context.getSystemService(RangingManager::class.java) else null

  private fun outcome(status: String, error: String?, sessionId: Int?): Map<String, Any?> {
    val serviceAvailable = rangingManager() != null
    return mapOf(
      "success" to (status == "opened"),
      "status" to status,
      "error" to error,
      "sessionId" to sessionId,
      "technology" to "UWB",
      "serviceAvailable" to serviceAvailable,
      "serviceName" to (if (serviceAvailable) "RangingManager" else null),
      "rangingFeature" to context.packageManager.hasSystemFeature("android.hardware.ranging"),
      "timestampMs" to System.currentTimeMillis(),
    )
  }

  fun start(config: Map<String, Any?>?, promise: Promise) {
    if (!context.packageManager.hasSystemFeature("android.hardware.uwb")) {
      promise.resolve(outcome("uwb_unsupported", "Device does not declare android.hardware.uwb", null))
      return
    }
    if (Build.VERSION.SDK_INT < 36) {
      promise.resolve(
        outcome(
          "ranging_api_unavailable",
          "android.ranging.RangingManager requires Android 16 (API 36); this device is API ${Build.VERSION.SDK_INT}",
          null,
        )
      )
      return
    }
    val manager = rangingManager()
    if (manager == null) {
      promise.resolve(outcome("ranging_api_unavailable", "getSystemService(RangingManager) returned null", null))
      return
    }

    val request = when (val parsed = UwbRequestParser.parse(config)) {
      is UwbRequestParse.Invalid -> {
        promise.resolve(outcome("needs_peer_configuration", parsed.problems.joinToString("; "), null))
        return
      }
      is UwbRequestParse.Ok -> parsed.request
    }

    if (context.checkSelfPermission(RANGING_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
      promise.resolve(
        outcome(
          "permission_denied",
          "$RANGING_PERMISSION is not granted; the app must declare it in its manifest and request it at runtime",
          request.sessionId,
        )
      )
      return
    }

    var gen = -1
    var busy = false
    var busySessionId: Int? = null
    synchronized(lock) {
      if (session != null || pending != null) {
        busy = true
        busySessionId = activeSessionId
      } else {
        generation += 1
        gen = generation
        activeSessionId = request.sessionId
        opened = false
        pending = promise
      }
    }
    if (busy) {
      promise.resolve(outcome("session_active", "UWB session $busySessionId is already running; stop it first", busySessionId))
      return
    }

    // From here the start promise is owned by `pending`; every exit goes through finish().
    try {
      val availability = uwbAvailability(manager)
      val unavailable = when (availability) {
        null, RangingCapabilities.ENABLED -> null
        RangingCapabilities.NOT_SUPPORTED -> "uwb_unsupported" to "RangingManager reports UWB as not supported"
        RangingCapabilities.DISABLED_USER -> "uwb_disabled" to "UWB is switched off in system settings"
        RangingCapabilities.DISABLED_REGULATORY -> "uwb_disabled" to "UWB is disabled by a regulatory restriction in the current region"
        RangingCapabilities.DISABLED_USER_RESTRICTIONS -> "uwb_disabled" to "UWB is disabled by user restrictions"
        else -> "uwb_disabled" to "RangingManager reports UWB availability code $availability"
      }
      if (unavailable != null) {
        finish(gen, outcome(unavailable.first, unavailable.second, request.sessionId))
        return
      }

      val preference = try {
        buildPreference(request)
      } catch (e: IllegalArgumentException) {
        finish(gen, outcome("invalid_parameters", e.message ?: "The platform rejected the UWB parameters", request.sessionId))
        return
      }

      val newSession = manager.createRangingSession(context.mainExecutor, SessionCallback(gen, request.sessionId))
      if (newSession == null) {
        finish(gen, outcome("open_failed", "RangingManager.createRangingSession returned null", request.sessionId))
        return
      }
      synchronized(lock) { session = newSession }

      val timeout = Runnable {
        val stillPending = synchronized(lock) { generation == gen && pending != null }
        if (stillPending) {
          finish(gen, outcome("open_failed", "RangingSession reported neither onOpened nor onOpenFailed within $OPEN_TIMEOUT_MS ms", request.sessionId))
        }
      }
      synchronized(lock) { pendingTimeout = timeout }
      mainHandler.postDelayed(timeout, OPEN_TIMEOUT_MS)

      newSession.start(preference)
    } catch (e: SecurityException) {
      finish(gen, outcome("permission_denied", e.message ?: "SecurityException while opening the UWB session", request.sessionId))
    } catch (e: Throwable) {
      finish(gen, outcome("open_failed", e.message ?: e.javaClass.simpleName, request.sessionId))
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
      activeSessionId = null
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
      activeSessionId = null
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
    val sid: Int?
    val hadSession: Boolean
    val hadPending: Boolean
    synchronized(lock) {
      gen = generation
      sid = activeSessionId
      hadSession = session != null
      hadPending = pending != null
    }
    if (!hadSession && !hadPending) {
      return mapOf("wasActive" to false, "closed" to false, "sessionId" to null, "error" to null, "timestampMs" to System.currentTimeMillis())
    }
    val error = teardown(gen)
    if (hadPending) {
      settle(gen, outcome("open_failed", "Session was stopped before the platform reported onOpened", sid))
    }
    return mapOf(
      "wasActive" to true,
      "closed" to (error == null),
      "sessionId" to sid,
      "error" to error,
      "timestampMs" to System.currentTimeMillis(),
    )
  }

  fun state(): Map<String, Any?> = synchronized(lock) {
    mapOf("active" to (session != null), "opened" to opened, "sessionId" to activeSessionId)
  }

  private fun uwbAvailability(manager: RangingManager): Int? {
    val latch = CountDownLatch(1)
    val value = AtomicReference<Int?>(null)
    val executor = Executors.newSingleThreadExecutor()
    val callback = RangingManager.RangingCapabilitiesCallback { capabilities ->
      value.set(capabilities.technologyAvailability[RangingManager.UWB])
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

  private fun buildPreference(req: UwbSessionRequest): RangingPreference {
    val params = UwbRangingParams.Builder(
      req.sessionId,
      req.configId,
      UwbAddress.fromBytes(req.localAddress),
      UwbAddress.fromBytes(req.peerAddress),
    ).apply {
      if (req.channel != null && req.preambleIndex != null) {
        setComplexChannel(
          UwbComplexChannel.Builder().setChannel(req.channel).setPreambleIndex(req.preambleIndex).build()
        )
      }
      req.sessionKeyInfo?.let { setSessionKeyInfo(it) }
      when (req.updateRate) {
        "frequent" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_FREQUENT)
        "infrequent" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_INFREQUENT)
        "normal" -> setRangingUpdateRate(RawRangingDevice.UPDATE_RATE_NORMAL)
      }
      req.slotDurationMs?.let { setSlotDuration(it) }
    }.build()

    val peerDevice = RawRangingDevice.Builder()
      .setRangingDevice(RangingDevice.Builder().setUuid(UUID.randomUUID()).build())
      .setUwbRangingParams(params)
      .build()

    val rangingConfig: android.ranging.RangingConfig = if (req.initiator) {
      RawInitiatorRangingConfig.Builder().addRawRangingDevice(peerDevice).build()
    } else {
      RawResponderRangingConfig.Builder().setRawRangingDevice(peerDevice).build()
    }

    val role = if (req.initiator) RangingPreference.DEVICE_ROLE_INITIATOR else RangingPreference.DEVICE_ROLE_RESPONDER
    return RangingPreference.Builder(role, rangingConfig)
      .setSessionConfig(SessionConfig.Builder().setAngleOfArrivalNeeded(req.angleOfArrival).build())
      .build()
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
    private val sessionId: Int,
  ) : RangingSession.Callback {
    private fun current(): Boolean = synchronized(lock) { generation == gen }

    private fun emitState(state: String, device: RangingDevice?, reason: String?) {
      emit(
        "onUwbRangingState",
        mapOf(
          "sessionId" to sessionId,
          "state" to state,
          "deviceId" to device?.uuid?.toString(),
          "reason" to reason,
          "timestampMs" to System.currentTimeMillis(),
        ),
      )
    }

    override fun onOpened() {
      if (!current()) return
      synchronized(lock) { opened = true }
      emitState("opened", null, null)
      settle(gen, outcome("opened", null, sessionId))
    }

    override fun onOpenFailed(reason: Int) {
      if (!current()) return
      val name = reasonName(reason)
      clearIfCurrent(gen)
      emitState("open_failed", null, name)
      settle(gen, outcome("open_failed", "RangingSession.onOpenFailed: $name", sessionId))
    }

    override fun onStarted(peer: RangingDevice, technology: Int) {
      if (!current()) return
      emitState("started", peer, null)
    }

    override fun onStopped(peer: RangingDevice, technology: Int) {
      if (!current()) return
      emitState("stopped", peer, null)
    }

    override fun onClosed(reason: Int) {
      if (!current()) return
      val name = reasonName(reason)
      clearIfCurrent(gen)
      emitState("closed", null, name)
      settle(gen, outcome("open_failed", "RangingSession closed before it opened: $name", sessionId))
    }

    override fun onResults(peer: RangingDevice, data: RangingData) {
      if (!current()) return
      val distance = data.distance
      val azimuth = data.azimuth
      val elevation = data.elevation
      emit(
        "onUwbRangingResult",
        mapOf(
          "sessionId" to sessionId,
          "deviceId" to peer.uuid.toString(),
          "distanceMeters" to distance?.measurement,
          "distanceConfidence" to confidenceName(distance),
          "azimuthDegrees" to azimuth?.measurement,
          "azimuthConfidence" to confidenceName(azimuth),
          "elevationDegrees" to elevation?.measurement,
          "elevationConfidence" to confidenceName(elevation),
          "rssi" to (if (data.hasRssi()) data.rssi else null),
          "technology" to "UWB",
          "timestampMs" to data.timestampMillis,
        ),
      )
    }
  }
}
