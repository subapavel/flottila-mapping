package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The boolean family's bindings (#77, #78), called through {@link SingleValueLibrary} and {@link
 * QueueLibrary} as the interpreter calls them: only the exact text {@code true} is true, a result
 * is {@code true} or {@code false}; ifWithoutElse parses its parameter once. The corpus cases
 * {@code fn/and} to {@code fn/isNil} and {@code fn/ifWithoutElse} pin the same through the facade
 * and against Saxon-HE.
 */
class BooleanFamilyTest {

  private static final AuthoringId BOX = new AuthoringId("F1");
  private static final List<String> NOT_TRUE = List.of("false", "TRUE", "True", "1", "", " true");

  private static String call(String name, String... args) {
    List<Node.OfString> nodes = new ArrayList<>();
    for (String arg : args) {
      nodes.add(frame -> arg);
    }
    return SingleValueLibrary.bind(name, BOX, nodes).eval(null);
  }

  @Test
  void notIsTrueUnlessTheValueIsTheExactTextTrue() {
    assertThat(call("not", "true")).isEqualTo("false");
    for (String other : NOT_TRUE) {
      assertThat(call("not", other)).as("not(\"%s\")", other).isEqualTo("true");
    }
  }

  @Test
  void andNeedsTwoExactTrue() {
    assertThat(call("and", "true", "true")).isEqualTo("true");
    for (String other : NOT_TRUE) {
      assertThat(call("and", "true", other)).as("and(true, \"%s\")", other).isEqualTo("false");
      assertThat(call("and", other, "true")).as("and(\"%s\", true)", other).isEqualTo("false");
    }
  }

  @Test
  void orNeedsOneExactTrue() {
    assertThat(call("or", "true", "true")).isEqualTo("true");
    for (String other : NOT_TRUE) {
      assertThat(call("or", "true", other)).as("or(true, \"%s\")", other).isEqualTo("true");
      assertThat(call("or", other, "true")).as("or(\"%s\", true)", other).isEqualTo("true");
      assertThat(call("or", other, other)).as("or(\"%1$s\", \"%1$s\")", other).isEqualTo("false");
    }
  }

  @Test
  void equalsAndNotEqualsCompareTextCaseSensitively() {
    assertThat(call("equals", "keep", "keep")).isEqualTo("true");
    assertThat(call("equals", "keep", "Keep")).isEqualTo("false");
    assertThat(call("equals", "", "")).isEqualTo("true");
    assertThat(call("equals", "1", "1.0")).isEqualTo("false");
    assertThat(call("notEquals", "keep", "keep")).isEqualTo("false");
    assertThat(call("notEquals", "keep", "Keep")).isEqualTo("true");
    assertThat(call("notEquals", "", "")).isEqualTo("false");
    assertThat(call("notEquals", "1", "1.0")).isEqualTo("true");
  }

  @Test
  void ifGivesThenOnlyForTheExactTextTrue() {
    assertThat(call("if", "true", "yes", "no")).isEqualTo("yes");
    for (String other : NOT_TRUE) {
      assertThat(call("if", other, "yes", "no")).as("if(\"%s\")", other).isEqualTo("no");
    }
  }

  @Test
  void isNilIsTrueForTheEmptyStringOnly() {
    assertThat(call("isNil", "")).isEqualTo("true");
    assertThat(call("isNil", " ")).isEqualTo("false");
    assertThat(call("isNil", "x")).isEqualTo("false");
  }

  /** {@code true}, a false condition, {@code true}: one context, the given condition at slot 2. */
  private static List<String> ifWithoutElse(String keepSuppressValues) {
    QueueBlock.Builder condition = new QueueBlock.Builder();
    condition.newContext();
    condition.append("true");
    condition.append("TRUE");
    condition.append("true");
    QueueBlock.Builder then = new QueueBlock.Builder();
    then.newContext();
    then.append("a");
    then.append("b");
    then.append("c");
    QueueBlock c = condition.build();
    QueueBlock t = then.build();
    QueueBlock result =
        QueueLibrary.bind(
                "ifWithoutElse", BOX, List.of(frame -> c, frame -> t), List.of(keepSuppressValues))
            .eval(null);
    List<String> slots = new ArrayList<>();
    for (int i = 0; i < result.slots(); i++) {
      slots.add(result.suppressed(i) ? "S" : result.value(i));
    }
    return slots;
  }

  @Test
  void ifWithoutElseDropsAFalseSlotOrKeepsSuppressThere() {
    assertThat(ifWithoutElse("false")).containsExactly("a", "c");
    assertThat(ifWithoutElse("true")).containsExactly("a", "S", "c");
  }

  @Test
  void aKeepSuppressValuesTheCatalogueDoesNotListIsACompilerBug() {
    assertThatThrownBy(() -> ifWithoutElse("yes"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("ifWithoutElse has no keepSuppressValues yes");
  }
}
