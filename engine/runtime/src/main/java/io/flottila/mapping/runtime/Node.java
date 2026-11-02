package io.flottila.mapping.runtime;

import io.flottila.mapping.xdm.QueueBlock;
import java.io.IOException;
import java.util.concurrent.CancellationException;

/**
 * An executable node, built once from one IR node by the closure compiler (ADR-0021). Its kind
 * follows the IR node's type: a queue, an {@code INTEGER}, a {@code STRING}, or content it writes.
 */
interface Node {

  /** A node that gives a queue block. */
  interface OfQueue extends Node {
    QueueBlock eval(Frame frame);
  }

  /** A node that gives an {@code INTEGER}. */
  interface OfInteger extends Node {
    long eval(Frame frame);
  }

  /** A node that gives a {@code STRING}. */
  interface OfString extends Node {
    String eval(Frame frame);
  }

  /** A node that writes content to the frame's output. */
  interface OfContent extends Node {
    void write(Frame frame) throws IOException;
  }

  /**
   * {@code TargetSlots} (ADR-0006): the body once per slot of context {@code p} of the queue, where
   * {@code p} is the parent's slot number, until {@code max} occurrences are created. A SUPPRESS
   * slot creates nothing and does not count toward {@code max}.
   */
  final class Slots implements OfContent {

    private final OfQueue queue;
    private final OfInteger parentSlot;
    private final long max;
    private final int valueSlot;
    private final OfContent body;

    Slots(OfQueue queue, OfInteger parentSlot, long max, int valueSlot, OfContent body) {
      this.queue = queue;
      this.parentSlot = parentSlot;
      this.max = max;
      this.valueSlot = valueSlot;
      this.body = body;
    }

    @Override
    public void write(Frame frame) throws IOException {
      QueueBlock block = queue.eval(frame);
      long parent = parentSlot.eval(frame);
      if (parent > block.contexts()) {
        // the queue has no context p, as when the input's root is not the source root: nothing
        return;
      }
      int context = (int) parent - 1;
      int end = block.end(context);
      long created = 0;
      for (int slot = block.start(context); slot < end && created < max; slot++) {
        if (Thread.currentThread().isInterrupted()) {
          throw new CancellationException("the mapping run was interrupted");
        }
        if (!block.suppressed(slot)) {
          frame.strings[valueSlot] = block.value(slot);
          body.write(frame);
          created++;
        }
      }
    }
  }

  /** {@code ElementConstructor}: the element and its content. */
  final class Element implements OfContent {

    private final String prefix;
    private final String namespace;
    private final String localName;
    private final OfContent[] content;

    Element(String prefix, String namespace, String localName, OfContent[] content) {
      this.prefix = prefix;
      this.namespace = namespace;
      this.localName = localName;
      this.content = content;
    }

    @Override
    public void write(Frame frame) throws IOException {
      frame.out.startElement(prefix, namespace, localName);
      for (OfContent node : content) {
        node.write(frame);
      }
      frame.out.endElement();
    }
  }
}
