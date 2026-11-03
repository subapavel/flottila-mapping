package io.flottila.mapping.api;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.runtime.Tracer;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SequencedMap;

/**
 * Builds a test run's {@link Trace} from its tracer's reports, off the run's thread (ADR-0006 and
 * ADR-0015 since #53). The slot statuses are derived here from context p and max, and each entry is
 * capped at the trace limit.
 */
final class TraceBuilder {

  private TraceBuilder() {}

  /**
   * The trace of {@code reports}, a tracer's reports in the order made: one entry per authoring id
   * in the order of its first report, across both kinds. A box's entry is its first queue, as a box
   * feeding several inputs is reported once per evaluation; a target field mapping's entry holds a
   * parent record per report.
   *
   * @param limit the trace limit: the most slots, contexts or occurrence records one entry keeps
   */
  static Trace build(List<Tracer.Report> reports, int limit) {
    SequencedMap<AuthoringId, Tracer.Report> first = new LinkedHashMap<>();
    Map<AuthoringId, List<Tracer.Occurrences>> parents = new HashMap<>();
    for (Tracer.Report report : reports) {
      switch (report) {
        case Tracer.Value value -> first.putIfAbsent(value.box(), value);
        case Tracer.Occurrences occurrences -> {
          first.putIfAbsent(occurrences.field(), occurrences);
          parents.computeIfAbsent(occurrences.field(), field -> new ArrayList<>()).add(occurrences);
        }
      }
    }
    SequencedMap<AuthoringId, Trace.Entry> entries = new LinkedHashMap<>();
    first.forEach(
        (id, report) ->
            entries.put(
                id,
                switch (report) {
                  case Tracer.Value value -> queue(value.queue(), limit);
                  case Tracer.Occurrences o ->
                      occurrences(o.min(), o.max(), parents.get(id), limit);
                }));
    return new Trace(entries);
  }

  /**
   * {@code block}'s first {@code limit} contexts, holding its first {@code limit} slots, and its
   * totals. A SUPPRESS slot's value is null.
   */
  private static Trace.Queue queue(QueueBlock block, int limit) {
    List<List<String>> contexts = new ArrayList<>();
    int kept = 0;
    for (int context = 0; context < block.contexts() && context < limit; context++) {
      List<String> values = new ArrayList<>();
      for (int slot = block.start(context); slot < block.end(context) && kept < limit; slot++) {
        values.add(block.value(slot));
        kept++;
      }
      contexts.add(values);
    }
    boolean capped = block.slots() > limit || block.contexts() > limit;
    return new Trace.Queue(contexts, capped, block.slots(), block.contexts());
  }

  /**
   * A target field mapping's parent records, one per report: the first {@code limit - 1} and the
   * last, holding at most {@code limit} slot records in order.
   */
  private static Trace.Occurrences occurrences(
      long min, long max, List<Tracer.Occurrences> reports, int limit) {
    List<Trace.ParentSlot> parents = new ArrayList<>();
    long slotRecords = 0;
    int budget = limit;
    int last = reports.size() - 1;
    for (int i = 0; i <= last; i++) {
      Tracer.Occurrences report = reports.get(i);
      QueueBlock queue = report.queue();
      long parentSlot = report.parentSlot();
      // a context the queue lacks counts as empty (ADR-0006)
      int start = 0;
      int end = 0;
      if (parentSlot <= queue.contexts()) {
        start = queue.start((int) parentSlot - 1);
        end = queue.end((int) parentSlot - 1);
      }
      slotRecords += end - start;
      if (i < limit - 1 || i == last) {
        Trace.ParentSlot parent = parent(parentSlot, queue, start, end, max, budget);
        budget -= parent.slots().size();
        parents.add(parent);
      }
    }
    boolean capped = reports.size() > limit || slotRecords > limit;
    return new Trace.Occurrences(min, max, parents, capped);
  }

  /**
   * The parent record of the slots {@code start} to {@code end} of {@code queue}: each slot
   * SUPPRESS is suppressed, any other created until {@code max} are, then truncated (ADR-0006). It
   * keeps at most {@code budget} slot records, and counts the created ones over all of them.
   */
  private static Trace.ParentSlot parent(
      long parentSlot, QueueBlock queue, int start, int end, long max, int budget) {
    List<Trace.Slot> slots = new ArrayList<>();
    long created = 0;
    for (int slot = start; slot < end; slot++) {
      Trace.SlotStatus status;
      if (queue.suppressed(slot)) {
        status = Trace.SlotStatus.SUPPRESSED;
      } else if (created < max) {
        status = Trace.SlotStatus.CREATED;
        created++;
      } else {
        status = Trace.SlotStatus.TRUNCATED;
      }
      if (slots.size() < budget) {
        slots.add(new Trace.Slot(slot + 1L, status));
      }
    }
    return new Trace.ParentSlot(parentSlot, created, slots);
  }
}
