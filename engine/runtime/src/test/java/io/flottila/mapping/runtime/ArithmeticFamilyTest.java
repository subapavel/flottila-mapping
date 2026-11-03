package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AuthoringId;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The family {@code arithmetic}'s single-value binding of {@code formatNum} (ADR-0025): the value,
 * read as an {@code xs:decimal}, formatted with the picture its DecimalFormat pattern compiles to
 * (ADR-0003); a value that is no decimal stops the run with {@code err:FORG0001} at the box (F-19).
 */
class ArithmeticFamilyTest {

  private static final AuthoringId N1 = new AuthoringId("N1");

  /** The node of {@code formatNum(value, pattern)} at N1, over constant args. */
  private static Node.OfString formatNum(String value, String pattern) {
    return SingleValueLibrary.bind("formatNum", N1, List.of(frame -> value, frame -> pattern));
  }

  @Test
  void formatNumFormatsTheDecimalAsItsPatternDoes() {
    assertThat(formatNum(" 1234.5 ", "#,##0.00").eval(null)).isEqualTo("1,234.50");
    assertThat(formatNum("-0.5", "0.#%").eval(null)).isEqualTo("-50%");
  }

  @Test
  void aValueThatIsNoDecimalIsForg0001AtTheBox() {
    Node.OfString call = formatNum("1e3", "0");

    assertThatThrownBy(() -> call.eval(null))
        .isInstanceOfSatisfying(
            MappingRunException.class,
            e -> {
              assertThat(e.code()).isEqualTo("err:FORG0001");
              assertThat(e.authoringId()).isEqualTo(N1);
            })
        .hasMessage(
            "the function box N1: formatNum reads \"1e3\", which is not in the xs:decimal lexical"
                + " form (ADR-0005)");
  }
}
