package expo.modules.pixelnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExplicitSpeechEngineTest {
  private val installedV1 = SpeechEngineInstall("tts.requested", "Requested TTS", "1.0", 1L)

  @Test
  fun missingPackageIsUnavailableBeforeInitialization() {
    assertEquals(
      SpeechEngineCacheAction.UNAVAILABLE,
      SpeechEnginePolicy.cacheAction("tts.requested", null, null, null, null, false),
    )
  }

  @Test
  fun removalInvalidatesAReadyCachedEngine() {
    assertEquals(
      SpeechEngineCacheAction.UNAVAILABLE,
      SpeechEnginePolicy.cacheAction("tts.requested", "tts.requested", "1.0", 1L, null, true),
    )
  }

  @Test
  fun versionChangeForcesReinitialization() {
    val installedV2 = installedV1.copy(versionName = "2.0", versionCode = 2L)
    assertEquals(
      SpeechEngineCacheAction.REINITIALIZE,
      SpeechEnginePolicy.cacheAction("tts.requested", "tts.requested", "1.0", 1L, installedV2, true),
    )
  }

  @Test
  fun versionNameChangeAlsoForcesReinitialization() {
    val renamedVersion = installedV1.copy(versionName = "1.0-repacked")
    assertEquals(
      SpeechEngineCacheAction.REINITIALIZE,
      SpeechEnginePolicy.cacheAction("tts.requested", "tts.requested", "1.0", 1L, renamedVersion, true),
    )
  }

  @Test
  fun unchangedReadyPackageCanBeReused() {
    assertEquals(
      SpeechEngineCacheAction.REUSE,
      SpeechEnginePolicy.cacheAction("tts.requested", "tts.requested", "1.0", 1L, installedV1, true),
    )
  }

  @Test
  fun unobservableOrFallbackPackageIsRejected() {
    assertFalse(SpeechEnginePolicy.acceptsResolvedPackage("tts.requested", null))
    assertFalse(SpeechEnginePolicy.acceptsResolvedPackage("tts.requested", "tts.system"))
    assertTrue(SpeechEnginePolicy.acceptsResolvedPackage("tts.requested", "tts.requested"))
  }

  @Test
  fun selectedVoiceAndLocaleIdentityArePreserved() {
    val identity = SpeechEnginePolicy.voiceIdentity(
      name = "voice-a",
      locale = "en-US",
      quality = 400,
      latency = 200,
      requiresNetwork = false,
      features = listOf("z-feature", "a-feature"),
    )
    assertEquals("voice-a", identity["name"])
    assertEquals("en-US", identity["locale"])
    assertEquals(false, identity["requiresNetwork"])
    assertEquals(listOf("a-feature", "z-feature"), identity["features"])
  }

  @Test
  fun initializationFailureIsTerminalBeforeStart() {
    val lifecycle = SpeechCallbackLifecycle("utterance-init-failure")
    assertTrue(lifecycle.record("error", 10L, "ERR_TTS_ENGINE"))
    assertEquals("failed", lifecycle.status)
    assertFalse(lifecycle.record("start", 11L))
    assertEquals(listOf("error"), lifecycle.callbacks.map { it["type"] })
  }

  @Test
  fun startThenDoneOrderingIsStableAndLateErrorsAreIgnored() {
    val lifecycle = SpeechCallbackLifecycle("utterance-complete")
    assertTrue(lifecycle.record("start", 10L))
    assertTrue(lifecycle.record("done", 20L))
    assertFalse(lifecycle.record("error", 30L, "ERR_TTS_PLAYBACK", -3))
    assertEquals("completed", lifecycle.status)
    assertEquals(listOf("start", "done"), lifecycle.callbacks.map { it["type"] })
    assertNull(lifecycle.callbacks.last()["errorCode"])
  }

  @Test
  fun synthesisErrorRetainsAndroidErrorCode() {
    val lifecycle = SpeechCallbackLifecycle("utterance-error")
    assertTrue(lifecycle.record("start", 10L))
    assertTrue(lifecycle.record("error", 20L, "ERR_TTS_SYNTHESIS", -3))
    assertEquals("failed", lifecycle.status)
    assertEquals("ERR_TTS_SYNTHESIS", lifecycle.callbacks.last()["errorCode"])
    assertEquals(-3, lifecycle.callbacks.last()["synthesisErrorCode"])
  }

  @Test
  fun cancellationAndReplacementAreDistinctTerminalStates() {
    val cancelled = SpeechCallbackLifecycle("utterance-cancelled")
    assertTrue(cancelled.record("stop", 10L, "ERR_TTS_CANCELLED"))
    assertEquals("cancelled", cancelled.status)

    val replaced = SpeechCallbackLifecycle("utterance-replaced")
    assertTrue(replaced.record("replaced", 20L, "ERR_TTS_REPLACED"))
    assertEquals("replaced", replaced.status)
  }

  @Test
  fun lateCallbacksFromReplacedUtteranceCannotChangeItsOutcome() {
    val replaced = SpeechCallbackLifecycle("utterance-old")
    assertTrue(replaced.record("start", 10L))
    assertTrue(replaced.record("replaced", 20L, "ERR_TTS_REPLACED"))
    assertFalse(replaced.record("done", 30L))
    assertFalse(replaced.record("error", 40L, "ERR_TTS_PLAYBACK"))
    assertEquals(listOf("start", "replaced"), replaced.callbacks.map { it["type"] })
  }
}
