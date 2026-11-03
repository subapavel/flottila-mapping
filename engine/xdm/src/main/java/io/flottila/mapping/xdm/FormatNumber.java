package io.flottila.mapping.xdm;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The engine's one number formatting core (ADR-0003): F&amp;O 3.1 {@code format-number} of an
 * {@code xs:decimal} with the default decimal format, over the pictures a number pattern compiles
 * to ({@link NumberPattern}), as Saxon-HE 12.5 formats them (observed, #74). Such a picture is one
 * or two sub-pictures, the second for negative numbers; each is passive text with at most one
 * percent or per mille sign, the digits {@code #} and then {@code 0} with regular grouping
 * separators, optionally the decimal separator with the digits {@code 0} and then {@code #}, and
 * passive text again.
 */
public final class FormatNumber {

  /** The {@code xs:decimal} lexical form (ADR-0005), with XML whitespace on either side. */
  private static final Pattern DECIMAL =
      Pattern.compile("[ \t\r\n]*[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)[ \t\r\n]*");

  /** A sub-picture: prefix, integer digits, decimal separator and fraction digits, suffix. */
  private static final Pattern SUB_PICTURE =
      Pattern.compile("([^#0.,;]*)(#*(?:,?#)*(?:,?0)*)(?:\\.(0*#*))?([^#0.,;]*)");

  /** One sub-picture, analysed as F&amp;O 3.1 section 4.7.4 does. */
  private record SubPicture(
      String prefix,
      int minInteger,
      int grouping,
      int minFraction,
      int maxFraction,
      int shift,
      String suffix) {

    /** {@code value}, which is not negative, as this sub-picture writes it. */
    String format(BigDecimal value) {
      BigDecimal rounded =
          value
              .movePointRight(shift)
              .setScale(maxFraction, RoundingMode.HALF_EVEN)
              .stripTrailingZeros();
      String[] parts =
          rounded.setScale(Math.max(rounded.scale(), minFraction)).toPlainString().split("\\.");
      String integer = parts[0].equals("0") ? "" : parts[0];
      StringBuilder digits =
          new StringBuilder("0".repeat(Math.max(0, minInteger - integer.length())) + integer);
      for (int i = digits.length() - grouping; grouping > 0 && i > 0; i -= grouping) {
        digits.insert(i, ',');
      }
      if (parts.length > 1) {
        digits.append('.').append(parts[1]);
      }
      return prefix + digits + suffix;
    }
  }

  private FormatNumber() {}

  /**
   * {@code value} formatted with {@code picture}.
   *
   * @throws IllegalArgumentException when {@code picture} is none that a number pattern compiles to
   */
  public static String format(BigDecimal value, String picture) {
    String[] pictures = picture.split(";");
    if (value.signum() < 0) {
      return pictures.length > 1
          ? subPicture(picture, pictures[1]).format(value.negate())
          : "-" + subPicture(picture, pictures[0]).format(value.negate());
    }
    return subPicture(picture, pictures[0]).format(value);
  }

  /**
   * {@code lexical} as an {@code xs:decimal}, read as the export's {@code xs:decimal} cast reads
   * it, or nothing when it is not in the lexical form (ADR-0005).
   */
  public static Optional<BigDecimal> decimal(String lexical) {
    // the pattern allows only XML whitespace around the number, which trim removes
    return DECIMAL.matcher(lexical).matches()
        ? Optional.of(new BigDecimal(lexical.trim()))
        : Optional.empty();
  }

  /** {@code text}, a sub-picture of {@code picture}, analysed. */
  private static SubPicture subPicture(String picture, String text) {
    Matcher m = SUB_PICTURE.matcher(text);
    if (!m.matches() || m.group(2).isEmpty() && m.group(3) == null) {
      throw new IllegalArgumentException(
          "the picture \"" + picture + "\" is none that a number pattern compiles to (ADR-0003)");
    }
    String integer = m.group(2);
    String fraction = m.group(3) == null ? "" : m.group(3);
    int minInteger = (int) integer.chars().filter(c -> c == '0').count();
    if (minInteger == 0 && m.group(3) == null) {
      // F&O 3.1 4.7.4: no digit 0 and no decimal separator
      minInteger = 1;
    }
    int minFraction = (int) fraction.chars().filter(c -> c == '0').count();
    if (minInteger == 0 && minFraction == 0) {
      // F&O 3.1 4.7.4: neither part has a mandatory digit
      minFraction = 1;
    }
    int grouping = integer.contains(",") ? integer.length() - integer.lastIndexOf(',') - 1 : 0;
    String affixes = m.group(1) + m.group(4);
    int shift = affixes.contains("%") ? 2 : affixes.contains("‰") ? 3 : 0;
    return new SubPicture(
        m.group(1), minInteger, grouping, minFraction, fraction.length(), shift, m.group(4));
  }
}
