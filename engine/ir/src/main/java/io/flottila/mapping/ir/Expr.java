package io.flottila.mapping.ir;

/**
 * A node of the IR every front end lowers to (ADR-0006). The IR is pure data. Each node names the
 * authoring element it came from, for tracing and errors. Spec 1 has the nodes of a field link; the
 * other records of ADR-0006 join with the features that need them.
 */
public sealed interface Expr
    permits SourceQueue, VarRef, TargetSlots, ElementConstructor, TextConstructor {

  /** The authoring element this node came from. */
  AuthoringId origin();
}
