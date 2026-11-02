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
      case "collapseContexts" -> {
        Node.OfQueue input = inputs.getFirst();
        yield frame -> ContextFunctions.collapseContexts(input.eval(frame));
      }
      case "removeContexts" -> {
        Node.OfQueue input = inputs.getFirst();
        yield frame -> ContextFunctions.removeContexts(input.eval(frame));
      }
      case "useOneAsMany" -> {
        Node.OfQueue value = inputs.get(0);
        Node.OfQueue occurrences = inputs.get(1);
        Node.OfQueue contexts = inputs.get(2);
        yield frame ->
            ContextFunctions.useOneAsMany(
                value.eval(frame), occurrences.eval(frame), contexts.eval(frame));
      }
      default -> throw new IllegalArgumentException("the runtime library has no function " + name);
    };
  }
}
