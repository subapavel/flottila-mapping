package io.flottila.mapping.mapping;

import io.flottila.mapping.ir.AuthoringId;
import java.util.Map;
import java.util.Optional;

/**
 * The function graph that produces the values of one target field (ADR-0010).
 *
 * @param id the target field mapping's authoring id
 * @param result the box whose output feeds the field, or empty while it is not wired (F-2)
 * @param boxes the boxes of this target field mapping, keyed by authoring id
 */
public record TargetFieldMapping(
    AuthoringId id, Optional<AuthoringId> result, Map<AuthoringId, Box> boxes) {

  public TargetFieldMapping {
    boxes = Map.copyOf(boxes);
  }
}
