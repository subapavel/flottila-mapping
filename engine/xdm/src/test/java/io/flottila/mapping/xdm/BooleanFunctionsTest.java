package io.flottila.mapping.xdm;

import static io.flottila.mapping.xdm.SuppressQueues.S;
import static io.flottila.mapping.xdm.SuppressQueues.context;
import static io.flottila.mapping.xdm.SuppressQueues.queue;
import static io.flottila.mapping.xdm.SuppressQueues.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.xdm.SuppressQueues.Queue;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.SplittableRandom;
import java.util.concurrent.CancellationException;
import java.util.random.RandomGenerator;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The queue algebra of the function family boolean (#78, ADR-0025 "Families"): {@code
 * ifWithoutElse} passes its {@code then} value where the condition is the exact text {@code true}
 * (#77); a false condition leaves no slot, or SUPPRESS at the slot when {@code keepSuppressValues};
 * the inputs pair as a Lift's (ADR-0006), and SUPPRESS in an input gives SUPPRESS. All of it is an
 * assumed reading (obs-ifwithoutelse, obs-boolean). The property tests (ADR-0018) are seeded loops,
 * without jqwik: the edges and 200 seeded pairs against a reference written here, and the laws that
 * tie the two parameter values to each other and to the Lift.
 */
class BooleanFunctionsTest {

  /** Conditions: only {@code true} is true, the others are what a looser reading would take. */
  private static final String[] CONDITIONS = {"true", "false", "TRUE", "True", " true", "1", ""};

  private static final String[] VALUES = {"", "a", " b ", "true", "Grüße", "😀"};

  /** A seeded queue of {@code sample}: empty contexts, queues without contexts, SUPPRESS. */
  private static Queue seeded(String name, RandomGenerator random, String[] sample) {
    List<List<String>> contexts = new ArrayList<>();
    int count = random.nextInt(8) == 0 ? random.nextInt(30) : random.nextInt(5);
    for (int c = 0; c < count; c++) {
      List<String> context = new ArrayList<>();
      int slots = random.nextInt(8) == 0 ? random.nextInt(70) : random.nextInt(4);
      for (int k = 0; k < slots; k++) {
        context.add(random.nextInt(6) == 0 ? S : sample[random.nextInt(sample.length)]);
      }
      contexts.add(Collections.unmodifiableList(context));
    }
    return new Queue(name, List.copyOf(contexts));
  }

  /** The edges, each with both parameter values, then 200 seeded pairs with both. */
  static Stream<Arguments> pairs() {
    Stream<Queue[]> edges =
        Stream.of(
            new Queue[] {queue("no context"), queue("no context")},
            new Queue[] {queue("no context"), queue("one", context("a"))},
            new Queue[] {queue("one empty context", context()), queue("one", context("a"))},
            new Queue[] {
              queue("all false", context("false", "TRUE", "")),
              queue("a b c", context("a", "b", "c"))
            },
            new Queue[] {
              queue("true false true", context("true", "false", "true")),
              queue("x y", context("x", "y"))
            },
            new Queue[] {
              queue("one true", context("true")), queue("p q r", context("p", "q", "r"))
            },
            new Queue[] {
              queue("SUPPRESS true false", context(S, "true", "false")),
              queue("a SUPPRESS b", context("a", S, "b"))
            },
            new Queue[] {
              queue("two contexts", context("true"), context("true", "false")),
              queue("three contexts", context("a"), context("b", "c"), context("d"))
            });
    Stream<Queue[]> seeded =
        LongStream.rangeClosed(1, 200)
            .mapToObj(
                seed -> {
                  RandomGenerator random = new SplittableRandom(seed);
                  return new Queue[] {
                    seeded("condition " + seed, random, CONDITIONS),
                    seeded("then " + seed, random, VALUES)
                  };
                });
    return Stream.concat(edges, seeded)
        .flatMap(
            p ->
                Stream.of(false, true)
                    .map(
                        keep ->
                            Arguments.of(p[0] + " / " + p[1] + " / " + keep, p[0], p[1], keep)));
  }

  /** The reference: what the class comment says, written slot by slot over the lists. */
  private static List<List<String>> reference(Queue condition, Queue then, boolean keep) {
    List<List<String>> result = new ArrayList<>();
    int contexts = Math.max(condition.contexts().size(), then.contexts().size());
    for (int c = 0; c < contexts; c++) {
      List<String> conditions =
          c < condition.contexts().size() ? condition.contexts().get(c) : List.of();
      List<String> values = c < then.contexts().size() ? then.contexts().get(c) : List.of();
      List<String> slots = new ArrayList<>();
      if (!conditions.isEmpty() && !values.isEmpty()) {
        for (int j = 0; j < Math.max(conditions.size(), values.size()); j++) {
          String test = conditions.get(Math.min(j, conditions.size() - 1));
          String value = values.get(Math.min(j, values.size() - 1));
          if (test == S || value == S) {
            slots.add(S);
          } else if (test.equals("true")) {
            slots.add(value);
          } else if (keep) {
            slots.add(S);
          }
        }
      }
      result.add(slots);
    }
    return result;
  }

  // --- property tests ---

  @ParameterizedTest(name = "{0}")
  @MethodSource("pairs")
  void ifWithoutElseAgreesWithTheReference(String name, Queue condition, Queue then, boolean keep) {
    QueueBlock result = BooleanFunctions.ifWithoutElse(condition.block(), then.block(), keep);

    assertThat(read(result)).isEqualTo(reference(condition, then, keep));
  }

  /**
   * With {@code keepSuppressValues} the result has the Lift's shape and the Lift's values where the
   * condition is true: only a false condition's slot differs, and it is SUPPRESS.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("pairs")
  void keepingSuppressGivesTheLiftsSlots(String name, Queue condition, Queue then, boolean keep) {
    List<List<String>> kept =
        read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), true));
    List<List<String>> lift =
        read(Lifting.lift(List.of(condition.block(), then.block()), v -> v[0] + "\u0000" + v[1]));

    assertThat(kept).hasSameSizeAs(lift);
    for (int c = 0; c < lift.size(); c++) {
      assertThat(kept.get(c)).as("context %d", c).hasSameSizeAs(lift.get(c));
      for (int j = 0; j < lift.get(c).size(); j++) {
        String pair = lift.get(c).get(j);
        String expected =
            pair == S || !pair.startsWith("true\u0000") ? S : pair.substring("true\u0000".length());
        assertThat(kept.get(c).get(j)).as("context %d slot %d", c, j).isEqualTo(expected);
      }
    }
  }

  /**
   * Without {@code keepSuppressValues}, the result is the kept one without the SUPPRESS of false
   * conditions: when neither input holds SUPPRESS, every SUPPRESS of the kept result is dropped.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("pairs")
  void droppingIsKeepingWithoutTheFalseSlots(
      String name, Queue condition, Queue then, boolean keep) {
    boolean inputSuppress = condition.flat().contains(S) || then.flat().contains(S);
    List<List<String>> kept =
        read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), true));
    List<List<String>> dropped =
        read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), false));

    if (!inputSuppress) {
      List<List<String>> expected = new ArrayList<>();
      for (List<String> context : kept) {
        expected.add(context.stream().filter(Objects::nonNull).toList());
      }
      assertThat(dropped).isEqualTo(expected);
    }
    assertThat(dropped).hasSameSizeAs(kept);
  }

  /** A condition that is true at every slot of {@code then} gives {@code then}, either way. */
  @ParameterizedTest(name = "{0}")
  @MethodSource("pairs")
  void anAllTrueConditionGivesThen(String name, Queue condition, Queue then, boolean keep) {
    List<List<String>> allTrue = new ArrayList<>();
    for (List<String> context : then.contexts()) {
      allTrue.add(Collections.nCopies(context.size(), "true"));
    }
    Queue always = new Queue("all true", allTrue);

    assertThat(read(BooleanFunctions.ifWithoutElse(always.block(), then.block(), keep)))
        .isEqualTo(then.contexts());
  }

  // --- the edges by name ---

  @Test
  void aFalseConditionLeavesNoSlotOrSuppressAtIt() {
    Queue condition = queue("c", context("true", "false", "true"), context("false", "TRUE"));
    Queue then = queue("t", context("a", "b", "c"), context("d", "e"));

    assertThat(read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), false)))
        .containsExactly(List.of("a", "c"), List.of());
    assertThat(read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), true)))
        .containsExactly(context("a", S, "c"), context(S, S));
  }

  @Test
  void suppressInEitherInputIsSuppressWhateverTheParameter() {
    Queue condition = queue("c", context(S, "true", "false"));
    Queue then = queue("t", context("a", S, "b"));

    for (boolean keep : new boolean[] {false, true}) {
      assertThat(read(BooleanFunctions.ifWithoutElse(condition.block(), then.block(), keep)))
          .as("keepSuppressValues %s", keep)
          .containsExactly(keep ? context(S, S, S) : context(S, S));
    }
  }

  @Test
  void anInterruptedThreadStopsIt() {
    QueueBlock one = queue("one", context("true")).block();
    Thread.currentThread().interrupt();
    try {
      assertThatThrownBy(() -> BooleanFunctions.ifWithoutElse(one, one, false))
          .isInstanceOf(CancellationException.class)
          .hasMessageContaining("ifWithoutElse");
    } finally {
      Thread.interrupted();
    }
  }
}
