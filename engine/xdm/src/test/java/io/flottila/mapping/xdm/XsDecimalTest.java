package io.flottila.mapping.xdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.SplittableRandom;
import java.util.random.RandomGenerator;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The one number rule of the standard functions (#82, ADR-0005): the {@code xs:decimal} lexical
 * form, XML whitespace (space, tab, line feed, return) around it ignored, as the export's cast
 * reads it. The property test (ADR-0018) is parameterised by seed, without jqwik: 200 seeds of 10
 * texts each over the characters the rule turns on, against a reference reader written here.
 */
class XsDecimalTest {

  static Stream<Arguments> accepted() {
    return Stream.of(
        Arguments.of("0", "0"),
        Arguments.of("1", "1"),
        Arguments.of("-1", "-1"),
        Arguments.of("+3", "3"),
        Arguments.of("-1.50", "-1.50"),
        Arguments.of("0.50", "0.50"),
        Arguments.of("-0.0", "0.0"),
        Arguments.of("007", "7"),
        Arguments.of("7.", "7"),
        Arguments.of("+7.", "7"),
        Arguments.of(".5", "0.5"),
        Arguments.of("-.5", "-0.5"),
        Arguments.of("+.5", "0.5"),
        Arguments.of("99999999999999999999.99", "99999999999999999999.99"),
        Arguments.of(" 4 ", "4"),
        Arguments.of(" \t\r\n-1.50\n", "-1.50"),
        Arguments.of("\t\t12.125", "12.125"),
        Arguments.of("12.125\r\n", "12.125"));
  }

  /** A text in the lexical form is its decimal, scale kept, around any XML whitespace. */
  @ParameterizedTest(name = "\"{0}\"")
  @MethodSource("accepted")
  void aTextInTheLexicalFormIsItsDecimal(String text, String decimal) {
    assertThat(XsDecimal.parse(text)).contains(new BigDecimal(decimal));
  }

  static Stream<Arguments> rejected() {
    return Stream.of(
        Arguments.of("1e3"),
        Arguments.of("1E3"),
        Arguments.of("1.5e-2"),
        Arguments.of(""),
        Arguments.of(" "),
        Arguments.of(" \t\r\n"),
        Arguments.of("+"),
        Arguments.of("-"),
        Arguments.of("."),
        Arguments.of("+."),
        Arguments.of("-."),
        Arguments.of("++1"),
        Arguments.of("+-1"),
        Arguments.of("1+"),
        Arguments.of("1.2.3"),
        Arguments.of("1 2"),
        Arguments.of("- 1"),
        Arguments.of("NaN"),
        Arguments.of("INF"),
        Arguments.of("-INF"),
        Arguments.of("1,5"),
        Arguments.of("0x1F"),
        Arguments.of("1d"),
        Arguments.of(" 1"),
        Arguments.of("1 "),
        Arguments.of("\f1"),
        Arguments.of("1\u000b"),
        Arguments.of(" 1"),
        Arguments.of("٣"),
        Arguments.of("１"));
  }

  /** Anything else is no decimal: an exponent, a sign or a point alone, other whitespace. */
  @ParameterizedTest(name = "\"{0}\"")
  @MethodSource("rejected")
  void anyOtherTextIsNoDecimal(String text) {
    assertThat(XsDecimal.parse(text)).isEmpty();
  }

  /** The characters the rule turns on, XML whitespace and two it does not take as whitespace. */
  private static final char[] ALPHABET = {
    '0', '1', '9', '+', '-', '.', ' ', '\t', '\r', '\n', 'e', '\f', ' '
  };

  static LongStream seeds() {
    return LongStream.rangeClosed(1, 200);
  }

  @ParameterizedTest(name = "seed {0}")
  @MethodSource("seeds")
  void seededTextsAreReadAsTheReferenceReadsThem(long seed) {
    RandomGenerator random = new SplittableRandom(seed);
    for (int i = 0; i < 10; i++) {
      StringBuilder text = new StringBuilder();
      int length = random.nextInt(8);
      for (int k = 0; k < length; k++) {
        text.append(ALPHABET[random.nextInt(ALPHABET.length)]);
      }
      String sample = text.toString();
      assertThat(XsDecimal.parse(sample)).as("\"%s\"", sample).isEqualTo(reference(sample));
    }
  }

  /** The rule read by hand: XML whitespace off both ends, a sign, digits, a point, digits. */
  private static Optional<BigDecimal> reference(String text) {
    int from = 0;
    int to = text.length();
    while (from < to && " \t\r\n".indexOf(text.charAt(from)) >= 0) {
      from++;
    }
    while (to > from && " \t\r\n".indexOf(text.charAt(to - 1)) >= 0) {
      to--;
    }
    String form = text.substring(from, to);
    int at = form.startsWith("+") || form.startsWith("-") ? 1 : 0;
    int digits = 0;
    boolean point = false;
    for (; at < form.length(); at++) {
      char c = form.charAt(at);
      if (c >= '0' && c <= '9') {
        digits++;
      } else if (c == '.' && !point) {
        point = true;
      } else {
        return Optional.empty();
      }
    }
    return digits == 0 ? Optional.empty() : Optional.of(new BigDecimal(form));
  }
}
