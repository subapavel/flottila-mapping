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

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.Literal;
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
 * removeContexts} has one input and no params; {@code splitByValue} has one input and one param
 * (#55). {@code Note <- f1} throughout, {@code a1} reading {@code Note}.
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

  // --- box parameters (#55): splitByValue has one input and the string param mode, whose values
  // are eachValue, valueChange and emptyValue, and whose default is eachValue

  private static final FunctionRef SPLIT_BY_VALUE =
      new FunctionRef("splitByValue", List.of(QUEUE, AtomicType.STRING), QUEUE);

  @Test
  void aParamTheBoxLeavesOutIsItsDefaultAsALiteralAfterTheInputs() {
    assertThat(loweredQueue(lowerNote(function("splitByValue", inputs("a1"), noParams()))))
        .isEqualTo(
            new FunCall(
                SPLIT_BY_VALUE, List.of(NOTES, new Literal("eachValue", id("f1"))), id("f1")));
  }

  @Test
  void aParamTheBoxGivesIsItsStringAsALiteral() {
    StandardFunctionBox box =
        function("splitByValue", inputs("a1"), params("mode", text("emptyValue")));

    assertThat(loweredQueue(lowerNote(box)))
        .isEqualTo(
            new FunCall(
                SPLIT_BY_VALUE, List.of(NOTES, new Literal("emptyValue", id("f1"))), id("f1")));
  }

  static Stream<Arguments> refusedParams() {
    return Stream.of(
        Arguments.of(
            "a table for the string param",
            params("mode", table("a", "b")),
            "wrong-parameter-type"),
        Arguments.of(
            "a string outside its values", params("mode", text("each")), "invalid-parameter-value"),
        Arguments.of(
            "a key the entry lacks beside a valid param",
            params("mode", text("valueChange"), "order", text("ascending")),
            "unknown-parameter"));
  }

  /**
   * A param refused at the box refuses the call; {@code a2} reads a field the structure lacks, so
   * the missing {@code orphaned-reference} shows that the box's inputs are not lowered.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("refusedParams")
  void aParamThatDoesNotFitTheEntryIsRefusedAtTheBox(
      String why, Map<String, ParamValue> params, String code) {
    LowerResult result =
        lowerNote(function("splitByValue", inputs("a2"), params), "a2", source(ORDER + "/Missing"));

    assertThat(refused(result)).as(why).containsExactly(errorAtId(code, "f1"));
  }

  @Test
  void aRefusedInputRefusesTheCallAtTheInputsBox() {
    LowerResult result = lowerNote(removeContexts(inputs("a2")), "a2", source(ORDER + "/Missing"));

    assertThat(refused(result)).containsExactly(errorAtId("orphaned-reference", "a2"));
  }

  // --- sort and sortByKey (#59): the params comparison (lexicographic, caseInsensitive, numeric;
  // default lexicographic) and order (ascending, descending; default ascending), in that order

  @Test
  void sortTakesItsComparisonThenItsOrderAfterItsInput() {
    StandardFunctionBox box = function("sort", inputs("a1"), params("order", text("descending")));

    assertThat(loweredQueue(lowerNote(box)))
        .isEqualTo(
            new FunCall(
                new FunctionRef(
                    "sort", List.of(QUEUE, AtomicType.STRING, AtomicType.STRING), QUEUE),
                List.of(
                    NOTES,
                    new Literal("lexicographic", id("f1")),
                    new Literal("descending", id("f1"))),
                id("f1")));
  }

  /** The keys, then the values, then the params; one box feeds both inputs, lowered per use. */
  @Test
  void sortByKeyTakesItsKeysThenItsValuesThenItsParams() {
    StandardFunctionBox box =
        function("sortByKey", inputs("a1", "a1"), params("comparison", text("numeric")));

    assertThat(loweredQueue(lowerNote(box)))
        .isEqualTo(
            new FunCall(
                new FunctionRef(
                    "sortByKey",
                    List.of(QUEUE, QUEUE, AtomicType.STRING, AtomicType.STRING),
                    QUEUE),
                List.of(
                    NOTES,
                    NOTES,
                    new Literal("numeric", id("f1")),
                    new Literal("ascending", id("f1"))),
                id("f1")));
  }

  static Stream<Arguments> refusedSortParams() {
    return Stream.of(
        Arguments.of(
            "the hyphenated spelling",
            function("sort", inputs("a1"), params("comparison", text("case-insensitive")))),
        Arguments.of(
            "caseSensitive, which is lexicographic",
            function("sort", inputs("a1"), params("comparison", text("caseSensitive")))),
        Arguments.of(
            "an order short for descending",
            function("sortByKey", inputs("a1", "a1"), params("order", text("desc")))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("refusedSortParams")
  void aSortParamOutsideItsValuesIsInvalidParameterValue(String why, StandardFunctionBox box) {
    assertThat(refused(lowerNote(box)))
        .as(why)
        .containsExactly(errorAtId("invalid-parameter-value", "f1"));
  }
}
