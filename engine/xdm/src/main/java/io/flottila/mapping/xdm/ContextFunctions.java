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
   * {@code removeContexts}: every slot of {@code queue}, in order, in one context. It shares the
   * values array and builds only the context starts {@code {0, n}} (ADR-0004), so a queue with no
   * context at all gives one empty context.
   */
  public static QueueBlock removeContexts(QueueBlock queue) {
    return queue.withContextStarts(new int[] {0, queue.slots()});
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
