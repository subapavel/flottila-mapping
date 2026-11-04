package io.flottila.mapping.xdm;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.CancellationException;

/**
 * The queue algebra of the function family statistic (ADR-0025 "Families", #75): {@code sum},
 * {@code average} and {@code count} give one value per context (#2 §5), and {@code index} numbers
 * the values of each context or of the whole queue, which {@code engine/runtime} also binds {@code
 * counter} to. A number is an {@code xs:decimal} (ADR-0005), read by {@link XsDecimal#parse} and
 * written in the XPath canonical form. SUPPRESS is no value: no function reads, counts or numbers
 * it, and {@code index} keeps it at its slot (an assumed reading of #75). A function never changes
 * its input; a block is immutable.
 */
public final class StatisticFunctions {

  /** The fractional digits of a quotient beyond its dividend's own (ADR-0005). */
  private static final int DIVISION_SCALE = 18;

  private StatisticFunctions() {}

  /**
   * {@code sum}: per context of {@code values}, one context holding the total of its values; a
   * context without a value gives {@code 0} (an assumed reading of #75, as XPath's {@code
   * sum(())}). A queue with no context at all gives none.
   *
   * @throws QueueDataException when a value is no decimal
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock sum(QueueBlock values) {
    String[] sums = new String[values.contexts()];
    int[] starts = new int[sums.length + 1];
    for (int c = 0; c < sums.length; c++) {
      // one check per context: its slots are read below, bounded by their count
      checkInterrupt("sum");
      sums[c] = canonical(total("sum", values, c));
      starts[c + 1] = c + 1;
    }
    return QueueBlock.ofSlots(sums, starts);
  }

  /**
   * {@code average}: per context of {@code values}, one context holding the total of its values
   * divided by their count by ADR-0005's rule, as Saxon-HE divides: rounded half-down to the
   * total's fractional digits, trailing zeros not counted, plus 18. A context without a value gives
   * an empty context (an assumed reading of #75, as XPath's {@code avg(())}). A queue with no
   * context at all gives none.
   *
   * @throws QueueDataException when a value is no decimal
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock average(QueueBlock values) {
    QueueBlock.Builder averages = new QueueBlock.Builder();
    for (int c = 0; c < values.contexts(); c++) {
      // one check per context: its slots are read below, bounded by their count
      checkInterrupt("average");
      averages.newContext();
      BigDecimal total = total("average", values, c);
      int count = count(values, c);
      if (count > 0) {
        int scale = Math.max(0, total.stripTrailingZeros().scale()) + DIVISION_SCALE;
        averages.append(
            canonical(total.divide(BigDecimal.valueOf(count), scale, RoundingMode.HALF_DOWN)));
      }
    }
    return averages.build();
  }

  /**
   * {@code count}: per context of {@code values}, one context holding the number of its values,
   * {@code ""} and text that is no number included. A queue with no context at all gives none.
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock count(QueueBlock values) {
    String[] counts = new String[values.contexts()];
    int[] starts = new int[counts.length + 1];
    for (int c = 0; c < counts.length; c++) {
      // one check per context: its slots are read below, bounded by their count
      checkInterrupt("count");
      counts[c] = String.valueOf(count(values, c));
      starts[c + 1] = c + 1;
    }
    return QueueBlock.ofSlots(counts, starts);
  }

  /**
   * {@code index}: the k-th value of each context of {@code values}, counting from 0, becomes
   * {@code initial + k * increment}; when not {@code resetEachContext}, k counts across the whole
   * queue instead. The values are not read, and each SUPPRESS stays at its slot without a number.
   * The result shares the context starts and the SUPPRESS bitset of {@code values} (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock index(
      QueueBlock values, BigDecimal initial, BigDecimal increment, boolean resetEachContext) {
    String[] numbers = new String[values.slots()];
    long k = 0;
    for (int c = 0; c < values.contexts(); c++) {
      // one check per context: its slots are numbered below, bounded by their count
      checkInterrupt("index");
      if (resetEachContext) {
        k = 0;
      }
      for (int i = values.start(c); i < values.end(c); i++) {
        if (!values.suppressed(i)) {
          numbers[i] = canonical(initial.add(increment.multiply(BigDecimal.valueOf(k++))));
        }
      }
    }
    return values.withSameSuppress(numbers);
  }

  /** The total of the values of the context at index {@code context} of {@code values}. */
  private static BigDecimal total(String function, QueueBlock values, int context) {
    BigDecimal total = BigDecimal.ZERO;
    for (int i = values.start(context); i < values.end(context); i++) {
      // a SUPPRESS slot's value is null: it is no value, so it adds nothing
      String value = values.value(i);
      if (value != null) {
        total =
            total.add(
                XsDecimal.parse(value)
                    .orElseThrow(
                        () ->
                            new QueueDataException(
                                function + ": \"" + value + "\" is no xs:decimal")));
      }
    }
    return total;
  }

  /**
   * The number of slots of the context at index {@code context} of {@code values} that hold a
   * value.
   */
  private static int count(QueueBlock values, int context) {
    int count = 0;
    for (int i = values.start(context); i < values.end(context); i++) {
      if (!values.suppressed(i)) {
        count++;
      }
    }
    return count;
  }

  /**
   * The XPath canonical form of {@code value}: no exponent, no trailing zero, {@code 0} for zero.
   */
  private static String canonical(BigDecimal value) {
    // since JDK 8 a zero of any scale strips to BigDecimal.ZERO, which prints as 0
    return value.stripTrailingZeros().toPlainString();
  }

  /** Every loop over contexts checks for interruption (ADR-0021). */
  private static void checkInterrupt(String function) {
    if (Thread.currentThread().isInterrupted()) {
      throw new CancellationException(function + " was running when the thread was interrupted");
    }
  }
}
