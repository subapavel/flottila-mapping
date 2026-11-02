package io.flottila.mapping.xdm;

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
}
