package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The conversions family's bindings (#83), called through {@link SingleValueLibrary} as the
 * interpreter calls them: {@code fixValues} matches its key exactly and gives, for a key its table
 * lacks, the key, its default value or {@code po:FIXVALUES} at the box, by {@code missing}. The
 * corpus cases {@code fn/fixValues} pin the same through the facade and against Saxon-HE.
 */
class ConversionsFamilyTest {

  private static final AuthoringId BOX = new AuthoringId("F1");

  private static final Node.OfString A = frame -> "a";
  private static final Node.OfString B = frame -> "b";

  /** fixValues over the key {@code key} and the table a = A, its text as lowering gives it. */
  private static Node.OfString fixValues(Node.OfString key, String missing) {
    return SingleValueLibrary.bind(
        "fixValues",
        BOX,
        List.of(key, new Node.Literal("{\"a\":\"A\"}"), new Node.Literal(missing), frame -> "D"));
  }

  /** A key in the table gives its value whatever missing is. */
  @ParameterizedTest
  @ValueSource(strings = {"key", "default", "error"})
  void aKeyInTheTableGivesItsValue(String missing) {
    assertThat(fixValues(A, missing).eval(null)).isEqualTo("A");
  }

  /** A key matches exactly, so "a " is not in the table. */
  @Test
  void aKeyTheTableLacksGivesTheKeyOrTheDefaultValue() {
    assertThat(fixValues(B, "key").eval(null)).isEqualTo("b");
    assertThat(fixValues(frame -> "a ", "key").eval(null)).isEqualTo("a ");
    assertThat(fixValues(B, "default").eval(null)).isEqualTo("D");
  }

  @Test
  void aKeyTheTableLacksIsFixValuesAtTheBoxWhenMissingIsError() {
    assertThatThrownBy(() -> fixValues(B, "error").eval(null))
        .isInstanceOfSatisfying(
            MappingRunException.class,
            e -> {
              assertThat(e.code()).isEqualTo(RuntimeErrors.FIXVALUES);
              assertThat(e.authoringId()).isEqualTo(BOX);
              assertThat(e.getMessage())
                  .isEqualTo("the function box F1: fixValues: the key \"b\" is not in the table");
            });
  }

  /** Lowering checks missing against the catalogue's values, so another is a compiler bug. */
  @Test
  void aMissingTheCatalogueLacksIsACompilerBug() {
    assertThatThrownBy(() -> fixValues(B, "keep"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("keep");
  }
}
