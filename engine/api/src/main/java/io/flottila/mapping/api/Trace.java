package io.flottila.mapping.api;

import io.flottila.mapping.ir.AuthoringId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.SequencedMap;

/**
 * The trace of a test run (ADR-0015 "Trace" as refined by #53; GLOSSARY "Trace", "Trace limit",
 * "Parent slot"): an entry per evaluated box and per target field mapping that ran, by authoring
 * id, in the order of first report. Constants and boxes that were never evaluated have none.
 *
 * @param entries the entries by authoring id, in the order of first report
 */
public record Trace(SequencedMap<AuthoringId, Entry> entries) {

  public Trace {
    entries = Collections.unmodifiableSequencedMap(new LinkedHashMap<>(entries));
  }

  /** One entry of the trace, by its kind. */
  public sealed interface Entry permits Queue, Occurrences {}

  /**
   * The queue a box gave, at its first report: at most the trace limit's contexts, holding at most
   * its slots.
   *
   * @param contexts the contexts kept, each its values in order, {@code null} for SUPPRESS
   * @param capped whether the queue has more slots or contexts than the trace limit, so some were
   *     left out
   * @param slotCount the queue's slots, all of them
   * @param contextCount the queue's contexts, all of them
   */
  public record Queue(List<List<String>> contexts, boolean capped, int slotCount, int contextCount)
      implements Entry {

    public Queue {
      List<List<String>> copies = new ArrayList<>(contexts.size());
      for (List<String> context : contexts) {
        // a copy that keeps the nulls of SUPPRESS, which List.copyOf refuses
        copies.add(Collections.unmodifiableList(new ArrayList<>(context)));
      }
      contexts = Collections.unmodifiableList(copies);
    }
  }

  /**
   * The occurrences a target field mapping created, per parent slot in the order run (ADR-0006): at
   * most the trace limit's parent records and slot records, always keeping the last parent. The
   * field's queue is the entry of its {@code result} box.
   *
   * @param min the field's effective minimum occurrence
   * @param max the field's effective maximum occurrence; {@link Long#MAX_VALUE} is unbounded
   * @param parents the parent records kept
   * @param capped whether the field has more parent records or slot records than the trace limit,
   *     so some were left out
   */
  public record Occurrences(long min, long max, List<ParentSlot> parents, boolean capped)
      implements Entry {

    public Occurrences {
      parents = List.copyOf(parents);
    }
  }

  /**
   * The slots of context {@code parentSlot} of the field's queue. {@code created < min} marks the
   * parent slot that raised {@code po:MINOCCURS}.
   *
   * @param parentSlot the slot number of the parent occurrence
   * @param created how many occurrences the slots create, at most max
   * @param slots the slots kept, in order
   */
  public record ParentSlot(long parentSlot, long created, List<Slot> slots) {

    public ParentSlot {
      slots = List.copyOf(slots);
    }
  }

  /**
   * One slot of a parent slot's context.
   *
   * @param slot its slot number, counted across all contexts of the queue
   * @param status what it created
   */
  public record Slot(long slot, SlotStatus status) {}

  /** What a slot created (GLOSSARY "Truncated slot", "SUPPRESS"). */
  public enum SlotStatus {
    /** An occurrence. */
    CREATED,
    /** Nothing: the slot is SUPPRESS. */
    SUPPRESSED,
    /** Nothing: {@code max} occurrences were created before it in its context. */
    TRUNCATED
  }
}
