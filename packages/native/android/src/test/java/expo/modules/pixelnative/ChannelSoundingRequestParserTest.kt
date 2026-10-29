package expo.modules.pixelnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChannelSoundingRequestParserTest {
  private val valid = mapOf<String, Any?>("peerAddress" to "aa:bb:cc:dd:ee:0f")

  private fun ok(config: Map<String, Any?>?): ChannelSoundingRequest =
    (ChannelSoundingRequestParser.parse(config) as ChannelSoundingRequestParse.Ok).request

  private fun invalid(config: Map<String, Any?>?): ChannelSoundingRequestParse.Invalid =
    ChannelSoundingRequestParser.parse(config) as ChannelSoundingRequestParse.Invalid

  @Test
  fun missingConfigurationNeedsAPeerAddress() {
    val result = invalid(null)
    assertTrue(result.missingPeer)
    assertTrue(result.problems.single().contains("peerAddress"))
  }

  @Test
  fun emptyOrBlankPeerAddressIsMissing() {
    assertTrue(invalid(emptyMap()).missingPeer)
    assertTrue(invalid(mapOf("peerAddress" to null)).missingPeer)
    assertTrue(invalid(mapOf("peerAddress" to "  ")).missingPeer)
  }

  @Test
  fun malformedPeerAddressIsInvalidNotMissing() {
    for (bad in listOf("AA:BB:CC:DD:EE", "AA-BB-CC-DD-EE-FF", "GG:BB:CC:DD:EE:FF", "AABBCCDDEEFF", "AA:BB:CC:DD:EE:FF:00")) {
      val result = invalid(mapOf("peerAddress" to bad))
      assertFalse("$bad should not count as missing", result.missingPeer)
      assertTrue(result.problems.any { it.contains("peerAddress") })
    }
    assertFalse(invalid(mapOf("peerAddress" to 12)).problems.isEmpty())
  }

  @Test
  fun normalizesTheAddressToUpperCaseAndLeavesTuningUnset() {
    val r = ok(valid + ("peerAddress" to "  aa:bb:cc:dd:ee:0f "))
    assertEquals("AA:BB:CC:DD:EE:0F", r.peerAddress)
    assertTrue(r.initiator)
    assertNull(r.securityLevel)
    assertNull(r.sightType)
    assertNull(r.locationType)
    assertNull(r.updateRate)
  }

  @Test
  fun validatesOptionalTuningFields() {
    assertTrue(invalid(valid + ("role" to "controller")).problems.any { it.contains("role") })
    assertTrue(invalid(valid + ("securityLevel" to 2)).problems.any { it.contains("securityLevel") })
    assertTrue(invalid(valid + ("sightType" to "clear")).problems.any { it.contains("sightType") })
    assertTrue(invalid(valid + ("locationType" to "garage")).problems.any { it.contains("locationType") })
    assertTrue(invalid(valid + ("updateRate" to "fast")).problems.any { it.contains("updateRate") })
    val r = ok(
      valid + mapOf(
        "role" to "responder",
        "securityLevel" to 4.0,
        "sightType" to "non_line_of_sight",
        "locationType" to "indoor",
        "updateRate" to "frequent",
      )
    )
    assertFalse(r.initiator)
    assertEquals(4, r.securityLevel)
    assertEquals("non_line_of_sight", r.sightType)
    assertEquals("indoor", r.locationType)
    assertEquals("frequent", r.updateRate)
  }

  @Test
  fun fractionalSecurityLevelIsRejected() {
    assertTrue(invalid(valid + ("securityLevel" to 1.5)).problems.any { it.contains("securityLevel") })
  }
}
