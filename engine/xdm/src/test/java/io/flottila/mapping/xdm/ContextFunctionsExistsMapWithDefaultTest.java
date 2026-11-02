package io.flottila.mapping.xdm;

import static io.flottila.mapping.xdm.SuppressQueues.S;
import static io.flottila.mapping.xdm.SuppressQueues.context;
import static io.flottila.mapping.xdm.SuppressQueues.queue;
import static io.flottila.mapping.xdm.SuppressQueues.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.xdm.SuppressQueues.Queue;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CancellationException;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * {@code exists} and {@code mapWithDefault} (#57) at {@code ContextFunctions}. Both ask per context
 * whether it holds a value. SUPPRESS is no value: a context of SUPPRESS only counts as empty, for
 * mapWithDefault an assumed reading (#33, #2 §7.6), for exists the reading the mapWithDefault
 * equivalence {@code If([]field, exists([]field), Constant)} (#2 §4) gives with it. {@code ""} is a
 * value. Worked examples first, then property tests (ADR-0018) over the edges and 200 seeded queues
 * of {@link SuppressQueues}, against list references written here.
 */
class ContextFunctionsExistsMapWithDefaultTest {

  static Stream<Arguments> queues() {
    return SuppressQueues.queues().map(q -> Arguments.of(q.name(), q));
  }

  /** Whether {@code context} holds a slot that is not SUPPRESS. */
  private static boolean holdsValue(List<String> context) {
    return context.stream().anyMatch(Objects::nonNull);
  }

  // --- exists

  /**
   * One value per context, in a context of its own: a context with a value, {@code ""} included, is
   * true; an empty context and a context of SUPPRESS only are false.
   */
  @Test
  void existsGivesOneValuePerContextAndTakesSuppressForNoValue() {
    Queue queue =
        queue("worked", context("a", "b"), context(), context(S), context(S, ""), context(""));

    assertThat(read(ContextFunctions.exists(queue.block())))
        .containsExactly(
            context("true"), context("false"), context("false"), context("true"), context("true"));
  }

  /** A queue with no context, as under an absent parent, gives no context (ADR-0004). */
  @Test
  void existsOverNoContextGivesNoContext() {
    assertThat(ContextFunctions.exists(queue("no context").block()).contexts()).isZero();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void existsTellsPerContextWhetherItHoldsAValue(String name, Queue queue) {
    List<List<String>> expected = new ArrayList<>();
    for (List<String> context : queue.contexts()) {
      expected.add(context(String.valueOf(holdsValue(context))));
    }

    assertThat(read(ContextFunctions.exists(queue.block()))).isEqualTo(expected);
  }

  // --- mapWithDefault

  /** The SAP example (#2 §4): {@code A|B1,B2| |C| |D → A | B1,B2 | Default | C | Default |D}. */
  @Test
  void mapWithDefaultFillsEachEmptyContextWithOneDefault() {
    Queue sap =
        queue(
            "SAP",
            context("A"),
            context("B1", "B2"),
            context(),
            context("C"),
            context(),
            context("D"));

    assertThat(read(ContextFunctions.mapWithDefault(sap.block(), "Default")))
        .containsExactly(
            context("A"),
            context("B1", "B2"),
            context("Default"),
            context("C"),
            context("Default"),
            context("D"));
  }

  /**
   * A context of SUPPRESS only counts as empty and gets one default; SUPPRESS next to a value stays
   * at its slot, and {@code ""} is a value.
   */
  @Test
  void mapWithDefaultTakesASuppressOnlyContextForEmpty() {
    Queue queue = queue("worked", context(S), context(S, S), context(S, "a", S), context(""));

    assertThat(read(ContextFunctions.mapWithDefault(queue.block(), "D")))
        .containsExactly(context("D"), context("D"), context(S, "a", S), context(""));
  }

  /**
   * No context stays no context, and one empty context becomes one default: what tells
   * removeContexts' one empty context apart from zero contexts (#50 review).
   */
  @Test
  void mapWithDefaultKeepsNoContextAndFillsOneEmptyContext() {
    QueueBlock none = queue("no context").block();

    assertThat(ContextFunctions.mapWithDefault(none, "D").contexts()).isZero();
    assertThat(read(ContextFunctions.mapWithDefault(ContextFunctions.removeContexts(none), "D")))
        .containsExactly(context("D"));
  }

  /** The default {@code ""} fills an empty context with the value {@code ""}. */
  @Test
  void mapWithDefaultOfTheEmptyStringGivesTheEmptyStringAsAValue() {
    Queue queue = queue("worked", context(), context("a"));

    assertThat(read(ContextFunctions.mapWithDefault(queue.block(), "")))
        .containsExactly(context(""), context("a"));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void mapWithDefaultReplacesEveryContextWithoutAValueAndKeepsTheOthers(String name, Queue queue) {
    List<List<String>> expected = new ArrayList<>();
    for (List<String> context : queue.contexts()) {
      expected.add(holdsValue(context) ? context : context("dflt"));
    }

    assertThat(read(ContextFunctions.mapWithDefault(queue.block(), "dflt"))).isEqualTo(expected);
  }

  // --- interruption (ADR-0021): the loop over contexts checks, before the block's own checks

  static Stream<Arguments> interruptible() {
    QueueBlock queue = queue("one context", context(S, "a")).block();
    return Stream.of(
        Arguments.of("exists", (Supplier<QueueBlock>) () -> ContextFunctions.exists(queue)),
        Arguments.of(
            "mapWithDefault",
            (Supplier<QueueBlock>) () -> ContextFunctions.mapWithDefault(queue, "D")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("interruptible")
  void onAnInterruptedThreadTheFunctionThrowsCancellationExceptionByName(
      String function, Supplier<QueueBlock> call) {
    // witness: the same call gives a block on a thread that is not interrupted
    assertThat(call.get()).isNotNull();

    Thread.currentThread().interrupt();
    try {
      // its own check, by its name: the block it builds checks too, with another message
      assertThatThrownBy(call::get)
          .isInstanceOf(CancellationException.class)
          .hasMessageContaining(function);
    } finally {
      Thread.interrupted();
    }
  }
}
