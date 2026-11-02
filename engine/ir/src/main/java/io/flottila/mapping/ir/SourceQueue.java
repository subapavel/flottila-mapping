package io.flottila.mapping.ir;

import java.util.List;

/**
 * The queue of one source field in one context (ADR-0004, ADR-0006 as refined by #26): {@code
 * array:join(context ! [field ! string()])}, filled by the projection.
 *
 * @param field the field's element steps from the root down
 * @param contextDepth the context field as the number of steps from the root down to it; the root
 *     is 1, and the context is a proper ancestor of the field
 * @param origin the source-field box
 */
public record SourceQueue(List<Name> field, int contextDepth, AuthoringId origin) implements Expr {

  public SourceQueue {
    field = List.copyOf(field);
  }
}
