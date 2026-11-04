package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The constant family's bindings (#79), called through {@link QueueLibrary} as the interpreter
 * calls them: {@code copyValue}'s position is parsed once, and one that is no {@code
 * xs:nonNegativeInteger} raises {@code err:FORG0001} at the box on every run, without reading the
 * input. The corpus cases {@code fn/copyValue} pin the same through the facade and against
 * Saxon-HE.
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
}
