package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.Lift;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.QueueType;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import io.flottila.mapping.xdm.Lifting;
import io.flottila.mapping.xdm.QueueBlock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tier 0, the closure-compiled interpreter (ADR-0021). Compiling turns the IR once into a tree of
 * executable nodes over a frame: variables become slots, source queues become indexes into the
 * projection plan, a context or single-value function is bound by its name once per call site
 * (ADR-0025), and nothing is looked up by name while a mapping runs. A traced compile reports every
 * source queue, context function call and {@code Lift} it evaluates to the run's tracer, at its
 * box; an untraced compile has no hook at all.
 */
public final class Interpreter {

  private final boolean traced;

  /** The projection plan: each distinct (field, context) pair and its queue index. */
  private final Map<Projection.Queue, Integer> plan = new LinkedHashMap<>();

  /** The number of {@code INTEGER} frame slots allocated so far. */
  private int integerSlotCount;

  /** The number of {@code STRING} frame slots allocated so far. */
  private int stringSlotCount;

  /** The number of {@code TargetSlots} so far, each with a frame slot for its queue's block. */
  private int targetQueueCount;

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
    int rootSlot = compiler.integerSlotCount++;
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
        compiler.integerSlotCount,
        compiler.stringSlotCount,
        compiler.targetQueueCount);
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
      case Literal l -> constant(l.value());
      case FunCall c ->
          switch (c.function().resultType()) {
            case QueueType _ -> call(c, scope);
            case AtomicType _ -> singleValueCall(c, scope);
          };
      case Lift l -> lift(l, scope);
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
    return traced(q.origin(), frame -> frame.queues[index]);
  }

  /**
   * A call of a context function: its inputs' nodes and its params' strings, bound by the
   * function's name. A {@code Literal} argument is a param, which the IR verifier allows only as a
   * {@code Literal}; any other argument is an input.
   */
  private Node.OfQueue call(FunCall c, Map<String, Integer> scope) {
    List<Node.OfQueue> inputs = new ArrayList<>();
    List<String> params = new ArrayList<>();
    for (Expr arg : c.args()) {
      if (arg instanceof Literal param) {
        params.add(param.value());
      } else {
        inputs.add((Node.OfQueue) compile(arg, scope));
      }
    }
    return traced(c.origin(), QueueLibrary.bind(c.function().name(), c.origin(), inputs, params));
  }

  /**
   * A call of a single-value function, its args' string nodes bound by the function's name. It
   * gives a string, not a queue, so it is not traced: the {@code Lift} around it is (ADR-0006).
   */
  private Node.OfString singleValueCall(FunCall c, Map<String, Integer> scope) {
    List<Node.OfString> args = new ArrayList<>();
    for (Expr arg : c.args()) {
      args.add((Node.OfString) compile(arg, scope));
    }
    return SingleValueLibrary.bind(c.function().name(), args);
  }

  /**
   * A {@code Lift} (ADR-0006): its inputs' nodes in {@code scope}, and its body's node in a scope
   * of its slot variables only, each a string frame slot of its own. Per slot, the slot's values go
   * into those frame slots and the body reads them there.
   */
  private Node.OfQueue lift(Lift l, Map<String, Integer> scope) {
    Node.OfQueue[] inputs = new Node.OfQueue[l.queues().size()];
    int[] slotVars = new int[inputs.length];
    Map<String, Integer> slots = new HashMap<>();
    for (int k = 0; k < inputs.length; k++) {
      inputs[k] = (Node.OfQueue) compile(l.queues().get(k), scope);
      slotVars[k] = stringSlotCount++;
      slots.put(l.slotVars().get(k), slotVars[k]);
    }
    Node.OfString body = (Node.OfString) compile(l.body(), slots);
    return traced(
        l.origin(),
        frame -> {
          QueueBlock[] blocks = new QueueBlock[inputs.length];
          for (int k = 0; k < blocks.length; k++) {
            blocks[k] = inputs[k].eval(frame);
          }
          return Lifting.lift(
              Arrays.asList(blocks),
              values -> {
                for (int k = 0; k < slotVars.length; k++) {
                  frame.strings[slotVars[k]] = values[k];
                }
                return body.eval(frame);
              });
        });
  }

  /** {@code node}, which reports each queue it gives at {@code box} when the compile is traced. */
  private Node.OfQueue traced(AuthoringId box, Node.OfQueue node) {
    if (!traced) {
      return node;
    }
    return frame -> {
      QueueBlock block = node.eval(frame);
      frame.tracer.value(box, block);
      return block;
    };
  }

  private static Node.OfString constant(String value) {
    return frame -> value;
  }

  private static Node variable(VarRef v, int slot) {
    return switch (v.type()) {
      case INTEGER -> (Node.OfInteger) frame -> frame.integers[slot];
      case STRING -> (Node.OfString) frame -> frame.strings[slot];
    };
  }

  /**
   * A {@code TargetSlots} (ADR-0006 since #52): its queue and parent slot in {@code scope}, and its
   * body in {@code scope} with its slot-number variable, an {@code INTEGER} frame slot of its own,
   * and its value variable, a {@code STRING} one.
   */
  private Node.OfContent slots(TargetSlots s, Map<String, Integer> scope) {
    Node.OfQueue queue = (Node.OfQueue) compile(s.queue(), scope);
    Node.OfInteger parentSlot = (Node.OfInteger) compile(s.parentSlot(), scope);
    int queueIndex = targetQueueCount++;
    int slotNumberIndex = integerSlotCount++;
    int valueIndex = stringSlotCount++;
    Map<String, Integer> body = new HashMap<>(scope);
    body.put(s.slotVar(), slotNumberIndex);
    body.put(s.valueVar(), valueIndex);
    return new Node.Slots(
        queue,
        queueIndex,
        parentSlot,
        s.min(),
        s.max(),
        slotNumberIndex,
        valueIndex,
        (Node.OfContent) compile(s.body(), body),
        s.origin());
  }

  private static Node.OfContent text(Node.OfString value) {
    return frame -> frame.out.text(value.eval(frame));
  }
}
