package io.flottila.mapping.ir;

import java.util.List;

/**
 * The queue of one source field in one context (ADR-0004, ADR-0006 as refined by #26), filled by
 * the projection: {@code array:join(context ! [field ! string()])} for a leaf field, and {@code
 * array:join(context ! [field ! ''])} for a structure field, one {@code ""} per occurrence
 * (ADR-0008; #63).
 *
 * @param field the field's element steps from the root down
 * @param contextDepth the context field as the number of steps from the root down to it; the root
 *     is 1, and the context is a proper ancestor of the field
 * @param structureField whether the field is a structure field, whose queue holds {@code ""} per
 *     occurrence instead of its text
 * @param origin the source-field box
 */
public record SourceQueue(
    List<Name> field, int contextDepth, boolean structureField, AuthoringId origin)
    implements Expr {

  public SourceQueue {
    field = List.copyOf(field);
  }

  /** The queue of a leaf field, which holds its text per occurrence. */
  public SourceQueue(List<Name> field, int contextDepth, AuthoringId origin) {
    this(field, contextDepth, false, origin);
  }
}
