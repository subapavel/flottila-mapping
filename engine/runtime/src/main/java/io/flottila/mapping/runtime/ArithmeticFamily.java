package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The function family {@code arithmetic} (ADR-0025 "Families", F-15), the math functions of
 * #73: {@code sqr}, {@code sqrt}, {@code power}, {@code ceil}, {@code floor} and {@code round}. All
 * are single-value functions over {@code xs:decimal} strings (ADR-0005): a number is read in the
 * {@code xs:decimal} lexical form only, whitespace around it ignored, anything else is {@code
 * err:FORG0001} at the function box; the result is written in the XPath canonical form. The binders
 * are methods, not lambdas of the maps, so that PIT mutates them.
 */
final class ArithmeticFamily {

  /** The family's queue functions: it has none. */
  static final Map<String, QueueLibrary.Binder> QUEUE = Map.of();

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      Map.ofEntries(
          Map.entry("ceil", ArithmeticFamily::ceil),
          Map.entry("floor", ArithmeticFamily::floor),
          Map.entry("power", ArithmeticFamily::power),
          Map.entry("round", ArithmeticFamily::round),
          Map.entry("sqr", ArithmeticFamily::sqr),
          Map.entry("sqrt", ArithmeticFamily::sqrt));

  /** The greatest exponent of an exact {@code power}; above it the power is an xs:double. */
  private static final int MAX_EXACT_EXPONENT = 1000;

  private static final BigDecimal HALF = new BigDecimal("0.5");

  /** The xs:decimal lexical form around which XML whitespace is ignored; group 1 is the number. */
  private static final Pattern DECIMAL =
      Pattern.compile("[ \\t\\r\\n]*([+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+))[ \\t\\r\\n]*");

  private ArithmeticFamily() {}

  /** {@code ceil(value)}: the least whole number not below the value. */
  static Node.OfString ceil(AuthoringId box, List<Node.OfString> args) {
    return unary("ceil", box, args, x -> x.setScale(0, RoundingMode.CEILING));
  }

  /** {@code floor(value)}: the greatest whole number not above the value. */
  static Node.OfString floor(AuthoringId box, List<Node.OfString> args) {
    return unary("floor", box, args, x -> x.setScale(0, RoundingMode.FLOOR));
  }

  /** {@code round(value)}: the nearest whole number, a half toward positive infinity. */
  static Node.OfString round(AuthoringId box, List<Node.OfString> args) {
    return unary("round", box, args, x -> x.add(HALF).setScale(0, RoundingMode.FLOOR));
  }

  /** {@code sqr(value)}: the value times itself, exactly. */
  static Node.OfString sqr(AuthoringId box, List<Node.OfString> args) {
    return unary("sqr", box, args, x -> x.multiply(x));
  }

  /** {@code sqrt(value)}, computed in xs:double and cast back (ADR-0005). */
  static Node.OfString sqrt(AuthoringId box, List<Node.OfString> args) {
    Node.OfString value = args.getFirst();
    return frame ->
        fromDouble("sqrt", box, Math.sqrt(number("sqrt", box, value.eval(frame)).doubleValue()));
  }

  /**
   * {@code power(base, exponent)}: exact for a whole exponent from 0 to {@value
   * #MAX_EXACT_EXPONENT}, otherwise computed in xs:double and cast back (ADR-0005).
   */
  static Node.OfString power(AuthoringId box, List<Node.OfString> args) {
    Node.OfString base = args.get(0);
    Node.OfString exponent = args.get(1);
    return frame -> {
      BigDecimal b = number("power", box, base.eval(frame));
      BigDecimal e = number("power", box, exponent.eval(frame));
      if (e.signum() >= 0
          && e.compareTo(BigDecimal.valueOf(MAX_EXACT_EXPONENT)) <= 0
          && e.stripTrailingZeros().scale() <= 0) {
        return format(b.pow(e.intValueExact()));
      }
      return fromDouble("power", box, Math.pow(b.doubleValue(), e.doubleValue()));
    };
  }

  /** The node of {@code function} over its one arg: {@code operation} of the number it gives. */
  private static Node.OfString unary(
      String function,
      AuthoringId box,
      List<Node.OfString> args,
      UnaryOperator<BigDecimal> operation) {
    Node.OfString value = args.getFirst();
    return frame -> format(operation.apply(number(function, box, value.eval(frame))));
  }

  /** The number {@code text} writes, or {@code err:FORG0001} at {@code box} when it is none. */
  private static BigDecimal number(String function, AuthoringId box, String text) {
    Matcher m = DECIMAL.matcher(text);
    if (!m.matches()) {
      throw dataError(function, box, "'" + text + "' is no xs:decimal");
    }
    return new BigDecimal(m.group(1));
  }

  /** The xs:decimal that {@code d} equals, or {@code err:FORG0001} when it is NaN or infinite. */
  private static String fromDouble(String function, AuthoringId box, double d) {
    if (Double.isNaN(d) || Double.isInfinite(d)) {
      throw dataError(function, box, "the result is " + d + ", no xs:decimal");
    }
    return format(new BigDecimal(d));
  }

  /** The XPath canonical form of {@code d}: no exponent, no trailing zero, {@code 0} for zero. */
  private static String format(BigDecimal d) {
    return d.signum() == 0 ? "0" : d.stripTrailingZeros().toPlainString();
  }

  private static MappingRunException dataError(String function, AuthoringId box, String message) {
    return MappingRunException.dataError(
        RuntimeErrors.FORG0001, box, function + ": " + message, null);
  }
}
