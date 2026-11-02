package io.flottila.mapping.runtime;

import io.flottila.mapping.serializer.XmlSerializer;
import io.flottila.mapping.xdm.QueueBlock;

/**
 * The dynamic context of one mapping run (ADR-0021): the projected source queues, the variables as
 * slots, and the output. The compiled nodes find everything here by index, never by name.
 */
final class Frame {

  /** The source queues by their index in the projection plan. */
  final QueueBlock[] queues;

  final Tracer tracer;
  final XmlSerializer out;

  /** The {@code INTEGER} variables (slot numbers) by slot. */
  final long[] integers;

  /** The {@code STRING} variables (slot values) by slot. */
  final String[] strings;

  Frame(QueueBlock[] queues, Tracer tracer, XmlSerializer out, int integers, int strings) {
    this.queues = queues;
    this.tracer = tracer;
    this.out = out;
    this.integers = new long[integers];
    this.strings = new String[strings];
  }
}
