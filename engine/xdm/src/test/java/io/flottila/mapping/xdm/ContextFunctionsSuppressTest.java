package io.flottila.mapping.xdm;

import static io.flottila.mapping.xdm.SuppressQueues.S;
import static io.flottila.mapping.xdm.SuppressQueues.context;
import static io.flottila.mapping.xdm.SuppressQueues.queue;
import static io.flottila.mapping.xdm.SuppressQueues.read;
import static io.flottila.mapping.xdm.SuppressQueues.suppressedSlots;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.xdm.SuppressQueues.Queue;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The context functions over queues that hold SUPPRESS (#51, ADR-0004, ADR-0006): {@code createIf}
 * gives the empty string where its condition is true and SUPPRESS where it is not, and keeps the
 * contexts, sharing its input's context starts; {@code removeContexts} keeps each SUPPRESS at its
 * slot. Property tests (ADR-0018) run over the edges and 200 seeded queues of {@link
 * SuppressQueues}.
 */
class ContextFunctionsSuppressTest {

  static Stream<Arguments> queues() {
    return SuppressQueues.queues().map(q -> Arguments.of(q.name(), q));
  }

  /**
   * The truth rule (#2 §5, an assumed reading of ADR-0006 since #51): {@code 1} or {@code true} in
   * any case is true and gives the empty string (#2 §4); anything else, the empty string and
   * SUPPRESS included, gives SUPPRESS. White space is part of a value.
   */
  @Test
  void createIfTruthRule() {
    Queue conditions =
        queue(
            "conditions",
            context("1", "true", "TRUE", "True", "tRuE"),
            context("0", "false", "yes", " true", "true ", "", "1.0", "01", "t", S));

    QueueBlock result = ContextFunctions.createIf(conditions.block());

    assertThat(read(result))
        .containsExactly(context("", "", "", "", ""), context(S, S, S, S, S, S, S, S, S, S));
  }

  /**
   * Property test: createIf keeps the contexts of its input, slot for slot, and each slot is the
   * empty string where the input's is {@code 1} or {@code true} in any case, else SUPPRESS.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void createIfKeepsContexts(String name, Queue queue) {
    QueueBlock input = queue.block();

    QueueBlock result = ContextFunctions.createIf(input);

    assertThat(result.contexts()).isEqualTo(queue.contexts().size());
    List<List<String>> expected = new ArrayList<>();
    for (List<String> context : queue.contexts()) {
      List<String> slots = new ArrayList<>();
      for (String condition : context) {
        boolean truth =
            condition != null && (condition.equals("1") || condition.equalsIgnoreCase("true"));
        slots.add(truth ? "" : S);
      }
      expected.add(slots);
    }
    assertThat(read(result)).isEqualTo(expected);
    // a block is immutable: the call leaves its input as it was
    assertThat(read(input)).isEqualTo(queue.contexts());
  }

  /**
   * ADR-0004 since #51: a per-slot function shares the context starts. A block takes the arrays it
   * is given without copying them, so writing the starts after the call shows the sharing.
   */
  @Test
  void createIfSharesTheStarts() {
    int[] starts = {0, 2, 3};
    QueueBlock input =
        QueueBlock.of(
            new String[] {"true", null, "0"},
            starts,
            SuppressQueues.bits(new String[] {"true", null, "0"}));

    QueueBlock result = ContextFunctions.createIf(input);
    // witness: before the write the result splits as its input does
    assertThat(read(result)).containsExactly(context("", S), context(S));
    starts[1] = 1;

    assertThat(result.end(0)).as("the end of context 0 after the write").isEqualTo(1);
    assertThat(result.start(1)).as("the start of context 1 after the write").isEqualTo(1);
  }

  /**
   * Property test: removeContexts shares the values and the bitset (ADR-0004), so each SUPPRESS
   * stays SUPPRESS at its own slot, and each value at its own.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void removeContextsKeepsSuppressAtItsSlot(String name, Queue queue) {
    QueueBlock input = queue.block();

    QueueBlock result = ContextFunctions.removeContexts(input);

    assertThat(read(result)).containsExactly(queue.flat());
    assertThat(suppressedSlots(result)).isEqualTo(suppressedSlots(input));
  }

  /**
   * ADR-0004 since #51: {@code withContextStarts}, on which removeContexts stands, shares the
   * values and the bitset. Clearing the second word of the bitset after the call breaks the
   * hand-over rule on purpose, and the result reads the cleared bit.
   */
  @Test
  void removeContextsSharesTheBitset() {
    String[] values = SuppressQueues.slots(70, 2, 66).toArray(String[]::new);
    long[] suppress = SuppressQueues.bits(values);
    QueueBlock input = QueueBlock.of(values, new int[] {0, 30, 70}, suppress);

    QueueBlock result = ContextFunctions.removeContexts(input);
    // witness: before the write the result reads SUPPRESS at slot indexes 2 and 66
    assertThat(result.suppressed(2)).isTrue();
    assertThat(result.suppressed(66)).isTrue();
    suppress[1] = 0;

    assertThat(result.suppressed(66)).as("slot index 66 after its bit was cleared").isFalse();
  }
}
