package io.flottila.mapping.runtime;

import io.flottila.mapping.xdm.ContextFunctions;
import io.flottila.mapping.xdm.ContextFunctions.Comparison;
import java.util.Map;

/**
 * The function family {@code context} (ADR-0025 "Families", F-15), spec 2's eleven functions: each
 * catalogue name to its binder. A queue function binds to its algebra in {@link ContextFunctions},
 * its params parsed here, into the node; a data error of its algebra stops the run with the
 * function's one code at its box (ADR-0025 since #52).
 */
final class ContextFamily {

  /** The family's queue functions. */
  static final Map<String, QueueLibrary.Binder> QUEUE =
      Map.ofEntries(
          Map.entry(
              "collapseContexts",
              (box, inputs, params) -> {
                Node.OfQueue input = inputs.getFirst();
                return frame -> ContextFunctions.collapseContexts(input.eval(frame));
              }),
          Map.entry(
              "createIf",
              (box, inputs, params) -> {
                Node.OfQueue condition = inputs.getFirst();
                return frame -> ContextFunctions.createIf(condition.eval(frame));
              }),
          Map.entry(
              "exists",
              (box, inputs, params) -> {
                Node.OfQueue input = inputs.getFirst();
                return frame -> ContextFunctions.exists(input.eval(frame));
              }),
          Map.entry(
              "formatByExample",
              (box, inputs, params) -> {
                Node.OfQueue values = inputs.get(0);
                Node.OfQueue example = inputs.get(1);
                return QueueLibrary.raising(
                    RuntimeErrors.FORMATBYEXAMPLE,
                    box,
                    frame ->
                        ContextFunctions.formatByExample(values.eval(frame), example.eval(frame)));
              }),
          Map.entry(
              "mapWithDefault",
              (box, inputs, params) -> {
                Node.OfQueue input = inputs.getFirst();
                String defaultValue = params.getFirst();
                return frame -> ContextFunctions.mapWithDefault(input.eval(frame), defaultValue);
              }),
          Map.entry(
              "removeContexts",
              (box, inputs, params) -> {
                Node.OfQueue input = inputs.getFirst();
                return frame -> ContextFunctions.removeContexts(input.eval(frame));
              }),
          Map.entry(
              "sort",
              (box, inputs, params) -> {
                Node.OfQueue input = inputs.getFirst();
                Comparison comparison = comparison("sort", params.get(0));
                boolean descending = descending("sort", params.get(1));
                return QueueLibrary.raising(
                    RuntimeErrors.SORT,
                    box,
                    frame -> ContextFunctions.sort(input.eval(frame), comparison, descending));
              }),
          Map.entry(
              "sortByKey",
              (box, inputs, params) -> {
                Node.OfQueue keys = inputs.get(0);
                Node.OfQueue values = inputs.get(1);
                Comparison comparison = comparison("sortByKey", params.get(0));
                boolean descending = descending("sortByKey", params.get(1));
                return QueueLibrary.raising(
                    RuntimeErrors.SORTBYKEY,
                    box,
                    frame ->
                        ContextFunctions.sortByKey(
                            keys.eval(frame), values.eval(frame), comparison, descending));
              }),
          Map.entry(
              "splitByValue",
              (box, inputs, params) -> splitByValue(inputs.getFirst(), params.getFirst())),
          Map.entry(
              "useOneAsMany",
              (box, inputs, params) -> {
                Node.OfQueue value = inputs.get(0);
                Node.OfQueue occurrences = inputs.get(1);
                Node.OfQueue contexts = inputs.get(2);
                return QueueLibrary.raising(
                    RuntimeErrors.USEONEASMANY,
                    box,
                    frame ->
                        ContextFunctions.useOneAsMany(
                            value.eval(frame), occurrences.eval(frame), contexts.eval(frame)));
              }));

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      // replaceValue(value, replacement): the replacement, whatever the value
      Map.of("replaceValue", args -> args.get(1));

  private ContextFamily() {}

  /** {@code splitByValue} over {@code input}, its mode parsed once. */
  private static Node.OfQueue splitByValue(Node.OfQueue input, String mode) {
    return switch (mode) {
      case "eachValue" -> frame -> ContextFunctions.splitByEachValue(input.eval(frame));
      case "valueChange" -> frame -> ContextFunctions.splitByValueChange(input.eval(frame));
      case "emptyValue" -> frame -> ContextFunctions.splitByEmptyValue(input.eval(frame));
      default -> throw new IllegalArgumentException("splitByValue has no mode " + mode);
    };
  }

  /** The {@code comparison} param of {@code function}, a sort. */
  private static Comparison comparison(String function, String comparison) {
    return switch (comparison) {
      case "lexicographic" -> Comparison.LEXICOGRAPHIC;
      case "caseInsensitive" -> Comparison.CASE_INSENSITIVE;
      case "numeric" -> Comparison.NUMERIC;
      default -> throw new IllegalArgumentException(function + " has no comparison " + comparison);
    };
  }

  /** Whether the {@code order} param of {@code function}, a sort, is descending. */
  private static boolean descending(String function, String order) {
    return switch (order) {
      case "ascending" -> false;
      case "descending" -> true;
      default -> throw new IllegalArgumentException(function + " has no order " + order);
    };
  }
}
