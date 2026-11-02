package io.flottila.mapping.ir;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Re-checks IR after lowering and after every optimiser pass (ADR-0006). A refusal is a compiler
 * bug, not a user error, so it throws. A node's type is derived: a {@link SourceQueue} is a queue,
 * a {@link Literal} a string, a {@link VarRef} has the type it stores and a {@link FunCall} its
 * {@link FunctionRef}'s result; content gives no value. It checks:
 *
 * <ul>
 *   <li>every {@link VarRef} reads a variable in scope with the type it is bound with: the root's
 *       slot number ({@code INTEGER}) in the document's content, and a {@link TargetSlots}' value
 *       ({@code STRING}) only in its body;
 *   <li>a {@link SourceQueue}'s context is a proper ancestor of its field;
 *   <li>a {@link TargetSlots}' {@code min} is at most its {@code max}, and its queue is a queue;
 *   <li>a {@link FunCall} has one argument per parameter type of its {@link FunctionRef}, each of
 *       that type; a context function's (one whose result is a queue) atomic argument is a param,
 *       and a param is a {@link Literal} (ADR-0025).
 * </ul>
 */
public final class IrVerifier {

  private static final QueueType QUEUE = new QueueType();

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

  /**
   * Checks {@code expr}; the type of the value it gives, or empty for content, which gives none.
   */
  private static Optional<IrType> check(Expr expr, Map<String, AtomicType> scope) {
    return switch (expr) {
      case SourceQueue q -> {
        if (q.contextDepth() < 1 || q.contextDepth() >= q.field().size()) {
          throw refused(q, "context depth " + q.contextDepth() + " is no proper ancestor");
        }
        yield Optional.of(QUEUE);
      }
      case VarRef v -> {
        if (scope.get(v.name()) != v.type()) {
          throw refused(v, v.name() + " is not in scope as " + v.type());
        }
        yield Optional.of(v.type());
      }
      case Literal _ -> Optional.of(AtomicType.STRING);
      case FunCall c -> {
        call(c, scope);
        yield Optional.of(c.function().resultType());
      }
      case TargetSlots s -> {
        if (s.min() > s.max()) {
          throw refused(s, "min " + s.min() + " is above max " + s.max());
        }
        if (!check(s.queue(), scope).equals(Optional.of(QUEUE))) {
          throw refused(s, "its queue is no queue");
        }
        check(s.parentSlot(), scope);
        Map<String, AtomicType> body = new HashMap<>(scope);
        body.put(s.valueVar(), AtomicType.STRING);
        check(s.body(), body);
        yield Optional.empty();
      }
      case ElementConstructor e -> {
        for (Expr content : e.content()) {
          check(content, scope);
        }
        yield Optional.empty();
      }
      case TextConstructor t -> {
        check(t.value(), scope);
        yield Optional.empty();
      }
    };
  }

  private static void call(FunCall c, Map<String, AtomicType> scope) {
    FunctionRef function = c.function();
    List<IrType> types = function.paramTypes();
    if (c.args().size() != types.size()) {
      throw refused(
          c, function.name() + " takes " + types.size() + " args, not " + c.args().size());
    }
    boolean contextFunction = function.resultType() instanceof QueueType;
    for (int i = 0; i < types.size(); i++) {
      Expr arg = c.args().get(i);
      IrType type = types.get(i);
      if (!check(arg, scope).equals(Optional.of(type))) {
        throw refused(c, function.name() + " takes a " + type + ", not " + arg);
      }
      if (contextFunction && type instanceof AtomicType && !(arg instanceof Literal)) {
        throw refused(c, function.name() + " takes a param as a Literal, not " + arg);
      }
    }
  }

  private static IllegalArgumentException refused(Expr expr, String why) {
    return new IllegalArgumentException(
        expr.getClass().getSimpleName() + " of " + expr.origin().value() + ": " + why);
  }
}
