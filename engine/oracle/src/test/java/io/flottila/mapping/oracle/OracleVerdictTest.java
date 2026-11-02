package io.flottila.mapping.oracle;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The golden-corpus verdict itself (ADR-0018). This class is no corpus or differential class, so
 * the ratchet does not read its tests as case ids (scripts/ratchet.java).
 */
class OracleVerdictTest {

  private static boolean differs(String expected, String actual) {
    return OracleVerdict.similar(expected.getBytes(UTF_8), actual.getBytes(UTF_8)).hasDifferences();
  }

  @Test
  void similarStillSeesWhitespaceInsideAValue() {
    assertThat(differs("<a><b>1</b></a>", "<a><b> 1 </b></a>")).isTrue();
    assertThat(differs("<a><b>1 2</b></a>", "<a><b>1  2</b></a>")).isTrue();
    assertThat(differs("<a><b>1</b></a>", "<a><b>1&#13;</b></a>")).isTrue();
  }

  @Test
  void similarIgnoresIndentationBetweenElements() {
    assertThat(differs("<a>\n  <b>1</b>\n</a>\n", "<a><b>1</b></a>")).isFalse();
  }

  @Test
  void similarIgnoresThePrefixButNotTheNamespace() {
    assertThat(
            differs(
                "<ns0:a xmlns:ns0=\"urn:x\"><b>1</b></ns0:a>",
                "<p:a xmlns:p=\"urn:x\"><b>1</b></p:a>"))
        .isFalse();
    assertThat(
            differs(
                "<ns0:a xmlns:ns0=\"urn:x\"><b>1</b></ns0:a>",
                "<ns0:a xmlns:ns0=\"urn:y\"><b>1</b></ns0:a>"))
        .isTrue();
  }

  @Test
  void similarSeesAMissingOrExtraField() {
    assertThat(differs("<a><b>1</b></a>", "<a><b>1</b><c>3</c></a>")).isTrue();
    assertThat(differs("<a><b>1</b></a>", "<a/>")).isTrue();
  }
}
