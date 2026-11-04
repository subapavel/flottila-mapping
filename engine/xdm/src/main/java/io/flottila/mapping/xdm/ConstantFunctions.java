package io.flottila.mapping.xdm;

import java.math.BigInteger;
import java.util.OptionalInt;
import java.util.concurrent.CancellationException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The queue algebra of the function family constant (ADR-0025 "Families", #79): {@code copyValue}
 * copies the slot at a position of each context, counted from 0. A context too short for the
 * position gives an empty context, and a SUPPRESS slot counts as a position and is copied as
 * SUPPRESS (assumed readings of #79). A function never changes its input; a block is immutable.
 */
public final class ConstantFunctions {

  /** The {@code xs:integer} lexical form, with XML whitespace on either side. */
  private static final Pattern INTEGER = Pattern.compile("[ \t\r\n]*([+-]?[0-9]+)[ \t\r\n]*");

  /** The largest position: no context has more slots than an {@code int} counts. */
  private static final BigInteger LAST = BigInteger.valueOf(Integer.MAX_VALUE);

  private ConstantFunctions() {}

  /**
   * {@code text} as a position: its {@code xs:nonNegativeInteger} lexical form, with XML whitespace
   * around it ignored, as the export's cast reads it. A position beyond {@link Integer#MAX_VALUE}
   * is beyond every context, so it is that. Empty when {@code text} is none, such as a negative
   * number.
   */
  public static OptionalInt position(String text) {
    Matcher m = INTEGER.matcher(text);
    if (!m.matches()) {
      return OptionalInt.empty();
    }
    BigInteger position = new BigInteger(m.group(1));
    return position.signum() < 0
        ? OptionalInt.empty()
        : OptionalInt.of(position.min(LAST).intValue());
  }

  /**
   * {@code copyValue}: per context of {@code values}, one context holding the slot at {@code
   * position}, counted from 0, or an empty context when the context has fewer slots. A SUPPRESS
   * slot counts as a position and is copied as SUPPRESS.
   *
   * @param position the position, not negative
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock copyValue(QueueBlock values, int position) {
    QueueBlock.Builder copies = new QueueBlock.Builder();
    for (int c = 0; c < values.contexts(); c++) {
      // one check per context: it copies one slot at most
      Interrupts.check("copyValue");
      copies.newContext();
      if (position < values.end(c) - values.start(c)) {
        int slot = values.start(c) + position;
        if (values.suppressed(slot)) {
          copies.appendSuppress();
        } else {
          copies.append(values.value(slot));
        }
      }
    }
    return copies.build();
  }
}
