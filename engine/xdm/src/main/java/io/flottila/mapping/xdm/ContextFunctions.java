package io.flottila.mapping.xdm;

/**
 * The context functions of the runtime library over queue blocks (ADR-0025): the algebra, where the
 * sharing rules of ADR-0004 hold. {@code engine/runtime} binds each by its catalogue name. A
 * function never changes its input; a block is immutable.
 */
public final class ContextFunctions {

  private ContextFunctions() {}

  /**
   * {@code formatByExample(values, example)}: every slot of {@code values}, in order, split at the
   * context changes of {@code example}, empty contexts included (#2 §4). The contexts of {@code
   * values} play no part. It shares the values array of {@code values} and the context starts of
   * {@code example}, so it copies nothing (ADR-0004).
   *
   * @throws IllegalArgumentException unless both queues hold as many values: the SAP documentation
   *     requires equal counts, where empty contexts are not counted, and raises an exception
   *     otherwise (#2 §4)
   * @throws java.util.concurrent.CancellationException when the thread is interrupted while the
   *     context starts are checked
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
}
