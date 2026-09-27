package expo.modules.pixelnative

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import java.util.Locale

internal data class SpeechEngineInstall(
  val packageName: String,
  val label: String,
  val versionName: String?,
  val versionCode: Long?,
)

internal enum class SpeechEngineCacheAction { UNAVAILABLE, REINITIALIZE, REUSE }

/** Pure policy shared by the Android implementation and its focused JVM tests. */
internal object SpeechEnginePolicy {
  fun cacheAction(
    requestedPackage: String,
    cachedPackage: String?,
    cachedVersionName: String?,
    cachedVersionCode: Long?,
    installed: SpeechEngineInstall?,
    ready: Boolean,
  ): SpeechEngineCacheAction = when {
    installed == null -> SpeechEngineCacheAction.UNAVAILABLE
    !ready
      || cachedPackage != requestedPackage
      || cachedVersionName != installed.versionName
      || cachedVersionCode != installed.versionCode -> SpeechEngineCacheAction.REINITIALIZE
    else -> SpeechEngineCacheAction.REUSE
  }

  fun acceptsResolvedPackage(requestedPackage: String, resolvedPackage: String?): Boolean =
    resolvedPackage != null && requestedPackage == resolvedPackage

  fun voiceIdentity(
    name: String,
    locale: String,
    quality: Int,
    latency: Int,
    requiresNetwork: Boolean,
    features: Collection<String>,
  ): Map<String, Any?> = mapOf(
    "name" to name,
    "locale" to locale,
    "quality" to quality,
    "latency" to latency,
    "requiresNetwork" to requiresNetwork,
    "features" to features.sorted(),
  )
}

/**
 * Callback gate for one utterance. Android services are allowed to callback late or more than once;
 * only the first start and first terminal callback belong to the active utterance.
 */
internal class SpeechCallbackLifecycle(val utteranceId: String) {
  var status: String = "pending"
    private set
  val callbacks = mutableListOf<Map<String, Any?>>()

  fun record(type: String, at: Long, errorCode: String? = null, synthesisErrorCode: Int? = null): Boolean {
    if (
      status == "completed"
      || status == "failed"
      || status == "cancelled"
      || status == "replaced"
    ) return false
    when (type) {
      "start" -> {
        if (status != "pending") return false
        status = "started"
      }
      "done" -> status = "completed"
      "error" -> status = "failed"
      "stop" -> status = "cancelled"
      "replaced" -> status = "replaced"
      else -> return false
    }
    callbacks += buildMap {
      put("type", type)
      put("at", at)
      if (errorCode != null) put("errorCode", errorCode)
      if (synthesisErrorCode != null) put("synthesisErrorCode", synthesisErrorCode)
    }
    return true
  }
}

/**
 * Selects one installed Android TTS service for this app without changing the system default.
 *
 * Android does not expose the active service on every release. An explicit request is therefore
 * allowed to synthesize only when the active package can be observed and exactly matches the
 * request. Unknown identity is reported as unavailable rather than being presented as Kokoro,
 * Sherpa-ONNX, or any other requested engine.
 */
