package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.StatisticFunctions;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The function family {@code statistic} (ADR-0025 "Families", F-15), #75: each catalogue name to
 * its binder over the algebra in {@link StatisticFunctions}. A value or a numeric param that is no
 * {@code xs:decimal} stops the run with {@code err:FORG0001} at the function box (ADR-0025, F-19).
 * {@code counter} is {@code index} without a reset: it numbers the values of its whole queue, so a
 * counter of each target field mapping starts at its initial value (an assumed reading of #37). The
 * binders are methods, not lambdas of the maps, so that PIT mutates them.
 */
final class StatisticFamily {

  /** The family's queue functions. */
  static final Map<String, QueueLibrary.Binder> QUEUE =
      Map.ofEntries(
          Map.entry("average", StatisticFamily::average),
          Map.entry("count", StatisticFamily::count),
          Map.entry("counter", StatisticFamily::counter),
          Map.entry("index", StatisticFamily::index),
          Map.entry("sum", StatisticFamily::sum));

  /** The family's single-value functions: it has none. */
  static final Map<String, SingleValueLibrary.Binder> VALUE = Map.of();

  private StatisticFamily() {}

  static Node.OfQueue average(AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    Node.OfQueue values = inputs.getFirst();
    return QueueLibrary.raising(
        RuntimeErrors.FORG0001, box, frame -> StatisticFunctions.average(values.eval(frame)));
  }

  static Node.OfQueue count(AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    Node.OfQueue values = inputs.getFirst();
    return frame -> StatisticFunctions.count(values.eval(frame));
  }

  /** {@code counter(values; initial, increment)}: {@code index} across the whole queue. */
  static Node.OfQueue counter(AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    return numbering("counter", box, inputs.getFirst(), params.get(0), params.get(1), false);
  }

  /** {@code index(values; initial, increment, reset)}, its reset parsed once. */
  static Node.OfQueue index(AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    boolean reset =
        switch (params.get(2)) {
          case "eachContext" -> true;
          case "never" -> false;
          default -> throw new IllegalArgumentException("index has no reset " + params.get(2));
        };
    return numbering("index", box, inputs.getFirst(), params.get(0), params.get(1), reset);
  }

  static Node.OfQueue sum(AuthoringId box, List<Node.OfQueue> inputs, List<String> params) {
    Node.OfQueue values = inputs.getFirst();
    return QueueLibrary.raising(
        RuntimeErrors.FORG0001, box, frame -> StatisticFunctions.sum(values.eval(frame)));
  }

  /**
   * The node of {@code function}, {@code index} or {@code counter}, over {@code values}, its params
   * parsed once. When {@code initial} or {@code increment} is no {@code xs:decimal}, the node
   * raises {@code err:FORG0001} at {@code box} without reading its input, as the export does.
   */
  private static Node.OfQueue numbering(
      String function,
      AuthoringId box,
      Node.OfQueue values,
      String initial,
      String increment,
      boolean reset) {
    Optional<BigDecimal> first = StatisticFunctions.decimal(initial);
    Optional<BigDecimal> step = StatisticFunctions.decimal(increment);
    if (first.isEmpty() || step.isEmpty()) {
      String message =
          function
              + ": the parameters initial \""
              + initial
              + "\" and increment \""
              + increment
              + "\" are not both xs:decimal";
      return frame -> {
        throw MappingRunException.dataError(RuntimeErrors.FORG0001, box, message, null);
      };
    }
    BigDecimal start = first.get();
    BigDecimal by = step.get();
    return frame -> StatisticFunctions.index(values.eval(frame), start, by, reset);
  }
}
