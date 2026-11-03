package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.FormatNumber;
import io.flottila.mapping.xdm.NumberPattern;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The function family {@code arithmetic} (ADR-0025 "Families", F-15): each catalogue name to its
 * binder. A number is an {@code xs:decimal} (ADR-0005); a value that is none stops the run with
 * {@code err:FORG0001} at the function's box (ADR-0025, F-19). The binders are methods, not lambdas
 * of the maps, so that PIT mutates them.
 */
final class ArithmeticFamily {

  /** The family's queue functions. */
  static final Map<String, QueueLibrary.Binder> QUEUE = Map.of();

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      Map.of("formatNum", ArithmeticFamily::formatNum);

  private ArithmeticFamily() {}

  /**
   * {@code formatNum(value, pattern)}: the decimal {@code value} formatted as the DecimalFormat
   * {@code pattern} formats it, through the XPath picture the pattern compiles to (ADR-0003).
   * Lowering gives the pattern as a {@code Literal}, which the node reads per value, as the
   * single-value binding takes its params as nodes.
   */
  static Node.OfString formatNum(AuthoringId box, List<Node.OfString> args) {
    Node.OfString value = args.get(0);
    Node.OfString pattern = args.get(1);
    return frame -> {
      String number = value.eval(frame);
      BigDecimal decimal =
          FormatNumber.decimal(number)
              .orElseThrow(
                  () ->
                      MappingRunException.dataError(
                          RuntimeErrors.FORG0001,
                          box,
                          "formatNum reads \""
                              + number
                              + "\", which is not in the xs:decimal lexical form (ADR-0005)",
                          null));
      return FormatNumber.format(decimal, NumberPattern.picture(pattern.eval(frame)));
    };
  }
}
