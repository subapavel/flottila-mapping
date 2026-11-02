package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Records what the boxes of a traced compile produced in one mapping run (ADR-0006, ADR-0021): one
 * report per evaluation, in the order made, so a box evaluated twice shows twice. An untraced
 * compile never reports. One tracer serves one run.
 */
public final class Tracer {

  private final List<Map.Entry<AuthoringId, QueueBlock>> values = new ArrayList<>();

  /** An empty tracer. */
  public Tracer() {}

  void value(AuthoringId box, QueueBlock queue) {
    values.add(Map.entry(box, queue));
  }

  /** Every report so far, in the order made: the box's authoring id and its queue. */
  public List<Map.Entry<AuthoringId, QueueBlock>> values() {
    return List.copyOf(values);
  }
}