internal class ExplicitSpeechEngine(
  private val context: Context,
  private val handler: Handler,
  private val eventSink: (Map<String, Any?>) -> Unit,
) {
  private data class PendingSpeech(
    val promise: Promise,
    val detailed: Boolean,
    val requestedAt: Long,
    val textLength: Int,
    val rate: Float,
    val pitch: Float,
    val volume: Float,
    val language: String?,
    val voice: String?,
    val traceContext: Map<String, String?>,
    val lifecycle: SpeechCallbackLifecycle,
    var identity: Map<String, Any?>? = null,
    var identityResolvedAt: Long? = null,
    var startedAt: Long? = null,
  )

  private var engine: TextToSpeech? = null
  private var enginePackage: String? = null
  private var engineVersionName: String? = null
  private var engineVersionCode: Long? = null
  private var ready = false
  private var generation = 0
  private var timeout: Runnable? = null
  private var pending: PendingSpeech? = null
  private var preparationCompletion: ((Map<String, Any?>) -> Unit)? = null
  private var currentIdentity: Map<String, Any?>? = null
  private var lastStatus: Map<String, Any?> = mapOf("status" to "idle")

  fun installedEngines(): List<Map<String, Any?>> =
    installedEngineRecords().map { install ->
      mapOf(
        "packageName" to install.packageName,
        "label" to install.label,
        "versionName" to install.versionName,
        "versionCode" to install.versionCode,
        "installationOwner" to "external_app",
      )
    }

  fun resolve(
    packageName: String,
    language: String?,
    voice: String?,
    promise: Promise,
  ) {
    handler.post {
      if (packageName.isBlank()) {
        promise.resolve(unavailableIdentity(packageName, null, "invalid_request", "Speech engine package is required"))
        return@post
      }
      if (pending != null) {
        promise.resolve(unavailableIdentity(packageName, findInstalled(packageName), "busy", "Speech synthesis is already active"))
        return@post
      }
      prepare(packageName, language, voice) { identity -> promise.resolve(identity) }
    }
  }

  fun speak(
    packageName: String,
    text: String,
    rate: Float,
    pitch: Float,
    volume: Float,
    language: String?,
    voice: String?,
    requestedUtteranceId: String?,
    traceContext: Map<String, String?>,
    detailed: Boolean,
    promise: Promise,
  ) {
    handler.post {
      if (packageName.isBlank() || text.isBlank()) {
        returnImmediateFailure(
          packageName,
          text.length,
          requestedUtteranceId,
          traceContext,
          detailed,
          promise,
          "ERR_TTS_INPUT",
          "Speech engine and text are required",
        )
        return@post
      }

      pending?.let { previous ->
        engine?.stop()
        complete(previous, "replaced", "replaced", "ERR_TTS_REPLACED", "Speech was replaced by a newer utterance")
      }

      val utteranceId = requestedUtteranceId?.takeIf { it.isNotBlank() } ?: "pixelkit-${System.nanoTime()}"
      val request = PendingSpeech(
        promise = promise,
        detailed = detailed,
        requestedAt = System.currentTimeMillis(),
        textLength = text.length,
        rate = rate,
        pitch = pitch,
        volume = volume.coerceIn(0f, 1f),
        language = language,
        voice = voice,
        traceContext = traceContext,
        lifecycle = SpeechCallbackLifecycle(utteranceId),
      )
      pending = request
      lastStatus = statusMap(request, "preparing")

      prepare(packageName, language, voice) { identity ->
        if (pending !== request) return@prepare
        request.identity = identity
        request.identityResolvedAt = System.currentTimeMillis()
        if (identity["available"] != true) {
          val code = identity["errorCode"] as? String ?: "ERR_TTS_ENGINE"
          val message = identity["error"] as? String ?: "Requested speech engine is unavailable"
          complete(request, "failed", "error", code, message)
          return@prepare
        }
        startUtterance(request, text)
      }
    }
  }

  fun status(): Map<String, Any?> = buildMap {
    putAll(lastStatus)
    put("identity", currentIdentity)
    put("isSpeaking", engine?.isSpeaking == true)
  }

  fun stop() {
    handler.post {
      val request = pending
      val wasPreparing = preparationCompletion != null
      if (request != null) {
        complete(request, "cancelled", "stop", "ERR_TTS_CANCELLED", "Speech was cancelled")
      }
      cancelPreparation("Speech preparation was cancelled")
      if (wasPreparing) resetEngine() else engine?.stop()
      if (request == null && wasPreparing) {
        lastStatus = mapOf("status" to "unavailable", "identity" to currentIdentity)
      }
    }
  }

  fun isSpeaking(): Boolean = engine?.isSpeaking == true

  fun shutdown() {
    handler.post {
      val request = pending
      if (request != null) {
        complete(request, "cancelled", "stop", "ERR_TTS_CANCELLED", "Speech engine was destroyed")
      }
      cancelPreparation("Speech engine was destroyed")
      engine?.stop()
      resetEngine()
      lastStatus = mapOf("status" to "idle")
    }
  }

  private fun prepare(
    packageName: String,
    language: String?,
    voice: String?,
    completion: (Map<String, Any?>) -> Unit,
  ) {
    val installed = findInstalled(packageName)
    if (installed != null && installed.versionCode == null) {
      if (enginePackage == packageName) resetEngine()
      val identity = baseIdentity(
        packageName,
        installed,
        null,
        null,
        "unverified",
        false,
        "package_version_unobservable",
        "Android did not expose the installed speech engine version",
        "ERR_TTS_ENGINE",
      )
      publishIdentity(identity)
      completion(identity)
      return
    }
    when (SpeechEnginePolicy.cacheAction(packageName, enginePackage, engineVersionName, engineVersionCode, installed, ready)) {
      SpeechEngineCacheAction.UNAVAILABLE -> {
        if (preparationCompletion != null) {
          cancelPreparation("Speech engine preparation was replaced")
          resetEngine()
        } else if (enginePackage == packageName) {
          resetEngine()
        }
        val identity = unavailableIdentity(packageName, null, "missing", "Requested speech engine $packageName is not installed or visible")
        publishIdentity(identity)
        completion(identity)
      }
      SpeechEngineCacheAction.REUSE -> {
        val selected = engine
        if (selected == null || installed == null) {
          resetEngine()
          val identity = unavailableIdentity(packageName, installed, "disconnected", "Requested speech engine disconnected")
          publishIdentity(identity)
          completion(identity)
          return
        }
        val resolvedPackage = observeCurrentEngine(selected)
        if (!SpeechEnginePolicy.acceptsResolvedPackage(packageName, resolvedPackage)) {
          val reason = if (resolvedPackage == null) "identity_unobservable" else "binding_fallback"
          val message = if (resolvedPackage == null) {
            "Android no longer exposes the active TTS package; explicit engine identity is unavailable"
          } else {
            "Android selected $resolvedPackage instead of $packageName"
          }
          val identity = baseIdentity(
            packageName,
            installed,
            resolvedPackage,
            resolvedPackage?.let(::findInstalled),
            if (resolvedPackage == null) "unverified" else "fallback_rejected",
            false,
            reason,
            message,
            "ERR_TTS_ENGINE",
            if (resolvedPackage == null) "unavailable" else "active_engine_api",
          )
          publishIdentity(identity)
          resetEngine()
          completion(identity)
          return
        }
        val identity = configureAndIdentify(
          selected,
          installed,
          packageName,
          resolvedPackage,
          "active_engine_api",
          language,
          voice,
        )
        publishIdentity(identity)
        if (identity["available"] != true) resetEngine()
        completion(identity)
      }
      SpeechEngineCacheAction.REINITIALIZE -> {
        if (installed == null) {
          val identity = unavailableIdentity(packageName, null, "missing", "Requested speech engine $packageName is not installed or visible")
          publishIdentity(identity)
          completion(identity)
          return
        }
        initialize(installed, language, voice, completion)
      }
    }
  }

  private fun initialize(
    installed: SpeechEngineInstall,
    language: String?,
    voice: String?,
    completion: (Map<String, Any?>) -> Unit,
  ) {
    cancelPreparation("Speech engine preparation was replaced")
    resetEngine()
    val initGeneration = ++generation
    enginePackage = installed.packageName
    engineVersionName = installed.versionName
    engineVersionCode = installed.versionCode
    preparationCompletion = completion
    currentIdentity = baseIdentity(installed.packageName, installed, null, null, "initializing", false)
    lastStatus = mapOf("status" to "initializing", "identity" to currentIdentity)

    scheduleTimeout(15_000L) {
      if (initGeneration == generation && !ready) {
        val identity = unavailableIdentity(
          installed.packageName,
          findInstalled(installed.packageName),
          "initialization_timeout",
          "Requested speech engine did not initialize in time",
          "ERR_TTS_TIMEOUT",
        )
        finishPreparation(identity, reset = true)
      }
    }

    engine = TextToSpeech(context, { status ->
      handler.post {
        if (initGeneration != generation) return@post
        val selected = engine
        if (status != TextToSpeech.SUCCESS || selected == null) {
          val identity = unavailableIdentity(
            installed.packageName,
            findInstalled(installed.packageName),
            "initialization_failed",
            "Requested speech engine ${installed.packageName} could not initialize",
          )
          finishPreparation(identity, reset = true)
          return@post
        }

        val stillInstalled = findInstalled(installed.packageName)
        if (stillInstalled == null || stillInstalled.versionCode != installed.versionCode) {
          val identity = unavailableIdentity(
            installed.packageName,
            stillInstalled,
            if (stillInstalled == null) "removed_during_initialization" else "version_changed_during_initialization",
            if (stillInstalled == null) {
              "Requested speech engine was removed during initialization"
            } else {
              "Requested speech engine changed version during initialization"
            },
          )
          finishPreparation(identity, reset = true)
          return@post
        }

        val resolvedPackage = observeCurrentEngine(selected)
        if (!SpeechEnginePolicy.acceptsResolvedPackage(installed.packageName, resolvedPackage)) {
          val reason = if (resolvedPackage == null) "identity_unobservable" else "binding_fallback"
          val message = if (resolvedPackage == null) {
            "Android did not expose the active TTS package; explicit engine identity is unavailable"
          } else {
            "Android selected $resolvedPackage instead of ${installed.packageName}"
          }
          val identity = baseIdentity(
            installed.packageName,
            stillInstalled,
            resolvedPackage,
            resolvedPackage?.let(::findInstalled),
            if (resolvedPackage == null) "unverified" else "fallback_rejected",
            false,
            reason,
            message,
            "ERR_TTS_ENGINE",
            if (resolvedPackage == null) "unavailable" else "active_engine_api",
          )
          finishPreparation(identity, reset = true)
          return@post
        }

        selected.setOnUtteranceProgressListener(progressListener)
        ready = true
        val identity = configureAndIdentify(
          selected,
          stillInstalled,
          installed.packageName,
          resolvedPackage,
          "active_engine_api",
          language,
          voice,
        )
        if (identity["available"] == true) {
          finishPreparation(identity, reset = false)
        } else {
          finishPreparation(identity, reset = true)
        }
      }
    }, installed.packageName)
  }

  private val progressListener = object : UtteranceProgressListener() {
    override fun onStart(id: String) {
      handler.post {
        val request = pending
        if (request == null || request.lifecycle.utteranceId != id) return@post
        val at = System.currentTimeMillis()
        if (!request.lifecycle.record("start", at)) return@post
        request.startedAt = at
        lastStatus = statusMap(request, "started")
        emit(request, "start", at)
      }
    }

    override fun onDone(id: String) {
      handler.post {
        val request = pending
        if (request == null || request.lifecycle.utteranceId != id) return@post
        complete(request, "completed", "done", null, null)
      }
    }

    override fun onError(id: String) {
      handler.post {
        val request = pending
        if (request == null || request.lifecycle.utteranceId != id) return@post
        complete(request, "failed", "error", "ERR_TTS_PLAYBACK", "Speech engine failed during synthesis")
      }
    }

    override fun onError(id: String, errorCode: Int) {
      handler.post {
        val request = pending
        if (request == null || request.lifecycle.utteranceId != id) return@post
        complete(
          request,
          "failed",
          "error",
          synthesisErrorName(errorCode),
          "Speech engine failed during synthesis ($errorCode)",
          errorCode,
        )
      }
    }

    override fun onStop(id: String, interrupted: Boolean) {
      handler.post {
        val request = pending
        if (request == null || request.lifecycle.utteranceId != id) return@post
        if (interrupted) {
          complete(request, "cancelled", "stop", "ERR_TTS_INTERRUPTED", "Speech was interrupted")
        } else {
          complete(request, "completed", "done", null, null)
        }
      }
    }
  }

  private fun startUtterance(request: PendingSpeech, text: String) {
    val selected = engine
    if (selected == null) {
      invalidateIdentity(request, findInstalled(enginePackage.orEmpty()), "disconnected", "Speech engine disconnected")
      complete(request, "failed", "error", "ERR_TTS_ENGINE", "Speech engine disconnected")
      return
    }
    val install = findInstalled(enginePackage.orEmpty())
    if (
      install == null
      || install.versionName != engineVersionName
      || install.versionCode != engineVersionCode
    ) {
      val reason = if (install == null) "removed_before_synthesis" else "version_changed_before_synthesis"
      val message = if (install == null) {
        "Requested speech engine was removed before synthesis"
      } else {
        "Requested speech engine changed version before synthesis"
      }
      invalidateIdentity(request, install, reason, message)
      resetEngine()
      complete(request, "failed", "error", "ERR_TTS_ENGINE", message)
      return
    }

    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, request.volume) }
    val setupError = when {
      selected.setSpeechRate(request.rate) != TextToSpeech.SUCCESS -> "Speech engine rejected the requested rate"
      selected.setPitch(request.pitch) != TextToSpeech.SUCCESS -> "Speech engine rejected the requested pitch"
      else -> null
    }
    if (setupError != null) {
      complete(request, "failed", "error", "ERR_TTS_CONFIGURATION", setupError)
      return
    }

    val result = runCatching {
      selected.speak(text, TextToSpeech.QUEUE_FLUSH, params, request.lifecycle.utteranceId)
    }
    if (result.getOrNull() != TextToSpeech.SUCCESS) {
      complete(
        request,
        "failed",
        "error",
        "ERR_TTS_PLAYBACK",
        result.exceptionOrNull()?.message ?: "Speech engine rejected the utterance",
      )
      return
    }

    val playbackLimitMs = (30_000L + text.length * 300L).coerceAtMost(180_000L)
    scheduleTimeout(playbackLimitMs) {
      if (pending === request) {
        resetEngine()
        complete(request, "failed", "error", "ERR_TTS_TIMEOUT", "Speech engine did not finish playback in time")
      }
    }
  }

  private fun configureAndIdentify(
    selected: TextToSpeech,
    installed: SpeechEngineInstall,
    requestedPackage: String,
    resolvedPackage: String?,
    evidence: String,
    language: String?,
    voiceName: String?,
  ): Map<String, Any?> {
    var configurationError: String? = null
    if (!voiceName.isNullOrBlank()) {
      val requestedVoice = selected.voices?.firstOrNull { it.name == voiceName }
      if (requestedVoice == null || selected.setVoice(requestedVoice) != TextToSpeech.SUCCESS) {
        configurationError = "Requested voice $voiceName is unavailable from $requestedPackage"
      }
    } else if (!language.isNullOrBlank()) {
      val locale = Locale.forLanguageTag(language)
      val availability = selected.isLanguageAvailable(locale)
      if (availability < TextToSpeech.LANG_AVAILABLE || selected.setLanguage(locale) < TextToSpeech.LANG_AVAILABLE) {
        configurationError = "Requested locale $language is unavailable from $requestedPackage"
      }
    }

    val identity = baseIdentity(
      requestedPackage,
      installed,
      resolvedPackage,
      installed,
      if (configurationError == null) "ready" else "configuration_failed",
      configurationError == null,
      if (configurationError == null) null else "voice_or_locale_unavailable",
      configurationError,
      if (configurationError == null) null else "ERR_TTS_CONFIGURATION",
      evidence,
    ).toMutableMap()
    identity["selectedVoice"] = voiceIdentity(selected.voice)
    identity["selectedLocale"] = selected.voice?.locale?.toLanguageTag()
      ?: selected.language?.toLanguageTag()
    return identity
  }

  private fun baseIdentity(
    requestedPackage: String,
    installed: SpeechEngineInstall?,
    resolvedPackage: String?,
    resolvedInstall: SpeechEngineInstall?,
    initializationStatus: String,
    available: Boolean,
    unavailableReason: String? = null,
    error: String? = null,
    errorCode: String? = null,
    bindingEvidence: String = "unavailable",
  ): Map<String, Any?> = buildMap {
    put("audioSource", "android_tts")
    put("requestedPackage", requestedPackage)
    put("installedPackage", installed?.packageName)
    put("installedVersionName", installed?.versionName)
    put("installedVersionCode", installed?.versionCode)
    put("resolvedEnginePackage", resolvedPackage)
    put("resolvedEngineName", resolvedInstall?.label)
    put("initializationStatus", initializationStatus)
    put("available", available)
    put("identityVerified", available && SpeechEnginePolicy.acceptsResolvedPackage(requestedPackage, resolvedPackage))
    put("bindingEvidence", bindingEvidence)
    put("selectedVoice", null)
    put("selectedLocale", null)
    put("executionProvider", null)
    put("executionProviderObserved", false)
    put("installationOwner", "external_app")
    put("managesExternalInstallOrModels", false)
    if (unavailableReason != null) put("unavailableReason", unavailableReason)
    if (error != null) put("error", error)
    if (errorCode != null) put("errorCode", errorCode)
  }

  private fun unavailableIdentity(
    requestedPackage: String,
    installed: SpeechEngineInstall?,
    reason: String,
    error: String,
    errorCode: String = "ERR_TTS_ENGINE",
  ): Map<String, Any?> = baseIdentity(
    requestedPackage,
    installed,
    null,
    null,
    if (reason == "missing") "unavailable" else "failed",
    false,
    reason,
    error,
    errorCode,
  )

  private fun voiceIdentity(voice: Voice?): Map<String, Any?>? = voice?.let {
    SpeechEnginePolicy.voiceIdentity(
      it.name,
      it.locale.toLanguageTag(),
      it.quality,
      it.latency,
      it.isNetworkConnectionRequired,
      it.features,
    )
  }

  private fun observeCurrentEngine(selected: TextToSpeech): String? =
    runCatching {
      TextToSpeech::class.java.methods
        .firstOrNull { it.name == "getCurrentEngine" && it.parameterCount == 0 }
        ?.invoke(selected) as? String
    }.getOrNull()

  private fun installedEngineRecords(): List<SpeechEngineInstall> {
    val packageManager = context.packageManager
    val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
    return packageManager.queryIntentServices(intent, 0).mapNotNull { service ->
      val packageName = service.serviceInfo?.packageName ?: return@mapNotNull null
      val packageInfo = runCatching { packageManager.getPackageInfo(packageName, 0) }.getOrNull()
      SpeechEngineInstall(
        packageName,
        service.loadLabel(packageManager).toString(),
        packageInfo?.versionName,
        packageInfo?.compatVersionCode(),
      )
    }.distinctBy { it.packageName }
  }

  private fun PackageInfo.compatVersionCode(): Long {
    if (Build.VERSION.SDK_INT >= 28) return longVersionCode
    @Suppress("DEPRECATION")
    return versionCode.toLong()
  }

  private fun findInstalled(packageName: String): SpeechEngineInstall? =
    installedEngineRecords().firstOrNull { it.packageName == packageName }

  private fun invalidateIdentity(
    request: PendingSpeech,
    installed: SpeechEngineInstall?,
    reason: String,
    error: String,
  ) {
    val identity = request.identity?.toMutableMap() ?: mutableMapOf()
    identity["installedPackage"] = installed?.packageName
    identity["installedVersionName"] = installed?.versionName
    identity["installedVersionCode"] = installed?.versionCode
    identity["initializationStatus"] = "failed"
    identity["available"] = false
    identity["identityVerified"] = false
    identity["unavailableReason"] = reason
    identity["error"] = error
    identity["errorCode"] = "ERR_TTS_ENGINE"
    request.identity = identity
    publishIdentity(identity)
  }

  private fun publishIdentity(identity: Map<String, Any?>) {
    currentIdentity = identity
    lastStatus = mapOf(
      "status" to if (identity["available"] == true) "ready" else "unavailable",
      "identity" to identity,
    )
  }

  private fun finishPreparation(identity: Map<String, Any?>, reset: Boolean) {
    clearTimeout()
    if (reset) resetEngine()
    publishIdentity(identity)
    val completion = preparationCompletion
    preparationCompletion = null
    completion?.invoke(identity)
  }

  private fun cancelPreparation(message: String) {
    val completion = preparationCompletion ?: return
    preparationCompletion = null
    clearTimeout()
    val requestedPackage = enginePackage.orEmpty()
    val identity = unavailableIdentity(requestedPackage, findInstalled(requestedPackage), "cancelled", message, "ERR_TTS_CANCELLED")
    currentIdentity = identity
    completion(identity)
  }

  private fun complete(
    request: PendingSpeech,
    status: String,
    callbackType: String,
    errorCode: String?,
    error: String?,
    synthesisErrorCode: Int? = null,
  ) {
    if (pending !== request) return
    val at = System.currentTimeMillis()
    if (!request.lifecycle.record(callbackType, at, errorCode, synthesisErrorCode)) return
    clearTimeout()
    emit(request, callbackType, at, errorCode, error, synthesisErrorCode)
    val result = resultMap(request, status, at, errorCode, error, synthesisErrorCode)
    lastStatus = result
    pending = null
    if (request.detailed) {
      request.promise.resolve(result)
    } else if (status == "failed") {
      request.promise.reject(errorCode ?: "ERR_TTS_PLAYBACK", error ?: "Speech engine failed", null)
    } else {
      request.promise.resolve(null)
    }
  }

  private fun returnImmediateFailure(
    packageName: String,
    textLength: Int,
    requestedUtteranceId: String?,
    traceContext: Map<String, String?>,
    detailed: Boolean,
    promise: Promise,
    errorCode: String,
    error: String,
  ) {
    val at = System.currentTimeMillis()
    val request = PendingSpeech(
      promise,
      detailed,
      at,
      textLength,
      1f,
      1f,
      1f,
      null,
      null,
      traceContext,
      SpeechCallbackLifecycle(requestedUtteranceId ?: "pixelkit-${System.nanoTime()}"),
      unavailableIdentity(packageName, findInstalled(packageName), "invalid_request", error, errorCode),
      at,
    )
    request.lifecycle.record("error", at, errorCode)
    val result = resultMap(request, "failed", at, errorCode, error, null)
    lastStatus = result
    emit(request, "error", at, errorCode, error)
    if (detailed) promise.resolve(result) else promise.reject(errorCode, error, null)
  }

  private fun resultMap(
    request: PendingSpeech,
    status: String,
    terminalAt: Long,
    errorCode: String?,
    error: String?,
    synthesisErrorCode: Int?,
  ): Map<String, Any?> = buildMap {
    put("status", status)
    put("identity", request.identity)
    put("utteranceId", request.lifecycle.utteranceId)
    put("requestedAt", request.requestedAt)
    put("identityResolvedAt", request.identityResolvedAt)
    put("startedAt", request.startedAt)
    put("completedAt", if (status == "completed") terminalAt else null)
    put("failedAt", if (status == "failed") terminalAt else null)
    put("cancelledAt", if (status == "cancelled" || status == "replaced") terminalAt else null)
    put("callbacks", request.lifecycle.callbacks.toList())
    put("errorCode", errorCode)
    put("error", error)
    put("synthesisErrorCode", synthesisErrorCode)
    put("textLength", request.textLength)
    put("traceContext", request.traceContext)
  }

  private fun statusMap(request: PendingSpeech, status: String): Map<String, Any?> = buildMap {
    put("status", status)
    put("identity", request.identity)
    put("utteranceId", request.lifecycle.utteranceId)
    put("requestedAt", request.requestedAt)
    put("identityResolvedAt", request.identityResolvedAt)
    put("startedAt", request.startedAt)
    put("callbacks", request.lifecycle.callbacks.toList())
    put("traceContext", request.traceContext)
  }

  private fun emit(
    request: PendingSpeech,
    callbackType: String,
    at: Long,
    errorCode: String? = null,
    error: String? = null,
    synthesisErrorCode: Int? = null,
  ) {
    eventSink(buildMap {
      put("callback", callbackType)
      put("callbackAt", at)
      put("utteranceId", request.lifecycle.utteranceId)
      put("status", request.lifecycle.status)
      put("identity", request.identity)
      put("traceContext", request.traceContext)
      if (errorCode != null) put("errorCode", errorCode)
      if (error != null) put("error", error)
      if (synthesisErrorCode != null) put("synthesisErrorCode", synthesisErrorCode)
    })
  }

  private fun synthesisErrorName(errorCode: Int): String = when (errorCode) {
    TextToSpeech.ERROR_INVALID_REQUEST -> "ERR_TTS_INVALID_REQUEST"
    TextToSpeech.ERROR_NETWORK -> "ERR_TTS_NETWORK"
    TextToSpeech.ERROR_NETWORK_TIMEOUT -> "ERR_TTS_NETWORK_TIMEOUT"
    TextToSpeech.ERROR_NOT_INSTALLED_YET -> "ERR_TTS_NOT_INSTALLED"
    TextToSpeech.ERROR_OUTPUT -> "ERR_TTS_OUTPUT"
    TextToSpeech.ERROR_SERVICE -> "ERR_TTS_SERVICE"
    TextToSpeech.ERROR_SYNTHESIS -> "ERR_TTS_SYNTHESIS"
    else -> "ERR_TTS_PLAYBACK"
  }

  private fun scheduleTimeout(delayMs: Long, action: () -> Unit) {
    clearTimeout()
    val task = Runnable {
      timeout = null
      action()
    }
    timeout = task
    handler.postDelayed(task, delayMs)
  }

  private fun clearTimeout() {
    timeout?.let(handler::removeCallbacks)
    timeout = null
  }

  private fun resetEngine() {
    generation++
    clearTimeout()
    engine?.stop()
    engine?.shutdown()
    engine = null
    enginePackage = null
    engineVersionName = null
    engineVersionCode = null
    ready = false
  }
}
