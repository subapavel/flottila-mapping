package io.flottila.mapping.xdm;

import java.util.Arrays;
import java.util.concurrent.CancellationException;

/**
 * The context functions of the runtime library over queue blocks (ADR-0025): the algebra, where the
 * sharing rules of ADR-0004 hold. {@code engine/runtime} binds each by its catalogue name. A
 * function never changes its input; a block is immutable.
 */
public final class ContextFunctions {

  private ContextFunctions() {}

  /**
   * {@code collapseContexts}: the first value of each context of {@code queue}, and {@code ""} for
   * an empty context, all in one context (#2 §4). It copies references only (ADR-0004). A queue
   * with no context at all gives one empty context, as {@link #removeContexts} does.
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock collapseContexts(QueueBlock queue) {
    String[] firsts = new String[queue.contexts()];
    for (int c = 0; c < firsts.length; c++) {
      checkInterrupt("collapseContexts");
      firsts[c] = queue.end(c) > queue.start(c) ? queue.value(queue.start(c)) : "";
    }
    return QueueBlock.ofOneContext(firsts);
  }

  /**
   * {@code formatByExample(values, example)}: every slot of {@code values}, in order, split at the
   * context changes of {@code example}, empty contexts included (#2 §4). The contexts of {@code
   * values} play no part. It shares the values array of {@code values} and the context starts of
   * {@code example}, so it copies nothing (ADR-0004).
   *
   * @throws IllegalArgumentException unless both queues hold as many values: the SAP documentation
   *     requires equal counts, where empty contexts are not counted, and raises an exception
   *     otherwise (#2 §4)
   * @throws CancellationException when the thread is interrupted while the context starts are
   *     checked
   */
  public static QueueBlock formatByExample(QueueBlock values, QueueBlock example) {
    if (values.slots() != example.slots()) {
      throw new IllegalArgumentException(
          "formatByExample needs as many values in its first input as in its second: the first"
              + " has "
              + values.slots()
              + " values, the second "
              + example.slots()
              + " values");
    }
    return values.withContextsOf(example);
  }

  /**
   * {@code removeContexts}: every slot of {@code queue}, in order, in one context. It shares the
   * values array and builds only the context starts {@code {0, n}} (ADR-0004), so a queue with no
   * context at all gives one empty context.
   */
  public static QueueBlock removeContexts(QueueBlock queue) {
    return queue.withContextStarts(new int[] {0, queue.slots()});
  }

  // splitByValue (#55): one function per mode, which the runtime binds once per call site. Each
  // splits every context of its input on its own, so the input's context boundaries stay, and an
  // empty context stays one empty context. A context gives at most one context more than it has
  // slots, which bounds the starts array by slots + contexts + 1, the end sentinel included.

  /**
   * {@code splitByValue} in mode {@code eachValue}: every value in a context of its own. It shares
   * the values array and builds only the context starts (ADR-0004).
   */
  public static QueueBlock splitByEachValue(QueueBlock queue) {
    return split(queue, true);
  }

  /**
   * {@code splitByValue} in mode {@code valueChange}: a new context at every value that is not
   * equal to the value before it in its context, as {@link String#equals} compares. It shares the
   * values array and builds only the context starts (ADR-0004).
   */
  public static QueueBlock splitByValueChange(QueueBlock queue) {
    return split(queue, false);
  }

  /**
   * The context starts of {@code queue} plus one at each slot that starts a context: every slot
   * when {@code eachValue}, otherwise each slot whose value differs from the slot before it.
   */
  private static QueueBlock split(QueueBlock queue, boolean eachValue) {
    int[] starts = new int[queue.slots() + queue.contexts() + 1];
    int count = 0;
    for (int c = 0; c < queue.contexts(); c++) {
      starts[count++] = queue.start(c);
      for (int i = queue.start(c) + 1; i < queue.end(c); i++) {
        if (eachValue || !queue.value(i).equals(queue.value(i - 1))) {
          starts[count++] = i;
        }
      }
    }
    starts[count++] = queue.slots();
    // the block checks the starts it is given, and for interruption on the way (ADR-0021)
    return queue.withContextStarts(Arrays.copyOf(starts, count));
  }

  /**
   * {@code splitByValue} in mode {@code emptyValue}: every {@code ""} ends its context there and
   * starts a new one, and is itself dropped, so a {@code ""} first or last in a context leaves an
   * empty context there. Dropping values needs a values array of its own, which holds the input's
   * value objects: no characters are copied (ADR-0004).
   */
  public static QueueBlock splitByEmptyValue(QueueBlock queue) {
    String[] values = new String[queue.slots()];
    int[] starts = new int[queue.slots() + queue.contexts() + 1];
    int slots = 0;
    int count = 0;
    for (int c = 0; c < queue.contexts(); c++) {
      starts[count++] = slots;
      for (int i = queue.start(c); i < queue.end(c); i++) {
        String value = queue.value(i);
        if (value.isEmpty()) {
          starts[count++] = slots;
        } else {
          values[slots++] = value;
        }
      }
    }
    starts[count++] = slots;
    return QueueBlock.of(Arrays.copyOf(values, slots), Arrays.copyOf(starts, count));
  }

  /**
   * {@code useOneAsMany(value, occurrences, contexts)}: the value at slot index k of {@code value}
   * once per slot of context k of {@code occurrences}, in order, split at the context starts of
   * {@code contexts}, which it shares (#2 §4). It copies references only (ADR-0004). The contexts
   * of {@code value} play no part: its values meet the contexts of {@code occurrences} in order.
   *
   * @throws IllegalArgumentException unless {@code value} has one slot per context of {@code
   *     occurrences} and {@code contexts} as many slots as {@code occurrences}: the assumed reading
   *     of the error conditions (#2 §7.10)
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock useOneAsMany(
      QueueBlock value, QueueBlock occurrences, QueueBlock contexts) {
    if (value.slots() != occurrences.contexts()) {
      throw new IllegalArgumentException(
          "useOneAsMany needs one value of its first input per context of its second: the first"
              + " has "
              + value.slots()
              + " values, the second "
              + occurrences.contexts()
              + " contexts");
    }
    if (contexts.slots() != occurrences.slots()) {
      throw new IllegalArgumentException(
          "useOneAsMany needs as many slots in its third input as in its second: the third has "
              + contexts.slots()
              + " slots, the second "
              + occurrences.slots());
    }
    // the slots of occurrences, counted across its contexts, are the slots of the result
    String[] repeated = new String[occurrences.slots()];
    for (int k = 0; k < occurrences.contexts(); k++) {
      // one check per context: its slots are filled in one call, without a loop of this class
      checkInterrupt("useOneAsMany");
      Arrays.fill(repeated, occurrences.start(k), occurrences.end(k), value.value(k));
    }
    return contexts.withValues(repeated);
  }

  /** Every loop over slots or contexts checks for interruption (ADR-0021). */
  private static void checkInterrupt(String function) {
    if (Thread.currentThread().isInterrupted()) {
      throw new CancellationException(function + " was running when the thread was interrupted");
    }
  }
}
