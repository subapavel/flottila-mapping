package io.flottila.mapping.ir;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Re-checks IR after lowering and after every optimiser pass (ADR-0006). A refusal is a compiler
 * bug, not a user error, so it throws. A node's type is derived: a {@link SourceQueue} and a {@link
 * Lift} are queues, a {@link Literal} a string, a {@link VarRef} has the type it stores and a
 * {@link FunCall} its {@link FunctionRef}'s result; content gives no value. It checks:
 *
 * <ul>
 *   <li>every {@link VarRef} reads a variable in scope with the type it is bound with: the root's
 *       slot number ({@code INTEGER}) in the document's content, a {@link TargetSlots}' slot number
 *       ({@code INTEGER}) and value ({@code STRING}) only in its body (#52), and a {@link Lift}'s
 *       slot variables ({@code STRING}) only in its body, which sees nothing else;
 *   <li>a {@link SourceQueue}'s context is a proper ancestor of its field;
 *   <li>a {@link TargetSlots}' {@code min} is at most its {@code max}, its queue is a queue and its
 *       parent slot an {@code INTEGER};
 *   <li>a {@link FunCall} has one argument per parameter type of its {@link FunctionRef}, each of
 *       that type; a context function's (one whose result is a queue) atomic argument is a param,
 *       and a param is a {@link Literal} (ADR-0025);
 *   <li>a {@link Lift} has at least one input, each a queue, one slot variable per input, all
 *       distinct and none named {@code in}, which the export binds (ADR-0025), and a {@code STRING}
 *       body (ADR-0006 since #51);
 *   <li>a {@link TextConstructor}'s value is a {@code STRING}, and the document's content, an
 *       {@link ElementConstructor}'s content and a {@link TargetSlots}' body are content (#51).
 * </ul>
 */
public final class IrVerifier {

  private static final QueueType QUEUE = new QueueType();

  /** The inline function of an exported {@code Lift} takes its slot's values as {@code $in}. */
  private static final String RESERVED_SLOT_VAR = "in";

  private IrVerifier() {}

  /**
   * Checks {@code document}.
   *
   * @throws IllegalArgumentException naming the first defect found and its origin
   */
  public static void verify(TargetDocument document) {
    Map<String, AtomicType> scope = Map.of(document.rootSlot(), AtomicType.INTEGER);
    for (Expr expr : document.content()) {
      content(expr, scope);
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
      case Lift l -> {
        lift(l, scope);
        yield Optional.of(QUEUE);
      }
      case TargetSlots s -> {
        if (s.min() > s.max()) {
          throw refused(s, "min " + s.min() + " is above max " + s.max());
        }
        value(s, s.queue(), QUEUE, scope, "its queue");
        value(s, s.parentSlot(), AtomicType.INTEGER, scope, "its parent slot");
        Map<String, AtomicType> body = new HashMap<>(scope);
        body.put(s.slotVar(), AtomicType.INTEGER);
        body.put(s.valueVar(), AtomicType.STRING);
        content(s.body(), body);
        yield Optional.empty();
      }
      case ElementConstructor e -> {
        for (Expr content : e.content()) {
          content(content, scope);
        }
        yield Optional.empty();
      }
      case TextConstructor t -> {
        value(t, t.value(), AtomicType.STRING, scope, "its value");
        yield Optional.empty();
      }
    };
  }

  /** Checks {@code expr}, which stands where content stands. */
  private static void content(Expr expr, Map<String, AtomicType> scope) {
    if (check(expr, scope).isPresent()) {
      throw refused(expr, "it is a value where content stands");
    }
  }

  /**
   * Checks {@code expr}, which stands where {@code at} takes a value of {@code type}, named {@code
   * what}.
   */
  private static void value(
      Expr at, Expr expr, IrType type, Map<String, AtomicType> scope, String what) {
    if (!check(expr, scope).equals(Optional.of(type))) {
      throw refused(at, what + " is no " + type + ": " + expr);
    }
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
      value(c, arg, type, scope, function.name() + "'s arg");
      if (contextFunction && type instanceof AtomicType && !(arg instanceof Literal)) {
        throw refused(c, function.name() + " takes a param as a Literal, not " + arg);
      }
    }
  }

  /**
   * Checks {@code l}'s inputs in {@code scope}, and its body in a scope of its slot variables only.
   */
  private static void lift(Lift l, Map<String, AtomicType> scope) {
    List<Expr> queues = l.queues();
    if (queues.isEmpty()) {
      throw refused(l, "it has no input");
    }
    if (l.slotVars().size() != queues.size()) {
      throw refused(
          l, "it has " + queues.size() + " inputs and " + l.slotVars().size() + " slot variables");
    }
    Map<String, AtomicType> slots = new HashMap<>();
    for (int k = 0; k < queues.size(); k++) {
      value(l, queues.get(k), QUEUE, scope, "its input");
      String slotVar = l.slotVars().get(k);
      if (slotVar.equals(RESERVED_SLOT_VAR)) {
        throw refused(l, "its slot variable in is reserved: the export binds $in (ADR-0025)");
      }
      if (slots.put(slotVar, AtomicType.STRING) != null) {
        throw refused(l, "it binds the slot variable " + slotVar + " twice");
      }
    }
    value(l, l.body(), AtomicType.STRING, slots, "its body");
  }

  private static IllegalArgumentException refused(Expr expr, String why) {
    return new IllegalArgumentException(
        expr.getClass().getSimpleName() + " of " + expr.origin().value() + ": " + why);
  }
}
