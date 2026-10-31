package io.flottila.mapping.mapping;

import static io.flottila.mapping.mapping.Fixtures.assertBytes;
import static io.flottila.mapping.mapping.Fixtures.utf8;
import static io.flottila.mapping.mapping.LoadResults.loaded;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * GATE check 2: a mapping model round-trips byte-identical in canonical form (ADR-0010), and a
 * model containing every box kind loads and round-trips, so storing is never limited to what the
 * engine runs.
 */
class MappingModelRoundTripTest {

  @Test
  void canonicalFixturesAreTheCommittedOnes() {
    assertThat(Fixtures.canonicalFixtures())
        .map(p -> p.getFileName().toString())
        .containsExactly(
            "escapes.mapping.json", "every-box-kind.mapping.json", "new-mapping.mapping.json");
  }

  static List<Path> canonicalFixtures() {
    return Fixtures.canonicalFixtures();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("canonicalFixtures")
  void canonicalFixturesRoundTripByteIdentical(Path fixture) throws Exception {
    byte[] committed = Files.readAllBytes(fixture);

    assertBytes(committed, MappingModelFormat.save(loaded(MappingModelFormat.load(committed))));
  }

  static Stream<Arguments> fixtureModels() {
    return Stream.of(
        Arguments.of("every-box-kind.mapping.json", FixtureModels.everyBoxKind()),
        Arguments.of("new-mapping.mapping.json", FixtureModels.newMapping()),
        Arguments.of("escapes.mapping.json", FixtureModels.escapes()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("fixtureModels")
  void canonicalFixturesLoadToTheModelsTheyDescribe(String fixture, MappingModel described)
      throws Exception {
    assertThat(loaded(MappingModelFormat.load(Fixtures.fixture(fixture)))).isEqualTo(described);
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("fixtureModels")
  void canonicalFixturesAreWhatSaveWritesForTheirModels(String fixture, MappingModel described) {
    assertBytes(Fixtures.fixture(fixture), MappingModelFormat.save(described));
  }

  /**
   * Valid, but in no canonical spelling: members out of order, compact with CR LF and tabs, {@code
   * \/} and {@code \u0040} escapes, an unsorted bundle, a context equal to the field's parent and
   * empty optional collections.
   */
  static final String NON_CANONICAL =
      "{\"udfs\":{\"today\":{\"source\":\"udf\\/Dates.java#today\",\"inputs\":[],\"params\":{},"
          + "\"executionKind\":\"single\"}},\r\n\t\"targetFieldMappings\":{\"\\/Invoice\\/Date\":"
          + "{\"result\":\"f1\",\"id\":\"t1\",\"boxes\":{\"u1\":{\"udf\":\"today\",\"kind\":\"udf\","
          + "\"inputs\":[],\"params\":{}},\r\n\"s1\":{\"kind\":\"source\",\"context\":\"/Order/Header\","
          + "\"field\":\"/Order/Header/\\u0040date\"},\"f1\":{\"params\":{\"table\":{\"b\":\"2\","
          + "\"a\":\"1\"},\"pattern\":\"\\u0079yyy-MM-dd\"},\"kind\":\"function\",\"inputs\":"
          + "[ \"s1\" , null ],\"fn\":\"formatDate\"}}}},\t\"target\":{\"root\":{\"element\":"
          + "\"Invoice\"},\"fingerprint\":\"sha256:fedcba9876543210fedcba9876543210fedcba9876543210"
          + "fedcba9876543210\",\"bundle\":[\"invoice.xsd\"]},\"source\":{\"root\":{\"element\":"
          + "\"Order\"},\"fingerprint\":\"sha256:0123456789abcdef0123456789abcdef0123456789abcdef"
          + "0123456789abcdef\",\"bundle\":[\"types.xsd\",\"order.xsd\"]},\"formatVersion\":1}\r\n";

  @Test
  void loadThenSaveWritesCanonicalForm() throws Exception {
    byte[] saved = MappingModelFormat.save(loaded(MappingModelFormat.load(utf8(NON_CANONICAL))));

    assertBytes(
        """
        {
          "formatVersion": 1,
          "source": {
            "bundle": [
              "order.xsd",
              "types.xsd"
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
            "/Invoice/Date": {
              "boxes": {
                "f1": {
                  "fn": "formatDate",
                  "inputs": [
                    "s1",
                    null
                  ],
                  "kind": "function",
                  "params": {
                    "pattern": "yyyy-MM-dd",
                    "table": {
                      "a": "1",
                      "b": "2"
                    }
                  }
                },
                "s1": {
                  "field": "/Order/Header/@date",
                  "kind": "source"
                },
                "u1": {
                  "kind": "udf",
                  "udf": "today"
                }
              },
              "id": "t1",
              "result": "f1"
            }
          },
          "udfs": {
            "today": {
              "executionKind": "single",
              "source": "udf/Dates.java#today"
            }
          }
        }
        """,
        saved);
  }

  @Test
  void saveOfLoadIsIdempotent() throws Exception {
    byte[] once = MappingModelFormat.save(loaded(MappingModelFormat.load(utf8(NON_CANONICAL))));
    byte[] twice = MappingModelFormat.save(loaded(MappingModelFormat.load(once)));

    assertThat(once).isNotEqualTo(utf8(NON_CANONICAL));
    assertBytes(once, twice);
  }

  static LongStream seeds() {
    return LongStream.rangeClosed(1, 200);
  }

  /** Property: any valid model in canonical normal form survives save then load unchanged. */
  @ParameterizedTest(name = "seed {0}")
  @MethodSource("seeds")
  void savedModelReloadsEqual(long seed) throws Exception {
    MappingModel model = new ModelGenerator(seed).model();

    assertThat(loaded(MappingModelFormat.load(MappingModelFormat.save(model)))).isEqualTo(model);
  }
}
