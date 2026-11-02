package io.flottila.mapping.xdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;
import java.util.random.RandomGenerator;
import java.util.stream.LongStream;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The context functions of the runtime library over queue blocks (ADR-0025, ADR-0004), at {@code
 * ContextFunctions}. Property tests (ADR-0018): each runs over hand-picked edge queues and over 200
 * seeded random queues, the seed in the case name, against a list-of-contexts reference written
 * here. No SUPPRESS yet (#51).
 */
class ContextFunctionsTest {

  /**
   * A queue as its contexts of values, the reference the block is built from and read against.
   *
   * @param name the case name: the edge it crosses, or its seed
   * @param contexts the values of each context, in order
   */
  record Queue(String name, List<List<String>> contexts) {

    /** Every value, context after context: what one context holding the whole queue holds. */
    List<String> flat() {
      List<String> all = new ArrayList<>();
      contexts.forEach(all::addAll);
      return all;
    }

    /** A fresh values array, as a builder of this queue hands it over. */
    String[] values() {
      return flat().toArray(String[]::new);
    }

    /** Fresh context starts with the end sentinel (ADR-0004). */
    int[] starts() {
      int[] starts = new int[contexts.size() + 1];
      for (int c = 0; c < contexts.size(); c++) {
        starts[c + 1] = starts[c] + contexts.get(c).size();
      }
      return starts;
    }

    QueueBlock block() {
      return QueueBlock.of(values(), starts());
    }

    @Override
    public String toString() {
      return name;
    }
  }

  /** Values a source queue holds: {@code ""} is a value, and whitespace is part of it. */
  private static final String[] SAMPLE = {"", "a", " b ", "1", "Grüße", "x\ty"};

  /** The edges every property crosses on every run, whatever the seeds give. */
  private static Stream<Queue> edges() {
    return Stream.of(
        // an absent parent: no context at all, {0} (ADR-0004)
        new Queue("no context", List.of()),
        new Queue("one empty context", List.of(List.of())),
        new Queue("only empty contexts", List.of(List.of(), List.of(), List.of())),
        new Queue("one context", List.of(List.of("a", "b"))),
        // the worked example of fn/removeContexts/001: Sku in context Line over two Orders
        new Queue("a | b | c", List.of(List.of("a"), List.of("b"), List.of("c"))),
        // the worked example of fn/removeContexts/002: an empty context and the value ""
        new Queue(
            "a | (empty) | \"\" | b", List.of(List.of("a"), List.of(), List.of(""), List.of("b"))),
        new Queue("empty contexts at both ends", List.of(List.of(), List.of("x", "y"), List.of())));
  }

  /**
   * A seeded random queue. Some queues have many contexts and some contexts many slots; empty
   * contexts and queues without contexts come up often.
   */
  private static Queue seeded(long seed) {
    RandomGenerator random = new SplittableRandom(seed);
    List<List<String>> contexts = new ArrayList<>();
    int count = random.nextInt(8) == 0 ? random.nextInt(40) : random.nextInt(5);
    for (int c = 0; c < count; c++) {
      List<String> context = new ArrayList<>();
      int slots = random.nextInt(8) == 0 ? random.nextInt(40) : random.nextInt(4);
      for (int k = 0; k < slots; k++) {
        context.add(SAMPLE[random.nextInt(SAMPLE.length)]);
      }
      contexts.add(context);
    }
    return new Queue("seed " + seed, contexts);
  }

  static Stream<Arguments> queues() {
    return Stream.concat(
            edges(), LongStream.rangeClosed(1, 200).mapToObj(ContextFunctionsTest::seeded))
        .map(q -> Arguments.of(q.name(), q));
  }

  /** The queues with at least one slot, so that a values array exists to be shared. */
  static Stream<Arguments> queuesWithSlots() {
    return queues().filter(a -> !((Queue) a.get()[1]).flat().isEmpty());
  }

  /** The block as contexts of values, checking ADR-0004's invariants on the way. */
  private static List<List<String>> read(QueueBlock block) {
    List<List<String>> contexts = new ArrayList<>();
    int previousEnd = 0;
    for (int c = 0; c < block.contexts(); c++) {
      assertThat(block.start(c)).as("start(%d)", c).isEqualTo(previousEnd);
      assertThat(block.end(c)).as("end(%d)", c).isGreaterThanOrEqualTo(block.start(c));
      List<String> context = new ArrayList<>();
      for (int i = block.start(c); i < block.end(c); i++) {
        context.add(block.value(i));
      }
      contexts.add(context);
      previousEnd = block.end(c);
    }
    assertThat(block.slots()).as("slots() is the sentinel").isEqualTo(previousEnd);
    return contexts;
  }

  private static List<String> slots(QueueBlock block) {
    List<String> values = new ArrayList<>();
    for (int i = 0; i < block.slots(); i++) {
      values.add(block.value(i));
    }
    return values;
  }

  /** Every slot of every context, in order, and nothing else; the input reads as before. */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void removeContextsKeepsEverySlotInOrder(String name, Queue queue) {
    QueueBlock input = queue.block();

    QueueBlock result = ContextFunctions.removeContexts(input);

    assertThat(slots(result)).containsExactlyElementsOf(queue.flat());
    // a block is immutable: the call leaves its input as it was
    assertThat(read(input)).isEqualTo(queue.contexts());
  }

  /**
   * Exactly one context, holding the whole queue. A queue with no context at all gives one empty
   * context, {@code {0, 0}}, not none: the same as reading the field in the root's context.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void removeContextsGivesOneContext(String name, Queue queue) {
    QueueBlock result = ContextFunctions.removeContexts(queue.block());

    assertThat(result.contexts()).isEqualTo(1);
    assertThat(read(result)).containsExactly(queue.flat());
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("queues")
  void removeContextsIsIdempotent(String name, Queue queue) {
    QueueBlock once = ContextFunctions.removeContexts(queue.block());

    QueueBlock twice = ContextFunctions.removeContexts(once);

    assertThat(read(twice)).isEqualTo(read(once));
  }

  /**
   * ADR-0004: removeContexts shares the value array, it copies neither values nor characters. A
   * block takes the arrays it is given without copying them, so the only way to see the sharing
   * from outside is to break the hand-over rule on purpose: write the array after the call, and the
   * result reads the new values.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("queuesWithSlots")
  void removeContextsSharesTheValueArray(String name, Queue queue) {
    String[] values = queue.values();
    QueueBlock input = QueueBlock.of(values, queue.starts());

    QueueBlock result = ContextFunctions.removeContexts(input);
    // witness: before the write the result holds the input's own value objects
    for (int i = 0; i < values.length; i++) {
      assertThat(result.value(i)).as("slot index %d", i).isSameAs(input.value(i));
    }
    List<String> written = new ArrayList<>();
    for (int i = 0; i < values.length; i++) {
      values[i] = "written " + i;
      written.add(values[i]);
    }

    assertThat(slots(result)).containsExactlyElementsOf(written);
  }
}
