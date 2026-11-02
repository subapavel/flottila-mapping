package io.flottila.mapping.runtime;

import io.flottila.mapping.xdm.ContextFunctions;
import java.util.List;

/**
 * The binding of the runtime library (ADR-0025, refining ADR-0021's queue-operation library): a
 * context function's catalogue name, bound once per call site when the interpreter compiles, to its
 * algebra in {@link ContextFunctions}. Nothing is looked up by name while a mapping runs.
 */
final class QueueLibrary {

  private QueueLibrary() {}

  /**
   * The node of a call of {@code name} over {@code inputs}, which the IR verifier has checked
   * against the call's {@code FunctionRef}.
   *
   * @throws IllegalArgumentException when the runtime library has no function {@code name}:
   *     lowering calls only functions of the catalogue, so this is a compiler bug
   */
  static Node.OfQueue bind(String name, List<Node.OfQueue> inputs) {
    return switch (name) {
      case "formatByExample" -> {
        Node.OfQueue values = inputs.get(0);
        Node.OfQueue example = inputs.get(1);
        yield frame -> ContextFunctions.formatByExample(values.eval(frame), example.eval(frame));
      }
      case "removeContexts" -> {
        Node.OfQueue input = inputs.getFirst();
        yield frame -> ContextFunctions.removeContexts(input.eval(frame));
      }
      default -> throw new IllegalArgumentException("the runtime library has no function " + name);
    };
  }
}
