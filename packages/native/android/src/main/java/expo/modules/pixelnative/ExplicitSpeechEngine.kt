package expo.modules.pixelnative

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
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
      if (pending != null) {
        promise.reject("ERR_TTS_BUSY", "A speech utterance is already active", null)
        return@post
      }
      if (packageName.isBlank() || text.isBlank()) {
        promise.reject("ERR_TTS_INPUT", "Speech engine and text are required", null)
        return@post
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
      // The callback can race the constructor assignment. Posting it to the main
      // handler ensures `engine` has been assigned before it is inspected.
      engine = TextToSpeech(context, { status ->
        handler.post {
          if (currentGeneration != generation) return@post
          val selected = engine
          if (status != TextToSpeech.SUCCESS || selected == null || selected.defaultEngine != packageName) {
            fail("ERR_TTS_ENGINE", "Requested speech engine $packageName is unavailable or Android selected another engine")
            return@post
          }
          selected.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) = Unit
            override fun onDone(id: String) { handler.post { if (utteranceId == id) finish() } }
            override fun onError(id: String) { handler.post { if (utteranceId == id) fail("ERR_TTS_PLAYBACK", "Speech engine failed during playback") } }
            override fun onError(id: String, errorCode: Int) { handler.post { if (utteranceId == id) fail("ERR_TTS_PLAYBACK", "Speech engine failed during playback ($errorCode)") } }
            override fun onStop(id: String, interrupted: Boolean) { handler.post { if (utteranceId == id) finish() } }
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
    val text = pendingText ?: return
    selected.setSpeechRate(pendingRate)
    selected.setPitch(pendingPitch)
    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, pendingVolume) }
    utteranceId = "pixelkit-${System.nanoTime()}"
    if (selected.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId) != TextToSpeech.SUCCESS) {
      fail("ERR_TTS_PLAYBACK", "Speech engine rejected the utterance")
    }
  }

  private fun finish() {
    val promise = pending ?: return
    pending = null
    pendingText = null
    utteranceId = null
    promise.resolve(null)
  }

  private fun fail(code: String, message: String) {
    val promise = pending ?: return
    pending = null
    pendingText = null
    utteranceId = null
    promise.reject(code, message, null)
  }
}
