package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tier 0, the closure-compiled interpreter (ADR-0021). Compiling turns the IR once into a tree of
 * executable nodes over a frame: variables become slots, source queues become indexes into the
 * projection plan, and nothing is looked up by name while a mapping runs. A traced compile reports
 * every source queue it evaluates to the run's tracer; an untraced compile has no hook at all.
 */
public final class Interpreter {

  private final boolean traced;

  /** The projection plan: each distinct (field, context) pair and its queue index. */
  private final Map<Projection.Queue, Integer> plan = new LinkedHashMap<>();

  private int integers;
  private int strings;

  private Interpreter(boolean traced) {
    this.traced = traced;
  }

  /**
   * Compiles {@code document}, which the IR verifier has accepted.
   *
   * @param traced whether the nodes report to the run's tracer
   */
  public static ExecutableMapping compile(TargetDocument document, boolean traced) {
    Interpreter compiler = new Interpreter(traced);
    int rootSlot = compiler.integers++;
    Map<String, Integer> scope = Map.of(document.rootSlot(), rootSlot);
    Name root = document.root();
    Node.OfContent element =
        new Node.Element(
            document.prefix(),
            root.namespace(),
            root.localName(),
            compiler.contents(document.content(), scope));
    return new ExecutableMapping(
        new Projection(List.copyOf(compiler.plan.keySet())),
        rootSlot,
        element,
        compiler.integers,
        compiler.strings);
  }

  /**
   * The node of {@code expr}. Its kind follows the type of {@code expr}, which the verifier checked
   * against the place {@code expr} stands in, so the callers' casts hold.
   *
   * @param scope the slot of each variable in scope
   */
  private Node compile(Expr expr, Map<String, Integer> scope) {
    return switch (expr) {
      case SourceQueue q -> queue(q);
      case VarRef v -> variable(v, scope.get(v.name()));
      case TargetSlots s -> slots(s, scope);
      case ElementConstructor e ->
          new Node.Element(
              e.prefix(), e.name().namespace(), e.name().localName(), contents(e.content(), scope));
      case TextConstructor t -> text((Node.OfString) compile(t.value(), scope));
    };
  }

  private Node.OfContent[] contents(List<Expr> content, Map<String, Integer> scope) {
    List<Node.OfContent> nodes = new ArrayList<>();
    for (Expr expr : content) {
      nodes.add((Node.OfContent) compile(expr, scope));
    }
    return nodes.toArray(Node.OfContent[]::new);
  }

  private Node.OfQueue queue(SourceQueue q) {
    int index =
        plan.computeIfAbsent(new Projection.Queue(q.field(), q.contextDepth()), k -> plan.size());
    if (!traced) {
      return frame -> frame.queues[index];
    }
    AuthoringId box = q.origin();
    return frame -> {
      QueueBlock block = frame.queues[index];
      frame.tracer.value(box, block);
      return block;
    };
  }

  private static Node variable(VarRef v, int slot) {
    return switch (v.type()) {
      case INTEGER -> (Node.OfInteger) frame -> frame.integers[slot];
      case STRING -> (Node.OfString) frame -> frame.strings[slot];
    };
  }

  private Node.OfContent slots(TargetSlots s, Map<String, Integer> scope) {
    Node.OfQueue queue = (Node.OfQueue) compile(s.queue(), scope);
    Node.OfInteger parentSlot = (Node.OfInteger) compile(s.parentSlot(), scope);
    int valueSlot = strings++;
    Map<String, Integer> body = new HashMap<>(scope);
    body.put(s.valueVar(), valueSlot);
    return new Node.Slots(
        queue, parentSlot, s.max(), valueSlot, (Node.OfContent) compile(s.body(), body));
  }

  private static Node.OfContent text(Node.OfString value) {
    return frame -> frame.out.text(value.eval(frame));
  }
}
