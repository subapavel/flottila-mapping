package io.flottila.mapping.ir;

import java.util.List;

/**
 * The queue of one source field in one context (ADR-0004, ADR-0006 as refined by #26), filled by
 * the projection: {@code po:source-queue(array:join(context ! [field ! string()]))} for a leaf
 * field, and {@code po:source-queue(array:join(context ! [field ! '']))} for a structure field, one
 * {@code ""} per occurrence (ADR-0008; #63). {@code po:source-queue} makes a queue whose context
 * never occurs one empty context (ADR-0004 as amended, F-17).
 *
 * @param field the field's element steps from the root down
 * @param contextDepth the context field as the number of steps from the root down to it; the root
 *     is 1, and the context is a proper ancestor of the field
 * @param structureField whether the field is a structure field, whose queue holds {@code ""} per
 *     occurrence instead of its text
 * @param origin the source-field box
 */
public record SourceQueue(
    List<Name> field,
    int contextDepth,
    boolean structureField,
    boolean attribute, // stub: #102 test-author
    AuthoringId origin)
    implements Expr {

  public SourceQueue {
    field = List.copyOf(field);
  }

  /** The queue of an element field. */
  public SourceQueue(
      List<Name> field, int contextDepth, boolean structureField, AuthoringId origin) {
    this(field, contextDepth, structureField, false, origin); // stub: #102 test-author
  }

  /** The queue of a leaf field, which holds its text per occurrence. */
  public SourceQueue(List<Name> field, int contextDepth, AuthoringId origin) {
    this(field, contextDepth, false, origin);
  }
}
