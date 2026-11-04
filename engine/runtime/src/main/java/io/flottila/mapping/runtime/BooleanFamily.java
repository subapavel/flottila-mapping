package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.BooleanFunctions;
import java.util.List;
import java.util.Map;

/**
 * The function family {@code boolean} (ADR-0025 "Families", F-15): the single-value functions that
 * make or use a truth value (#77), and {@code ifWithoutElse}, a context function over the algebra
 * in {@link BooleanFunctions} (#78). Only the exact text {@code true} is true; every other value,
 * {@code TRUE}, {@code 1} and the empty string included, is false, and a result is written {@code
 * true} or {@code false}. This is an assumed reading (spec #70, obs-boolean). None of these
 * functions raises a data error, so none uses its box. The binders are methods, not lambdas of the
 * map, so that PIT mutates them.
 */
final class BooleanFamily {

  /** The family's queue functions. */
  static final Map<String, QueueLibrary.Binder> QUEUE =
      Map.of("ifWithoutElse", BooleanFamily::ifWithoutElse);

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      Map.ofEntries(
          Map.entry("and", BooleanFamily::and),
          Map.entry("equals", BooleanFamily::equalsValue),
          Map.entry("if", BooleanFamily::ifValue),
          Map.entry("isNil", BooleanFamily::isNil),
          Map.entry("not", BooleanFamily::not),
          Map.entry("notEquals", BooleanFamily::notEquals),
          Map.entry("or", BooleanFamily::or));

  private BooleanFamily() {}

  /** {@code and(a, b)}: true when both are true. */
  static Node.OfString and(AuthoringId box, List<Node.OfString> args) {
    Node.OfString a = args.get(0);
    Node.OfString b = args.get(1);
    return frame -> Boolean.toString(isTrue(a.eval(frame)) && isTrue(b.eval(frame)));
  }

  /** {@code equals(a, b)}: whether the two values are the same text, case-sensitively. */
  static Node.OfString equalsValue(AuthoringId box, List<Node.OfString> args) {
    Node.OfString a = args.get(0);
    Node.OfString b = args.get(1);
    return frame -> Boolean.toString(a.eval(frame).equals(b.eval(frame)));
  }

  /**
   * {@code if(condition, then, else)}: {@code then} when the condition is true, else {@code else}.
   * Both branches are evaluated first, as every input of a single-value call is (F-22, ADR-0006),
   * so a data error in the untaken one is raised at its box.
   */
  static Node.OfString ifValue(AuthoringId box, List<Node.OfString> args) {
    Node.OfString condition = args.get(0);
    Node.OfString then = args.get(1);
    Node.OfString otherwise = args.get(2);
    return frame -> {
      boolean taken = isTrue(condition.eval(frame));
      String thenValue = then.eval(frame);
      String elseValue = otherwise.eval(frame);
      return taken ? thenValue : elseValue;
    };
  }

  /**
   * {@code ifWithoutElse(condition, then; keepSuppressValues)}, its parameter parsed once: a false
   * condition leaves no slot, or SUPPRESS at the slot when the parameter is {@code true}.
   */
  static Node.OfQueue ifWithoutElse(
      AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    Node.OfQueue condition = inputs.get(0);
    Node.OfQueue then = inputs.get(1);
    boolean keepSuppressValues =
        switch (params.getFirst()) {
          case "false" -> false;
          case "true" -> true;
          default ->
              throw new IllegalArgumentException(
                  "ifWithoutElse has no keepSuppressValues " + params.getFirst());
        };
    return frame ->
        BooleanFunctions.ifWithoutElse(condition.eval(frame), then.eval(frame), keepSuppressValues);
  }

  /**
   * {@code isNil(value)}: true for the empty string. The runtime reads {@code xsi:nil} as the empty
   * string (ADR-0008), so it cannot tell a nil field from an empty one.
   */
  static Node.OfString isNil(AuthoringId box, List<Node.OfString> args) {
    Node.OfString value = args.getFirst();
    return frame -> Boolean.toString(value.eval(frame).isEmpty());
  }

  static Node.OfString not(AuthoringId box, List<Node.OfString> args) {
    Node.OfString value = args.getFirst();
    return frame -> Boolean.toString(!isTrue(value.eval(frame)));
  }

  static Node.OfString notEquals(AuthoringId box, List<Node.OfString> args) {
    Node.OfString a = args.get(0);
    Node.OfString b = args.get(1);
    return frame -> Boolean.toString(!a.eval(frame).equals(b.eval(frame)));
  }

  /** {@code or(a, b)}: true when one of them is true. */
  static Node.OfString or(AuthoringId box, List<Node.OfString> args) {
    Node.OfString a = args.get(0);
    Node.OfString b = args.get(1);
    return frame -> Boolean.toString(isTrue(a.eval(frame)) || isTrue(b.eval(frame)));
  }

  /** Whether {@code text} is the exact text {@code true}. */
  private static boolean isTrue(String text) {
    return text.equals("true");
  }
}
