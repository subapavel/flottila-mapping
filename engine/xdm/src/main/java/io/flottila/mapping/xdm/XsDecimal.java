package io.flottila.mapping.xdm;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The one number rule of the standard functions (#82, ADR-0005): every function that reads a
 * number reads it through {@link #parse}, as the export reads it through {@code po:decimal} in
 * {@code core.xsl}. A function that meets no decimal raises its own data error at its box (F-19).
 */
public final class XsDecimal {

  /** The {@code xs:decimal} lexical form, XML whitespace on either side; group 1 is the number. */
  private static final Pattern LEXICAL =
      Pattern.compile("[ \t\r\n]*([+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+))[ \t\r\n]*");

  private XsDecimal() {}

  /**
   * {@code text} as a decimal, its scale kept: the {@code xs:decimal} lexical form with XML
   * whitespace (space, tab, line feed, return) around it ignored, as the export's {@code
   * xs:decimal} cast reads it. Empty for anything else: an exponent, {@code NaN}, a sign or a point
   * alone, {@code ""}, other whitespace or other digits.
   */
  public static Optional<BigDecimal> parse(String text) {
    Matcher m = LEXICAL.matcher(text);
    return m.matches() ? Optional.of(new BigDecimal(m.group(1))) : Optional.empty();
  }
}
