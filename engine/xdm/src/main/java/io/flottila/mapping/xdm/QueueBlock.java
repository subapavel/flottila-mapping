package io.flottila.mapping.xdm;

import java.util.Arrays;

/**
 * The runtime representation of a queue (ADR-0004): {@code n} slots in {@code values} and {@code c
 * + 1} {@code contextStarts}, where {@code [0] = 0}, {@code [c] = n} and no entry decreases.
 * Context {@code k} spans the slots {@code start(k)} to {@code end(k)}; contexts and slots are
 * counted from 0. A block with no contexts ({@code {0}}) differs from one with one empty context
 * ({@code {0, 0}}). Spec 1 has no SUPPRESS.
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
   */
  public static QueueBlock of(String[] values, int[] contextStarts) {
    if (contextStarts.length == 0) {
      throw new IllegalArgumentException("contextStarts has no entry, not even the end sentinel");
    }
    if (contextStarts[0] != 0) {
      throw new IllegalArgumentException("contextStarts[0] is " + contextStarts[0] + ", not 0");
    }
    for (int k = 1; k < contextStarts.length; k++) {
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

  /** The first slot of context {@code context}. */
  public int start(int context) {
    return contextStarts[context];
  }

  /** The slot after the last slot of context {@code context}. */
  public int end(int context) {
    return contextStarts[context + 1];
  }

  /** The value in slot {@code slot}. */
  public String value(int slot) {
    return values[slot];
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
