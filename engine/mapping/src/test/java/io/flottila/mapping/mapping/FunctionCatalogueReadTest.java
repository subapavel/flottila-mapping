package io.flottila.mapping.mapping;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.mapping.FunctionCatalogue.Entry;
import io.flottila.mapping.mapping.FunctionCatalogue.Param;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * What lowering reads of a catalogue (ADR-0025, ADR-0026): an entry without {@code inputs}, as
 * {@code constant} has, loads as a function of no inputs; the published members {@code family} and
 * {@code fidelity} are read past. The fixture is a catalogue of its own, given to {@code
 * FunctionCatalogue.read} as bytes.
 */
class FunctionCatalogueReadTest {

  private static final String CATALOGUE =
      """
      {
        "constant": {
          "executionKind": "single",
          "family": "constant",
          "fidelity": {
            "level": "exact"
          },
          "params": [
            {
              "default": "",
              "name": "value",
              "type": "string"
            }
          ],
          "portable": true
        },
        "useOneAsMany": {
          "executionKind": "queue",
          "family": "context",
          "fidelity": {
            "level": "assumed"
          },
          "inputs": [
            {
              "name": "value"
            },
            {
              "name": "occurrences"
            },
            {
              "name": "contexts"
            }
          ],
          "portable": true
        }
      }
      """;

  @Test
  void anEntryWithoutInputsLoads() throws Exception {
    var entries = FunctionCatalogue.read(CATALOGUE.getBytes(UTF_8));

    assertThat(entries.get("constant"))
        .isEqualTo(
            new Entry(
                ExecutionKind.SINGLE,
                List.of(),
                List.of(new Param("value", "", Optional.empty()))));
    // witness: an entry with inputs loads them, in order
    assertThat(entries.get("useOneAsMany"))
        .isEqualTo(
            new Entry(ExecutionKind.QUEUE, List.of("value", "occurrences", "contexts"), List.of()));
    assertThat(entries).hasSize(2);
  }

  /**
   * A string param with {@code values} takes only those, loaded in order; one without them takes
   * any string, as {@code mapWithDefault}'s default does.
   */
  @Test
  void aParamWithValuesLoadsThem() throws Exception {
    String catalogue =
        """
        {"sortLike": {"executionKind": "context", "family": "context",
          "fidelity": {"level": "exact"}, "inputs": [{"name": "queue"}],
          "params": [{"default": "ascending", "name": "order", "type": "string",
                      "values": ["ascending", "descending"]},
                     {"default": "", "name": "default", "type": "string"}],
          "portable": true}}
        """;

    assertThat(FunctionCatalogue.read(catalogue.getBytes(UTF_8)))
        .containsExactly(
            Map.entry(
                "sortLike",
                new Entry(
                    ExecutionKind.CONTEXT,
                    List.of("queue"),
                    List.of(
                        new Param(
                            "order", "ascending", Optional.of(List.of("ascending", "descending"))),
                        new Param("default", "", Optional.empty())))));
  }
}
