package io.flottila.mapping.mapping;

import static io.flottila.mapping.mapping.Fixtures.utf8;
import static io.flottila.mapping.mapping.LoadResults.errorAtPointer;
import static io.flottila.mapping.mapping.LoadResults.loaded;
import static io.flottila.mapping.mapping.LoadResults.refused;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Before the two validation stages (ADR-0011, "Stage 1 and 2 codes"): malformed JSON, a BOM, a
 * duplicate key or bad UTF-8 is a transport error, and a newer {@code formatVersion} is refused
 * with one diagnostic.
 */
class MappingModelLoadTest {

  /** A valid document with a duplicate-free table; the malformed cases each break one thing. */
  static final String VALID =
      """
      {
        "formatVersion": 1,
        "source": {
          "bundle": [
            "order.xsd"
          ],
          "fingerprint": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "root": {
            "element": "Order"
          }
        },
        "target": {
          "bundle": [
            "invoice.xsd"
          ],
          "fingerprint": "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
          "root": {
            "element": "Invoice"
          }
        },
        "targetFieldMappings": {
          "/Invoice/Currency": {
            "boxes": {
              "a1": {
                "field": "/Order/Currency",
                "kind": "source"
              },
              "b1": {
                "fn": "fixValues",
                "inputs": [
                  "a1"
                ],
                "kind": "function",
                "params": {
                  "table": {
                    "CHF": "CHF",
                    "euro": "EUR"
                  }
                }
              }
            },
            "id": "t1",
            "result": "b1"
          }
        }
      }
      """;

  @Test
  void theValidDocumentTheMalformedCasesBreakLoads() throws Exception {
    assertThat(loaded(MappingModelFormat.load(utf8(VALID))).formatVersion()).isEqualTo(1);
  }

  static Stream<Arguments> malformed() {
    byte[] valid = utf8(VALID);
    return Stream.of(
        Arguments.of("empty input", new byte[0]),
        Arguments.of("truncated", utf8(VALID.substring(0, VALID.length() - 3))),
        Arguments.of(
            "trailing comma", utf8(VALID.replace("\"result\": \"b1\"", "\"result\": \"b1\","))),
        Arguments.of("trailing content", utf8(VALID + "{}\n")),
        Arguments.of("single-quoted string", utf8(VALID.replace("\"t1\"", "'t1'"))),
        Arguments.of("BOM", concat(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, valid)),
        Arguments.of(
            "duplicate top-level key",
            utf8(
                VALID.replace(
                    "\"formatVersion\": 1,", "\"formatVersion\": 1,\n\"formatVersion\": 1,"))),
        Arguments.of(
            "duplicate box id in one target field mapping",
            utf8(
                VALID.replace(
                    "\"a1\": {",
                    "\"a1\": {\"field\": \"/Order/Currency\", \"kind\": \"source\"},\n\"a1\": {"))),
        Arguments.of(
            "duplicate table key",
            utf8(VALID.replace("\"CHF\": \"CHF\",", "\"CHF\": \"CHF\",\n\"CHF\": \"CHF\","))),
        Arguments.of("invalid byte 0xFF in a string", badUtf8("CH", new byte[] {(byte) 0xFF}, "F")),
        Arguments.of("truncated two-byte sequence", badUtf8("CH", new byte[] {(byte) 0xC3}, "F")),
        Arguments.of(
            "overlong encoding of '/'", badUtf8("CH", new byte[] {(byte) 0xC0, (byte) 0xAF}, "F")),
        Arguments.of(
            "UTF-8 encoded surrogate",
            badUtf8("CH", new byte[] {(byte) 0xED, (byte) 0xA0, (byte) 0x80}, "F")),
        Arguments.of("lone continuation byte", badUtf8("CH", new byte[] {(byte) 0x80}, "F")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("malformed")
  void loadThrowsMalformedOnSyntaxBomDuplicateKeyOrBadUtf8(String why, byte[] json) {
    assertThatThrownBy(() -> MappingModelFormat.load(json))
        .as(why)
        .isInstanceOf(MalformedJsonException.class);
  }

  @ParameterizedTest(name = "formatVersion {0}")
  @ValueSource(ints = {2, 10})
  void loadRefusesNewerFormatVersionWithThatDiagnosticAlone(int version) throws Exception {
    String newer = VALID.replace("\"formatVersion\": 1,", "\"formatVersion\": " + version + ",");
    // a newer format may have any shape; nothing of it is validated
    String newerAndForeign =
        """
        {
          "formatVersion": %d,
          "layout": {"zoom": 2},
          "source": "order.xsd",
          "targetFieldMappings": {"/Invoice/Number": {"id": "not an id", "boxes": []}}
        }
        """
            .formatted(version);

    assertThat(refused(MappingModelFormat.load(utf8(newer))))
        .containsExactly(errorAtPointer("format-version-unsupported", "/formatVersion"));
    assertThat(refused(MappingModelFormat.load(utf8(newerAndForeign))))
        .containsExactly(errorAtPointer("format-version-unsupported", "/formatVersion"));
  }

  @Test
  void loadValidatesFormatVersionOneInsteadOfRefusingIt() throws Exception {
    String foreign =
        """
        {
          "formatVersion": 1,
          "layout": {"zoom": 2},
          "source": "order.xsd",
          "targetFieldMappings": {"/Invoice/Number": {"id": "not an id", "boxes": []}}
        }
        """;

    assertThat(refused(MappingModelFormat.load(utf8(foreign))))
        .isNotEmpty()
        .noneMatch(d -> d.contains("format-version-unsupported"));
  }

  /** {@link #VALID} with {@code bad} spliced into the table key {@code "CHF"}. */
  private static byte[] badUtf8(String before, byte[] bad, String after) {
    String marker = "\"" + before + after + "\": \"CHF\"";
    int at = VALID.indexOf(marker);
    assertThat(at).as("marker in the valid document").isNotNegative();
    byte[] head = VALID.substring(0, at + 1 + before.length()).getBytes(UTF_8);
    byte[] tail = VALID.substring(at + 1 + before.length()).getBytes(UTF_8);
    return concat(concat(head, bad), tail);
  }

  private static byte[] concat(byte[] a, byte[] b) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(a);
    out.writeBytes(b);
    return out.toByteArray();
  }
}
