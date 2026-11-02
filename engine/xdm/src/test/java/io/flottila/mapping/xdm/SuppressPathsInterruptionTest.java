package io.flottila.mapping.xdm;

import static io.flottila.mapping.xdm.SuppressQueues.S;
import static io.flottila.mapping.xdm.SuppressQueues.context;
import static io.flottila.mapping.xdm.SuppressQueues.queue;
import static io.flottila.mapping.xdm.SuppressQueues.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Every loop over slots or contexts checks for interruption (ADR-0021), also on the paths #51 adds.
 * Each call here is one whose own loop is the first to run: a block of empty contexts has no slot
 * whose value is read, createIf reads its condition before its result's values are, and
 * removeContexts reads no value at all.
 */
class SuppressPathsInterruptionTest {

  static Stream<Arguments> interruptible() {
    QueueBlock conditions = queue("conditions", context("1", S, "no")).block();
    QueueBlock suppressed = queue("suppressed", context(S, "a"), context(S)).block();
    return Stream.of(
        Arguments.of(
            "of over empty contexts only",
            (Supplier<QueueBlock>) () -> QueueBlock.of(new String[0], new int[] {0, 0, 0})),
        Arguments.of(
            "createIf", (Supplier<QueueBlock>) () -> ContextFunctions.createIf(conditions)),
        // it shares the values and the bitset, so its new starts are the one loop it runs
        Arguments.of(
            "removeContexts",
            (Supplier<QueueBlock>) () -> ContextFunctions.removeContexts(suppressed)));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("interruptible")
  void onAnInterruptedThreadACallThrowsCancellationExceptionAndGivesNoBlock(
      String call, Supplier<QueueBlock> block) {
    // witness: the same call gives a block on a thread that is not interrupted
    assertThat(block.get()).isNotNull();

    Thread.currentThread().interrupt();
    try {
      assertThatThrownBy(block::get).isInstanceOf(CancellationException.class);
    } finally {
      Thread.interrupted();
    }
  }

  /**
   * A lift over two inputs checks before each slot, not only before each context: a body that
   * interrupts its thread is the last one run, inside the one context.
   */
  @Test
  void aLiftInterruptedWithinAContextStopsBeforeItsNextSlot() {
    List<QueueBlock> inputs =
        List.of(
            queue("in1", context("a", "b", "c")).block(),
            queue("in2", context("x", "y", "z")).block());
    int[] calls = {0};
    // witness: the same lift runs the body once per slot when nothing interrupts it
    assertThat(read(Lifting.lift(inputs, values -> values[0] + values[1])))
        .containsExactly(context("ax", "by", "cz"));

    try {
      assertThatThrownBy(
              () ->
                  Lifting.lift(
                      inputs,
                      values -> {
                        calls[0]++;
                        Thread.currentThread().interrupt();
                        return values[0];
                      }))
          .isInstanceOf(CancellationException.class);
    } finally {
      Thread.interrupted();
    }
    assertThat(calls[0]).as("body calls").isEqualTo(1);
  }
}
