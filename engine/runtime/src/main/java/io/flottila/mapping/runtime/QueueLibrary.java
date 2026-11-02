package io.flottila.mapping.runtime;

import io.flottila.mapping.xdm.ContextFunctions;
import java.util.List;

/**
 * The binding of the runtime library (ADR-0025, refining ADR-0021's queue-operation library): a
 * context function's catalogue name, bound once per call site when the interpreter compiles, to its
 * algebra in {@link ContextFunctions}. A param is parsed here, into the node, so nothing is looked
 * up by name or parsed while a mapping runs.
 */
final class QueueLibrary {

  private QueueLibrary() {}

  /**
   * The node of a call of {@code name} over {@code inputs} with {@code params}, which the IR
   * verifier has checked against the call's {@code FunctionRef}.
   *
   * @param params the strings of the call's params, in catalogue order
   * @throws IllegalArgumentException when the runtime library has no function {@code name}, or the
   *     function no such param value: lowering calls only functions of the catalogue, with values
   *     it lists, so this is a compiler bug
   */
  static Node.OfQueue bind(String name, List<Node.OfQueue> inputs, List<String> params) {
    return switch (name) {
      case "collapseContexts" -> {
        Node.OfQueue input = inputs.getFirst();
        yield frame -> ContextFunctions.collapseContexts(input.eval(frame));
      }
      case "formatByExample" -> {
        Node.OfQueue values = inputs.get(0);
        Node.OfQueue example = inputs.get(1);
        yield frame -> ContextFunctions.formatByExample(values.eval(frame), example.eval(frame));
      }
      case "removeContexts" -> {
        Node.OfQueue input = inputs.getFirst();
        yield frame -> ContextFunctions.removeContexts(input.eval(frame));
      }
      case "splitByValue" -> splitByValue(inputs.getFirst(), params.getFirst());
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

  /** {@code splitByValue} over {@code input}, its mode parsed once. */
  private static Node.OfQueue splitByValue(Node.OfQueue input, String mode) {
    return switch (mode) {
      case "eachValue" -> frame -> ContextFunctions.splitByEachValue(input.eval(frame));
      case "valueChange" -> frame -> ContextFunctions.splitByValueChange(input.eval(frame));
      case "emptyValue" -> frame -> ContextFunctions.splitByEmptyValue(input.eval(frame));
      default -> throw new IllegalArgumentException("splitByValue has no mode " + mode);
    };
  }
}
