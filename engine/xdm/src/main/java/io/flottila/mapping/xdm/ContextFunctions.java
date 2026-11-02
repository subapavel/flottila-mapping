package io.flottila.mapping.xdm;

import java.util.Arrays;

/**
 * The context functions of the runtime library over queue blocks (ADR-0025): the algebra, where the
 * sharing rules of ADR-0004 hold. {@code engine/runtime} binds each by its catalogue name. A
 * function never changes its input; a block is immutable.
 */
public final class ContextFunctions {

  private ContextFunctions() {}

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
}
