package io.flottila.mapping.runtime;

import java.util.List;

/**
 * The binding of the single-value functions (ADR-0025): a catalogue name, bound once per call site
 * when the interpreter compiles, to a string node over its args' string nodes. Such a call stands
 * in a {@code Lift}'s body, which runs it once per slot (ADR-0006).
 */
final class SingleValueLibrary {

  private SingleValueLibrary() {}

  /**
   * The node of a call of {@code name} over {@code args}, which the IR verifier has checked against
   * the call's {@code FunctionRef}: the inputs, then the params, in catalogue order.
   *
   * @throws IllegalArgumentException when no single-value function is called {@code name}: lowering
   *     calls only functions of the catalogue, so this is a compiler bug
   */
  static Node.OfString bind(String name, List<Node.OfString> args) {
    return switch (name) {
      // replaceValue(value, replacement): the replacement, whatever the value
      case "replaceValue" -> args.get(1);
      default ->
          throw new IllegalArgumentException(
              "the runtime library has no single-value function " + name);
    };
  }
}
