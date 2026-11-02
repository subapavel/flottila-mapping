package io.flottila.mapping.ir;

import java.util.HashMap;
import java.util.Map;

/**
 * Re-checks IR after lowering and after every optimiser pass (ADR-0006). A refusal is a compiler
 * bug, not a user error, so it throws. Spec 1 checks:
 *
 * <ul>
 *   <li>every {@link VarRef} reads a variable in scope with the type it is bound with: the root's
 *       slot number ({@code INTEGER}) in the document's content, and a {@link TargetSlots}' value
 *       ({@code STRING}) only in its body;
 *   <li>a {@link SourceQueue}'s context is a proper ancestor of its field;
 *   <li>a {@link TargetSlots}' {@code min} is at most its {@code max}.
 * </ul>
 */
public final class IrVerifier {

  private IrVerifier() {}

  /**
   * Checks {@code document}.
   *
   * @throws IllegalArgumentException naming the first defect found and its origin
   */
  public static void verify(TargetDocument document) {
    Map<String, AtomicType> scope = Map.of(document.rootSlot(), AtomicType.INTEGER);
    for (Expr expr : document.content()) {
      check(expr, scope);
    }
  }

  private static void check(Expr expr, Map<String, AtomicType> scope) {
    switch (expr) {
      case SourceQueue q -> {
        if (q.contextDepth() < 1 || q.contextDepth() >= q.field().size()) {
          throw refused(q, "context depth " + q.contextDepth() + " is no proper ancestor");
        }
      }
      case VarRef v -> {
        if (scope.get(v.name()) != v.type()) {
          throw refused(v, v.name() + " is not in scope as " + v.type());
        }
      }
      case TargetSlots s -> {
        if (s.min() > s.max()) {
          throw refused(s, "min " + s.min() + " is above max " + s.max());
        }
        check(s.queue(), scope);
        check(s.parentSlot(), scope);
        Map<String, AtomicType> body = new HashMap<>(scope);
        body.put(s.valueVar(), AtomicType.STRING);
        check(s.body(), body);
      }
      case ElementConstructor e -> {
        for (Expr content : e.content()) {
          check(content, scope);
        }
      }
      case TextConstructor t -> check(t.value(), scope);
    }
  }

  private static IllegalArgumentException refused(Expr expr, String why) {
    return new IllegalArgumentException(
        expr.getClass().getSimpleName() + " of " + expr.origin().value() + ": " + why);
  }
}
