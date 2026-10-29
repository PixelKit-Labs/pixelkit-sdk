package expo.modules.pixelnative

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UwbRequestParserTest {
  private val valid = mapOf<String, Any?>(
    "sessionId" to 4242,
    "role" to "initiator",
    "localAddress" to "0x1234",
    "peerAddress" to "AB:CD",
  )

  private fun ok(config: Map<String, Any?>?): UwbSessionRequest =
    (UwbRequestParser.parse(config) as UwbRequestParse.Ok).request

  private fun problems(config: Map<String, Any?>?): List<String> =
    (UwbRequestParser.parse(config) as UwbRequestParse.Invalid).problems

  @Test
  fun missingConfigurationNeedsAPeer() {
    assertTrue(problems(null).single().contains("peer configuration"))
  }

  @Test
  fun emptyConfigurationListsEveryRequiredField() {
    val text = problems(emptyMap()).joinToString("; ")
    assertTrue(text.contains("sessionId"))
    assertTrue(text.contains("role"))
    assertTrue(text.contains("localAddress"))
    assertTrue(text.contains("peerAddress"))
  }

  @Test
  fun parsesAddressesAndDefaultsTheConfigId() {
    val r = ok(valid)
    assertEquals(4242, r.sessionId)
    assertTrue(r.initiator)
    assertEquals(1, r.configId)
    assertArrayEquals(byteArrayOf(0x12, 0x34), r.localAddress)
    assertArrayEquals(byteArrayOf(0xAB.toByte(), 0xCD.toByte()), r.peerAddress)
    assertNull(r.channel)
    assertFalse(r.angleOfArrival)
  }

  @Test
  fun javascriptNumbersArriveAsDoubles() {
    assertEquals(7, ok(valid + ("sessionId" to 7.0)).sessionId)
    assertTrue(problems(valid + ("sessionId" to 7.5)).any { it.contains("sessionId") })
  }

  @Test
  fun rejectsAddressesThatAreNotWholeShortOrExtendedAddresses() {
    assertTrue(problems(valid + ("peerAddress" to "123456")).any { it.contains("peerAddress") })
    assertTrue(problems(valid + ("peerAddress" to "zz11")).any { it.contains("peerAddress") })
    assertEquals(8, ok(valid + ("peerAddress" to "0011223344556677")).peerAddress.size)
  }

  @Test
  fun channelAndPreambleMustComeTogether() {
    assertTrue(problems(valid + ("channel" to 9)).any { it.contains("together") })
    val r = ok(valid + mapOf("channel" to 9, "preambleIndex" to 10))
    assertEquals(9, r.channel)
    assertEquals(10, r.preambleIndex)
  }

  @Test
  fun validatesOptionalTuningFields() {
    assertTrue(problems(valid + ("role" to "controller")).any { it.contains("role") })
    assertTrue(problems(valid + ("configId" to 9)).any { it.contains("configId") })
    assertTrue(problems(valid + ("updateRate" to "fast")).any { it.contains("updateRate") })
    assertTrue(problems(valid + ("slotDurationMs" to 3)).any { it.contains("slotDurationMs") })
    assertTrue(problems(valid + ("sessionKeyInfo" to "xyz")).any { it.contains("sessionKeyInfo") })
    val r = ok(valid + mapOf("updateRate" to "frequent", "slotDurationMs" to 1, "angleOfArrival" to true, "sessionKeyInfo" to "0102"))
    assertEquals("frequent", r.updateRate)
    assertEquals(1, r.slotDurationMs)
    assertTrue(r.angleOfArrival)
    assertArrayEquals(byteArrayOf(1, 2), r.sessionKeyInfo)
  }
}
