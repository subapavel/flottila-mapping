package io.flottila.mapping.xdm;

import static io.flottila.mapping.xdm.SuppressQueues.S;
import static io.flottila.mapping.xdm.SuppressQueues.SAMPLE;
import static io.flottila.mapping.xdm.SuppressQueues.context;
import static io.flottila.mapping.xdm.SuppressQueues.queue;
import static io.flottila.mapping.xdm.SuppressQueues.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.xdm.SuppressQueues.Queue;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.OptionalInt;
import java.util.SplittableRandom;
import java.util.concurrent.CancellationException;
import java.util.random.RandomGenerator;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The queue algebra of the function family constant (#79, ADR-0025 "Families"): {@code copyValue}
 * copies the slot at a position of each context, counted from 0, and a context too short for it
 * gives an empty context; a SUPPRESS slot counts as a position and is copied as SUPPRESS (assumed
 * readings of #79). A position is an {@code xs:nonNegativeInteger}. The property test (ADR-0018) is
 * a seeded loop, without jqwik: it runs the edges and 200 seeded queues against a reference written
 * here.
 */
class ConstantFunctionsTest {

  /** A seeded queue: empty contexts, queues without contexts and SUPPRESS come up. */
  static Queue seeded(long seed) {
    RandomGenerator random = new SplittableRandom(seed);
    List<List<String>> contexts = new ArrayList<>();
    int count = random.nextInt(8) == 0 ? random.nextInt(30) : random.nextInt(5);
    for (int c = 0; c < count; c++) {
      List<String> context = new ArrayList<>();
      int slots = random.nextInt(8) == 0 ? random.nextInt(70) : random.nextInt(4);
      for (int k = 0; k < slots; k++) {
        context.add(random.nextInt(5) == 0 ? S : SAMPLE[random.nextInt(SAMPLE.length)]);
      }
      contexts.add(Collections.unmodifiableList(context));
    }
    return new Queue("seed " + seed, List.copyOf(contexts));
  }

  static Stream<Arguments> queues() {
    Stream<Queue> edges =
        Stream.of(
            queue("no context"),
            queue("one empty context", context()),
            queue("only SUPPRESS", context(S), context(S, S)),
            queue(
                "SUPPRESS and an empty context", context("a", S), context(), context(S, "b", "")));
    return Stream.concat(
            edges, LongStream.rangeClosed(1, 200).mapToObj(ConstantFunctionsTest::seeded))
        .map(q -> Arguments.of(q.name(), q));
  }

  // --- property test ---

  /**
   * copyValue: one context per context, holding the slot at the position when the context has it,
   * SUPPRESS as SUPPRESS, and nothing otherwise; the input is unchanged.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void copyValueCopiesTheSlotAtThePositionOfEachContext(String name, Queue queue) {
    QueueBlock input = queue.block();
    for (int position : new int[] {0, 1, 2, 3, 69, Integer.MAX_VALUE}) {
      List<List<String>> expected = new ArrayList<>();
      for (List<String> context : queue.contexts()) {
        expected.add(position < context.size() ? context(context.get(position)) : context());
      }

      QueueBlock result = ConstantFunctions.copyValue(input, position);

      assertThat(read(result)).as("position %d", position).isEqualTo(expected);
    }
    assertThat(read(input)).as("the input").isEqualTo(queue.contexts());
  }

  @Test
  void copyValueCopiesAValueAtAContextsLastSlotAndNothingBeyondIt() {
    QueueBlock input = queue("three contexts", context("a", "b"), context("c"), context()).block();

    assertThat(read(ConstantFunctions.copyValue(input, 1)))
        .isEqualTo(List.of(context("b"), context(), context()));
    // witness: position 0 is within every context that has a slot
    assertThat(read(ConstantFunctions.copyValue(input, 0)))
        .isEqualTo(List.of(context("a"), context("c"), context()));
  }

  // --- the position ---

  static Stream<Arguments> positions() {
    return Stream.of(
        Arguments.of("0", 0),
        Arguments.of("1", 1),
        Arguments.of("+7", 7),
        Arguments.of("-0", 0),
        Arguments.of("007", 7),
        Arguments.of(" 2 ", 2),
        Arguments.of("\t3\r\n", 3),
        Arguments.of("2147483647", Integer.MAX_VALUE),
        // beyond every context, as no context has more slots than an int counts
        Arguments.of("2147483648", Integer.MAX_VALUE),
        Arguments.of("99999999999999999999999", Integer.MAX_VALUE));
  }

  /**
   * The {@code xs:nonNegativeInteger} lexical form, XML whitespace around it ignored, as the
   * export's cast reads it.
   */
  @ParameterizedTest(name = "{index}: position {1}")
  @MethodSource("positions")
  void aPositionIsANonNegativeInteger(String text, int position) {
    assertThat(ConstantFunctions.position(text)).hasValue(position);
  }

  @ParameterizedTest(name = "\"{0}\"")
  @ValueSource(strings = {"", " ", "-1", "-07", "1.0", "1e2", "one", "+", "1 2", " 1", "١"})
  void anyOtherTextIsNoPosition(String text) {
    assertThat(ConstantFunctions.position(text)).isEqualTo(OptionalInt.empty());
  }

  // --- interruption (ADR-0021) ---

  @Test
  void onAnInterruptedThreadCopyValueStopsBeforeAContext() {
    QueueBlock values = queue("values", context("1", S), context("2")).block();
    // witness: the same call gives a block on a thread that is not interrupted
    assertThat(ConstantFunctions.copyValue(values, 0)).isNotNull();

    Thread.currentThread().interrupt();
    try {
      assertThatThrownBy(() -> ConstantFunctions.copyValue(values, 0))
          .isInstanceOf(CancellationException.class)
          .hasMessage("copyValue was running when the thread was interrupted");
    } finally {
      Thread.interrupted();
    }
  }
}
