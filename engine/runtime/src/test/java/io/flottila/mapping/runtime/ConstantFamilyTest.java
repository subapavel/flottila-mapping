package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The constant family's bindings (#79, #83), called through {@link QueueLibrary} and {@link
 * SingleValueLibrary} as the interpreter calls them: {@code copyValue}'s position is parsed once,
 * and one that is no {@code xs:nonNegativeInteger} raises {@code err:FORG0001} at the box on every
 * run, without reading the input. {@code constant} is its value; {@code fixValues} matches its key
 * exactly and gives, for a key its table lacks, the key, its default value or {@code po:FIXVALUES}
 * at the box, by {@code missing}. The corpus cases {@code fn/copyValue}, {@code fn/constant} and
 * {@code fn/fixValues} pin the same through the facade and against Saxon-HE.
 */
class ConstantFamilyTest {

  private static final AuthoringId BOX = new AuthoringId("F1");

  /** A queue of one context per array, a null a SUPPRESS slot. */
  private static QueueBlock queue(String[]... contexts) {
    QueueBlock.Builder builder = new QueueBlock.Builder();
    for (String[] context : contexts) {
      builder.newContext();
      for (String value : context) {
        if (value == null) {
          builder.appendSuppress();
        } else {
          builder.append(value);
        }
      }
    }
    return builder.build();
  }

  private static String[] c(String... values) {
    return values;
  }

  /** The slots of each context of {@code block}, {@code "S"} for SUPPRESS. */
  private static List<List<String>> read(QueueBlock block) {
    List<List<String>> contexts = new ArrayList<>();
    for (int k = 0; k < block.contexts(); k++) {
      List<String> slots = new ArrayList<>();
      for (int i = block.start(k); i < block.end(k); i++) {
        slots.add(block.suppressed(i) ? "S" : block.value(i));
      }
      contexts.add(slots);
    }
    return contexts;
  }

  private static Node.OfQueue bind(Node.OfQueue input, String position) {
    return QueueLibrary.bind("copyValue", BOX, List.of(input), List.of(position));
  }

  @Test
  void copyValueCopiesThePositionOfEachContext() {
    QueueBlock values = queue(c("a", null, "b"), c("c"), c());

    assertThat(read(bind(frame -> values, "1").eval(null)))
        .containsExactly(List.of("S"), List.of(), List.of());
    assertThat(read(bind(frame -> values, " 2 ").eval(null)))
        .containsExactly(List.of("b"), List.of(), List.of());
  }

  /** A malformed position raises on every run, whatever the input holds, as the export does. */
  @Test
  void aPositionThatIsNoNonNegativeIntegerIsForg0001AtTheBoxBeforeTheInputIsRead() {
    Node.OfQueue unread =
        frame -> {
          throw new AssertionError("the input is read");
        };
    Node.OfQueue node = bind(unread, "-1");

    for (int run = 0; run < 2; run++) {
      assertThatThrownBy(() -> node.eval(null))
          .isInstanceOfSatisfying(
              MappingRunException.class,
              e -> {
                assertThat(e.code()).isEqualTo(RuntimeErrors.FORG0001);
                assertThat(e.authoringId()).isEqualTo(BOX);
                assertThat(e.getMessage())
                    .isEqualTo(
                        "the function box F1: copyValue: the position \"-1\" is no"
                            + " xs:nonNegativeInteger");
              });
    }
  }

  // --- the single values of #83

  private static final Node.OfString A = frame -> "a";
  private static final Node.OfString B = frame -> "b";

  /** fixValues over the key {@code key} and the table a = A, its text as lowering gives it. */
  private static Node.OfString fixValues(Node.OfString key, String missing) {
    return SingleValueLibrary.bind(
        "fixValues",
        BOX,
        List.of(key, new Node.Literal("{\"a\":\"A\"}"), new Node.Literal(missing), frame -> "D"));
  }

  @Test
  void constantIsItsValue() {
    assertThat(SingleValueLibrary.bind("constant", BOX, List.of(new Node.Literal("x"))).eval(null))
        .isEqualTo("x");
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
