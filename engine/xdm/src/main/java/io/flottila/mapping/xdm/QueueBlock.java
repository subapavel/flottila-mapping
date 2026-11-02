package io.flottila.mapping.xdm;

import java.util.Arrays;
import java.util.concurrent.CancellationException;

/**
 * The runtime representation of a queue (ADR-0004): {@code n} slots in {@code values} and {@code c
 * + 1} {@code contextStarts}, where {@code [0] = 0}, {@code [c] = n} and no entry decreases.
 * Context {@code k} spans the slot indexes {@code start(k)} to {@code end(k)}, the end excluded. A
 * context index and a slot index count from 0: a slot index is the slot number minus 1. A block
 * with no contexts ({@code {0}}) differs from one with one empty context ({@code {0, 0}}). Spec 1
 * has no SUPPRESS.
 *
 * <p>A block is immutable. It takes the arrays it is given without copying them, so that context
 * operations can share them; whoever hands them over no longer writes them.
 */
public final class QueueBlock {

  private final String[] values;
  private final int[] contextStarts;

  private QueueBlock(String[] values, int[] contextStarts) {
    this.values = values;
    this.contextStarts = contextStarts;
  }

  /**
   * A block over {@code values} split at {@code contextStarts}.
   *
   * @throws IllegalArgumentException unless the starts begin at 0, never decrease and end with the
   *     sentinel {@code values.length}
   * @throws CancellationException when the thread is interrupted while the starts are checked
   */
  public static QueueBlock of(String[] values, int[] contextStarts) {
    if (contextStarts.length == 0) {
      throw new IllegalArgumentException("contextStarts has no entry, not even the end sentinel");
    }
    if (contextStarts[0] != 0) {
      throw new IllegalArgumentException("contextStarts[0] is " + contextStarts[0] + ", not 0");
    }
    for (int k = 1; k < contextStarts.length; k++) {
      // every loop over contexts checks for interruption (ADR-0021)
      if (Thread.currentThread().isInterrupted()) {
        throw new CancellationException("the queue block was being checked when interrupted");
      }
      if (contextStarts[k] < contextStarts[k - 1]) {
        throw new IllegalArgumentException("contextStarts decreases at " + k);
      }
    }
    int sentinel = contextStarts[contextStarts.length - 1];
    if (sentinel != values.length) {
      throw new IllegalArgumentException(
          "the end sentinel is " + sentinel + ", but there are " + values.length + " slots");
    }
    return new QueueBlock(values, contextStarts);
  }

  /** The number of contexts. */
  public int contexts() {
    return contextStarts.length - 1;
  }

  /** The number of slots across all contexts. */
  public int slots() {
    return values.length;
  }

  /** The slot index of the first slot of the context at index {@code context}. */
  public int start(int context) {
    return contextStarts[context];
  }

  /** The slot index after the last slot of the context at index {@code context}. */
  public int end(int context) {
    return contextStarts[context + 1];
  }

  /** The value at slot index {@code slot}. */
  public String value(int slot) {
    return values[slot];
  }

  /**
   * A block over this block's own values array, split at {@code example}'s context starts, which it
   * shares too: an operation that takes another queue's boundaries copies nothing (ADR-0004).
   *
   * @throws IllegalArgumentException unless {@code example} has as many slots as this block
   */
  QueueBlock withContextsOf(QueueBlock example) {
    return withContextStarts(example.contextStarts);
  }

  /**
   * A block over this block's own values array, split at {@code contextStarts} instead: a context
   * operation that changes only the boundaries shares the values (ADR-0004).
   *
   * @throws IllegalArgumentException as {@link #of} does
   */
  QueueBlock withContextStarts(int[] contextStarts) {
    return of(values, contextStarts);
  }

  /**
   * A block over {@code values}, split at this block's own context starts: a context operation that
   * keeps the boundaries of an input shares them (ADR-0004).
   *
   * @throws IllegalArgumentException unless {@code values} has as many slots as this block
   */
  QueueBlock withValues(String[] values) {
    return of(values, contextStarts);
  }

  /**
   * A block of one context that holds every slot of {@code values}. The starts {@code {0, n}} are
   * valid for any {@code n}, so unlike {@link #of} it checks nothing.
   */
  static QueueBlock ofOneContext(String[] values) {
    return new QueueBlock(values, new int[] {0, values.length});
  }

  /**
   * Builds a block context by context: {@link #newContext()} opens a context, {@link
   * #append(String)} adds a slot to it. Without a {@code newContext()} the block has no context.
   */
  public static final class Builder {

    private String[] values = new String[8];
    private int slots;

    /** The start of each context opened so far. */
    private int[] starts = new int[8];

    private int contexts;

    /** An empty builder: no context, no slot. */
    public Builder() {}

    /** Opens a new context; the slots appended next belong to it. */
    public void newContext() {
      if (contexts == starts.length) {
        starts = Arrays.copyOf(starts, contexts * 2);
      }
      starts[contexts++] = slots;
    }

    /** Appends {@code value} as a slot of the context opened last. */
    public void append(String value) {
      if (slots == values.length) {
        values = Arrays.copyOf(values, slots * 2);
      }
      values[slots++] = value;
    }

    /**
     * The block built so far.
     *
     * @throws IllegalArgumentException when a slot was appended before the first context opened
     */
    public QueueBlock build() {
      int[] contextStarts = Arrays.copyOf(starts, contexts + 1);
      contextStarts[contexts] = slots;
      return of(Arrays.copyOf(values, slots), contextStarts);
    }
  }
}
