package io.flottila.mapping.mapping;

import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.mapping.JsonTree.Arr;
import io.flottila.mapping.mapping.JsonTree.Bool;
import io.flottila.mapping.mapping.JsonTree.Obj;
import io.flottila.mapping.mapping.JsonTree.Str;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The catalogue entries #51 adds (ADR-0025, #51 design), read from the packed {@code
 * function-catalogue.json} with the tests' own strict reader: {@code createIf} is a context
 * function with the input {@code condition}; {@code replaceValue} a single-value function with the
 * input {@code value} and the string param {@code replacement}, default {@code ""}. Both are
 * portable.
 */
class SuppressCatalogueEntriesTest {

  private static Map<String, JsonTree> entry(String name) throws Exception {
    JsonTree catalogue = JsonTree.parse(Fixtures.strictUtf8(FunctionCatalogueTest.catalogue()));
    assertThat(catalogue).isInstanceOf(Obj.class);
    JsonTree entry = ((Obj) catalogue).members().get(name);
    assertThat(entry).as("the catalogue entry %s", name).isInstanceOf(Obj.class);
    return ((Obj) entry).members();
  }

  @Test
  void createIfIsAPortableContextFunctionOfACondition() throws Exception {
    Map<String, JsonTree> createIf = entry("createIf");

    assertThat(createIf.get("executionKind")).isEqualTo(new Str("context"));
    assertThat(createIf.get("inputs"))
        .isEqualTo(new Arr(List.of(new Obj(Map.of("name", new Str("condition"))))));
    assertThat(createIf).doesNotContainKey("params");
    assertThat(createIf.get("portable")).isEqualTo(new Bool(true));
  }

  @Test
  void replaceValueIsAPortableSingleValueFunctionWithAStringParam() throws Exception {
    Map<String, JsonTree> replaceValue = entry("replaceValue");

    assertThat(replaceValue.get("executionKind")).isEqualTo(new Str("single"));
    assertThat(replaceValue.get("inputs"))
        .isEqualTo(new Arr(List.of(new Obj(Map.of("name", new Str("value"))))));
    assertThat(replaceValue.get("params"))
        .isEqualTo(
            new Arr(
                List.of(
                    new Obj(
                        Map.of(
                            "default",
                            new Str(""),
                            "name",
                            new Str("replacement"),
                            "type",
                            new Str("string"))))));
    assertThat(replaceValue.get("portable")).isEqualTo(new Bool(true));
  }
}
