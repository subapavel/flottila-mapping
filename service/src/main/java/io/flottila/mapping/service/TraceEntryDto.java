package io.flottila.mapping.service;

import io.flottila.mapping.api.Trace;
import java.util.LinkedHashMap;
import java.util.Map;
import org.eclipse.microprofile.openapi.annotations.media.DiscriminatorMapping;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * One entry of a test run's trace (ADR-0015 "Trace" since #53), on the wire: a union on {@code
 * kind} (ADR-0024).
 */
@Schema(
    oneOf = {TraceQueueDto.class, TraceOccurrencesDto.class},
    discriminatorProperty = "kind",
    discriminatorMapping = {
      @DiscriminatorMapping(value = TraceQueueDto.KIND, schema = TraceQueueDto.class),
      @DiscriminatorMapping(value = TraceOccurrencesDto.KIND, schema = TraceOccurrencesDto.class)
    })
public sealed interface TraceEntryDto permits TraceQueueDto, TraceOccurrencesDto {

  static TraceEntryDto of(Trace.Entry entry) {
    return switch (entry) {
      case Trace.Queue queue -> TraceQueueDto.of(queue);
      case Trace.Occurrences occurrences -> TraceOccurrencesDto.of(occurrences);
    };
  }

  /** The engine's trace on the wire: its entries by authoring id, in the engine's order. */
  static Map<String, TraceEntryDto> all(Trace trace) {
    Map<String, TraceEntryDto> entries = new LinkedHashMap<>();
    trace.entries().forEach((id, entry) -> entries.put(id.value(), of(entry)));
    return entries;
  }
}
