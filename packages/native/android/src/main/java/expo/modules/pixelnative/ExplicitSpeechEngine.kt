package expo.modules.pixelnative

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.util.Log
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import expo.modules.kotlin.Promise

/** Selects an installed Android TTS engine for this app without changing the system default. */
internal class ExplicitSpeechEngine(private val context: Context, private val handler: Handler) {
  private var engine: TextToSpeech? = null
  private var enginePackage: String? = null
  private var ready = false
  private var pending: Promise? = null
  private var pendingText: String? = null
  private var pendingRate = 1f
  private var pendingPitch = 1f
  private var pendingVolume = 1f
  private var utteranceId: String? = null
  private var generation = 0
  private var timeout: Runnable? = null

  fun installedEngines(): List<Map<String, String>> {
    val packageManager = context.packageManager
    val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
    return packageManager.queryIntentServices(intent, 0).mapNotNull { service ->
      val packageName = service.serviceInfo?.packageName ?: return@mapNotNull null
      mapOf("packageName" to packageName, "label" to service.loadLabel(packageManager).toString())
    }
  }

  fun speak(packageName: String, text: String, rate: Float, pitch: Float, volume: Float, promise: Promise) {
    handler.post {
      if (packageName.isBlank() || text.isBlank()) {
        promise.reject("ERR_TTS_INPUT", "Speech engine and text are required", null)
        return@post
      }
      if (installedEngines().none { it["packageName"] == packageName }) {
        promise.reject("ERR_TTS_ENGINE", "Requested speech engine $packageName is not installed or visible", null)
        return@post
      }
      // A new utterance replaces the previous one, as Android's QUEUE_FLUSH
      // contract implies. Some third-party engines never send onDone/onStop;
      // keeping their promise pending would otherwise block every later call.
      if (pending != null) {
        generation++
        val previous = utteranceId
        finish()
        if (previous != null) engine?.stop()
      }
      pending = promise
      pendingText = text
      pendingRate = rate
      pendingPitch = pitch
      pendingVolume = volume.coerceIn(0f, 1f)
      if (enginePackage == packageName && ready && engine != null) {
        startUtterance()
        return@post
      }
      engine?.shutdown()
      engine = null
      ready = false
      enginePackage = packageName
      val currentGeneration = ++generation
      scheduleTimeout(15_000L) {
        if (pending != null && generation == currentGeneration && !ready) {
          resetEngine()
          fail("ERR_TTS_TIMEOUT", "Requested speech engine did not initialize in time")
        }
      }
      // The callback can race the constructor assignment. Posting it to the main
      // handler ensures `engine` has been assigned before it is inspected.
      engine = TextToSpeech(context, { status ->
        handler.post {
          if (currentGeneration != generation) return@post
          val selected = engine
          if (status != TextToSpeech.SUCCESS || selected == null) {
            resetEngine()
            fail("ERR_TTS_ENGINE", "Requested speech engine $packageName could not initialize")
            return@post
          }
          // getDefaultEngine() names the phone-wide preference, not this instance.
          // Android exposes getCurrentEngine() only as a hidden API; use it as an
          // optional check, never as the sole proof that an explicit request worked.
          val currentEngine = runCatching {
            TextToSpeech::class.java.getMethod("getCurrentEngine").invoke(selected) as? String
          }.getOrNull()
          if (currentEngine != null && currentEngine != packageName) {
            resetEngine()
            fail("ERR_TTS_ENGINE", "Android selected $currentEngine instead of $packageName")
            return@post
          }
          if (currentEngine == null) Log.w("PixelKitSpeech", "Android does not expose the active TTS engine; explicit engine selection is unverified")
          selected.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) = Unit
            override fun onDone(id: String) { handler.post { if (utteranceId == id) finish() } }
            override fun onError(id: String) { handler.post { if (utteranceId == id) fail("ERR_TTS_PLAYBACK", "Speech engine failed during playback") } }
            override fun onError(id: String, errorCode: Int) { handler.post { if (utteranceId == id) fail("ERR_TTS_PLAYBACK", "Speech engine failed during playback ($errorCode)") } }
            override fun onStop(id: String, interrupted: Boolean) {
              handler.post {
                if (utteranceId == id) {
                  if (interrupted) fail("ERR_TTS_INTERRUPTED", "Speech was interrupted") else finish()
                }
              }
            }
          })
          ready = true
          startUtterance()
        }
      }, packageName)
    }
  }

  fun stop() {
    handler.post {
      generation++
      engine?.stop()
      finish()
    }
  }

  fun isSpeaking(): Boolean = engine?.isSpeaking == true

  fun shutdown() {
    handler.post {
      generation++
      engine?.stop()
      engine?.shutdown()
      engine = null
      enginePackage = null
      ready = false
      finish()
    }
  }

  private fun startUtterance() {
    val selected = engine ?: return fail("ERR_TTS_ENGINE", "Speech engine disconnected")
    val text = pendingText ?: return fail("ERR_TTS_INPUT", "Speech text is missing")
    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, pendingVolume) }
    utteranceId = "pixelkit-${System.nanoTime()}"
    val id = utteranceId!!
    val result = runCatching {
      selected.setSpeechRate(pendingRate)
      selected.setPitch(pendingPitch)
      selected.speak(text, TextToSpeech.QUEUE_FLUSH, params, id)
    }
    if (result.getOrNull() != TextToSpeech.SUCCESS) {
      resetEngine()
      fail("ERR_TTS_PLAYBACK", result.exceptionOrNull()?.message ?: "Speech engine rejected the utterance")
      return
    }
    // A non-conforming or crashed TTS service may never call any terminal
    // UtteranceProgressListener method. Bound the pending promise and release it.
    val playbackLimitMs = (30_000L + text.length * 300L).coerceAtMost(180_000L)
    scheduleTimeout(playbackLimitMs) {
      if (pending != null && utteranceId == id) {
        resetEngine()
        fail("ERR_TTS_TIMEOUT", "Speech engine did not finish playback in time")
      }
    }
  }

  private fun scheduleTimeout(delayMs: Long, action: () -> Unit) {
    clearTimeout()
    val task = Runnable { timeout = null; action() }
    timeout = task
    handler.postDelayed(task, delayMs)
  }

  private fun clearTimeout() {
    timeout?.let(handler::removeCallbacks)
    timeout = null
  }

  private fun resetEngine() {
    generation++
    engine?.stop()
    engine?.shutdown()
    engine = null
    enginePackage = null
    ready = false
  }

  private fun finish() {
    clearTimeout()
    val promise = pending ?: return
    pending = null
    pendingText = null
    utteranceId = null
    promise.resolve(null)
  }

  private fun fail(code: String, message: String) {
    clearTimeout()
    val promise = pending ?: return
    pending = null
    pendingText = null
    utteranceId = null
    promise.reject(code, message, null)
  }
}
