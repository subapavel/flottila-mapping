package io.flottila.mapping.mapping;

import static io.flottila.mapping.mapping.LoadResults.errorAtId;
import static io.flottila.mapping.mapping.LoadResults.lowered;
import static io.flottila.mapping.mapping.LoadResults.refused;
import static io.flottila.mapping.mapping.Models.boxes;
import static io.flottila.mapping.mapping.Models.function;
import static io.flottila.mapping.mapping.Models.id;
import static io.flottila.mapping.mapping.Models.inputs;
import static io.flottila.mapping.mapping.Models.model;
import static io.flottila.mapping.mapping.Models.noParams;
import static io.flottila.mapping.mapping.Models.params;
import static io.flottila.mapping.mapping.Models.source;
import static io.flottila.mapping.mapping.Models.table;
import static io.flottila.mapping.mapping.Models.targetFieldMapping;
import static io.flottila.mapping.mapping.Models.targetFieldMappings;
import static io.flottila.mapping.mapping.Models.text;
import static io.flottila.mapping.mapping.TestStructures.ORDER;
import static io.flottila.mapping.mapping.TestStructures.SKELETON;
import static io.flottila.mapping.mapping.TestStructures.order;
import static io.flottila.mapping.mapping.TestStructures.ref;
import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.QueueType;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetSlots;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * Stage 3 and lowering of a reached standard function box (ADR-0025, #50): a function the
 * engine-internal catalogue holds becomes a {@code FunCall} over its inputs' queues; a box that
 * does not fit its catalogue entry is refused at the box, and its inputs are not checked. {@code
 * removeContexts} has one input and no params. {@code Note <- f1} throughout, {@code a1} reading
 * {@code Note}.
 */
class FunctionBoxLoweringTest {

  private static final String NOTE = ORDER + "/Note";
  private static final QueueType QUEUE = new QueueType();
  private static final FunctionRef REMOVE_CONTEXTS =
      new FunctionRef("removeContexts", List.of(QUEUE), QUEUE);
  private static final SourceQueue NOTES =
      new SourceQueue(List.of(new Name(SKELETON, "Order"), new Name("", "Note")), 1, id("a1"));

  /** {@code Note <- f1}, where {@code f1} is {@code function} and {@code a1} reads {@code Note}. */
  private static LowerResult lowerNote(StandardFunctionBox function, Object... moreBoxes) {
    Object[] all = new Object[4 + moreBoxes.length];
    all[0] = "f1";
    all[1] = function;
    all[2] = "a1";
    all[3] = source(NOTE);
    System.arraycopy(moreBoxes, 0, all, 4, moreBoxes.length);
    MappingModel model =
        model(
            ref(order()),
            ref(order()),
            targetFieldMappings(NOTE, targetFieldMapping("t1", "f1", boxes(all))),
            Map.of());
    return Lowering.lower(model, order(), order());
  }

  private static StandardFunctionBox removeContexts(List<Optional<AuthoringId>> inputs) {
    return function("removeContexts", inputs, noParams());
  }

  /** The queue of the one target field the document creates. */
  private static Object loweredQueue(LowerResult result) {
    assertThat(lowered(result).content()).singleElement().isInstanceOf(TargetSlots.class);
    return ((TargetSlots) lowered(result).content().getFirst()).queue();
  }

  @Test
  void aCatalogueFunctionLowersToAFunCallOverItsInputsQueue() {
    assertThat(loweredQueue(lowerNote(removeContexts(inputs("a1")))))
        .isEqualTo(new FunCall(REMOVE_CONTEXTS, List.of(NOTES), id("f1")));
    // an input that is itself a function box is lowered to its call
    assertThat(
            loweredQueue(
                lowerNote(removeContexts(inputs("f2")), "f2", removeContexts(inputs("a1")))))
        .isEqualTo(
            new FunCall(
                REMOVE_CONTEXTS,
                List.of(new FunCall(REMOVE_CONTEXTS, List.of(NOTES), id("f2"))),
                id("f1")));
  }

  /**
   * A second input is one the entry lacks; {@code a2} reads a field the structure lacks, so the
   * missing {@code orphaned-reference} shows that the inputs of a box refused at the box are not
   * lowered.
   */
  @Test
  void moreInputsThanTheEntryHasIsWrongArityAtTheBox() {
    LowerResult result =
        lowerNote(removeContexts(inputs("a1", "a2")), "a2", source(ORDER + "/Missing"));

    assertThat(refused(result)).containsExactly(errorAtId("wrong-arity", "f1"));
  }

  static Stream<Arguments> unconnectedInputs() {
    return Stream.of(
        Arguments.of("no input slot", inputs()),
        Arguments.of("a null input slot", inputs((String) null)));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("unconnectedInputs")
  void anAbsentOrNullInputIsUnconnectedInputAtTheBox(
      String why, List<Optional<AuthoringId>> inputs) {
    assertThat(refused(lowerNote(removeContexts(inputs))))
        .containsExactly(errorAtId("unconnected-input", "f1"));
  }

  @Test
  void everyDefectOfTheBoxIsReportedAtTheBox() {
    StandardFunctionBox box =
        function(
            "removeContexts",
            inputs(null, "a1"),
            params("rows", table("a", "b"), "mode", text("each")));

    // one more input than the entry has, its one input null, and two params it lacks; a report is
    // sorted by location, then code
    assertThat(refused(lowerNote(box)))
        .containsExactly(
            errorAtId("unconnected-input", "f1"),
            errorAtId("unknown-parameter", "f1"),
            errorAtId("unknown-parameter", "f1"),
            errorAtId("wrong-arity", "f1"));
  }

  @Test
  void aRefusedInputRefusesTheCallAtTheInputsBox() {
    LowerResult result = lowerNote(removeContexts(inputs("a2")), "a2", source(ORDER + "/Missing"));

    assertThat(refused(result)).containsExactly(errorAtId("orphaned-reference", "a2"));
  }
}
