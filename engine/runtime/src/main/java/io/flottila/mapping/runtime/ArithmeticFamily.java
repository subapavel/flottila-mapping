package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.function.BinaryOperator;
import java.util.function.IntPredicate;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;

/**
 * The function family {@code arithmetic} (ADR-0025 "Families", F-15), its basic functions: each
 * catalogue name to its binder. All are single-value functions over {@code xs:decimal} strings
 * (ADR-0002, ADR-0005): an input is read in the {@code xs:decimal} lexical form only and the result
 * is written in the XPath canonical form. An input that is no {@code xs:decimal} is {@code
 * err:FORG0001}, a division by zero {@code err:FOAR0001}, both at the function's box (ADR-0026).
 * The binders are methods, not lambdas of the map, so that PIT mutates them.
 */
final class ArithmeticFamily {

  /** The family's queue functions: none. */
  static final Map<String, QueueLibrary.Binder> QUEUE = Map.of();

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      Map.ofEntries(
          Map.entry("abs", ArithmeticFamily::abs),
          Map.entry("add", ArithmeticFamily::add),
          Map.entry("divide", ArithmeticFamily::divide),
          Map.entry("equalsA", ArithmeticFamily::equalsA),
          Map.entry("greater", ArithmeticFamily::greater),
          Map.entry("inv", ArithmeticFamily::inv),
          Map.entry("less", ArithmeticFamily::less),
          Map.entry("max", ArithmeticFamily::max),
          Map.entry("min", ArithmeticFamily::min),
          Map.entry("multiply", ArithmeticFamily::multiply),
          Map.entry("neg", ArithmeticFamily::neg),
          Map.entry("sign", ArithmeticFamily::sign),
          Map.entry("subtract", ArithmeticFamily::subtract));

  /** The {@code xs:decimal} lexical form, in the ASCII digits only, in XML white space. */
  private static final Pattern DECIMAL =
      Pattern.compile("[ \\t\\r\\n]*[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)[ \\t\\r\\n]*");

  /** The scale of a quotient that does not terminate, at least (ADR-0005). */
  private static final int DIVISION_SCALE = 18;

  private ArithmeticFamily() {}

  static Node.OfString add(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, BigDecimal::add);
  }

  static Node.OfString subtract(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, BigDecimal::subtract);
  }

  static Node.OfString multiply(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, BigDecimal::multiply);
  }

  static Node.OfString divide(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, (dividend, divisor) -> quotient(dividend, divisor, box));
  }

  static Node.OfString equalsA(AuthoringId box, List<Node.OfString> args) {
    return comparison(box, args, order -> order == 0);
  }

  static Node.OfString greater(AuthoringId box, List<Node.OfString> args) {
    return comparison(box, args, order -> order > 0);
  }

  static Node.OfString less(AuthoringId box, List<Node.OfString> args) {
    return comparison(box, args, order -> order < 0);
  }

  static Node.OfString max(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, BigDecimal::max);
  }

  static Node.OfString min(AuthoringId box, List<Node.OfString> args) {
    return binary(box, args, BigDecimal::min);
  }

  static Node.OfString abs(AuthoringId box, List<Node.OfString> args) {
    return unary(box, args, BigDecimal::abs);
  }

  static Node.OfString neg(AuthoringId box, List<Node.OfString> args) {
    return unary(box, args, BigDecimal::negate);
  }

  /** {@code inv}: 1 divided by the value, by ADR-0005's rule (an assumed reading). */
  static Node.OfString inv(AuthoringId box, List<Node.OfString> args) {
    return unary(box, args, value -> quotient(BigDecimal.ONE, value, box));
  }

  static Node.OfString sign(AuthoringId box, List<Node.OfString> args) {
    return unary(box, args, value -> BigDecimal.valueOf(value.signum()));
  }

  /** The node of a call over two numbers; the result is written as {@code canonical}. */
  private static Node.OfString binary(
      AuthoringId box, List<Node.OfString> args, BinaryOperator<BigDecimal> operation) {
    Node.OfString first = args.get(0);
    Node.OfString second = args.get(1);
    return frame ->
        canonical(
            operation.apply(decimal(first.eval(frame), box), decimal(second.eval(frame), box)));
  }

  /** The node of a call over two numbers; the result is {@code true} or {@code false}. */
  private static Node.OfString comparison(
      AuthoringId box, List<Node.OfString> args, IntPredicate holds) {
    Node.OfString first = args.get(0);
    Node.OfString second = args.get(1);
    return frame ->
        Boolean.toString(
            holds.test(
                decimal(first.eval(frame), box).compareTo(decimal(second.eval(frame), box))));
  }

  /** The node of a call over one number. */
  private static Node.OfString unary(
      AuthoringId box, List<Node.OfString> args, UnaryOperator<BigDecimal> operation) {
    Node.OfString value = args.getFirst();
    return frame -> canonical(operation.apply(decimal(value.eval(frame), box)));
  }

  /**
   * {@code text} as a decimal: its {@code xs:decimal} lexical form, which an exponent, {@code NaN}
   * and a sign alone are not, after the XML white space around it is cut.
   *
   * @throws MappingRunException {@code err:FORG0001} at {@code box} when it is none
   */
  static BigDecimal decimal(String text, AuthoringId box) {
    if (!DECIMAL.matcher(text).matches()) {
      throw MappingRunException.dataError(
          RuntimeErrors.FORG0001, box, "\"" + text + "\" is no xs:decimal", null);
    }
    // the pattern allows XML white space only, which strip() cuts and nothing else
    return new BigDecimal(text.strip());
  }

  /**
   * ADR-0005, as Saxon-HE 12.5 divides: the quotient rounded half-down to {@code max(18, scale of
   * dividend - scale of divisor + 18)} fractional digits, the scales without trailing zeros. A
   * quotient with no more digits than that is exact; one with more (1 / 2^30) is rounded too, which
   * is narrower than ADR-0005's "a quotient that terminates is exact" (observed, differential case
   * fn/divide/004).
   *
   * @throws MappingRunException {@code err:FOAR0001} at {@code box} when {@code divisor} is zero
   */
  static BigDecimal quotient(BigDecimal dividend, BigDecimal divisor, AuthoringId box) {
    if (divisor.signum() == 0) {
      throw MappingRunException.dataError(RuntimeErrors.FOAR0001, box, "division by zero", null);
    }
    int scale = Math.max(DIVISION_SCALE, scale(dividend) - scale(divisor) + DIVISION_SCALE);
    return dividend.divide(divisor, scale, RoundingMode.HALF_DOWN);
  }

  /** The fractional digits of {@code value} without its trailing zeros, never below 0. */
  private static int scale(BigDecimal value) {
    return Math.max(0, value.stripTrailingZeros().scale());
  }

  /**
   * The XPath canonical form of {@code value}: no exponent, no trailing zeros; a zero is {@code 0}.
   */
  static String canonical(BigDecimal value) {
    return value.stripTrailingZeros().toPlainString();
  }
}
