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
import static org.assertj.core.api.Assertions.assertThatCode;

import io.flottila.mapping.ir.AtomicToQueue;
import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Lift;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.QueueType;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetRepeat;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
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

  private static final String ORDER_ID = ORDER + "/OrderId";
  private static final String NOTE = ORDER + "/Note";
  private static final QueueType QUEUE = new QueueType();
  private static final FunctionRef REMOVE_CONTEXTS =
      new FunctionRef("removeContexts", List.of(QUEUE), QUEUE);
  private static final SourceQueue NOTES =
      new SourceQueue(List.of(new Name(SKELETON, "Order"), new Name("", "Note")), 1, id("a1"));

  /**
   * {@code Note <- f1}, where {@code f1} is {@code function} and {@code a1} reads {@code Note}, and
   * the mandatory {@code OrderId <- a0}, which the target needs (#65).
   */
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
            targetFieldMappings(
                ORDER_ID,
                targetFieldMapping("t0", "a0", boxes("a0", source(ORDER_ID))),
                NOTE,
                targetFieldMapping("t1", "f1", boxes(all))),
            Map.of());
    return Lowering.lower(model, order(), order());
  }

  private static StandardFunctionBox removeContexts(List<Optional<AuthoringId>> inputs) {
    return function("removeContexts", inputs, noParams());
  }

  /** The queue of Note, the second of the two target fields the document creates, after OrderId. */
  private static Object loweredQueue(LowerResult result) {
    assertThat(lowered(result).content())
        .hasSize(2)
        .allSatisfy(e -> assertThat(e).isInstanceOf(TargetSlots.class))
        .extracting(Expr::origin)
        .containsExactly(id("t0"), id("t1"));
    return ((TargetSlots) lowered(result).content().getLast()).queue();
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

  // --- formatNum (#74): its pattern is a param of the syntax numberPattern (ADR-0026), which takes
  // only the DecimalFormat patterns the formatting core translates to an XPath picture

  @Test
  void aNumberPatternParamKeepsTheAuthorsStringAsItsLiteral() {
    StandardFunctionBox box = function("formatNum", inputs("a1"), params("pattern", text("#.##")));

    // the core would write the picture 0.##; the Literal keeps what the author wrote
    assertThat(loweredQueue(lowerNote(box)))
        .isInstanceOfSatisfying(
            Lift.class,
            lift ->
                assertThat(((FunCall) lift.body()).args())
                    .containsExactly(
                        new VarRef("in1", AtomicType.STRING, id("f1")),
                        new Literal("#.##", id("f1"))));
  }

  @Test
  void aNumberPatternWithoutAPictureIsInvalidParameterValueNamingItsElement() {
    LowerResult result =
        lowerNote(function("formatNum", inputs("a1"), params("pattern", text("0.00E0"))));

    assertThat(refused(result)).containsExactly(errorAtId("invalid-parameter-value", "f1"));
    assertThat(((Refused) result).diagnostics().getFirst().message())
        .isEqualTo(
            "the parameter pattern of formatNum: the number pattern \"0.00E0\" has no XPath"
                + " picture: the exponent E");
  }

  // --- dateTrans (#80): its formats are params of the syntax datePattern (ADR-0026), which takes
  // only the SimpleDateFormat patterns the formatting core translates to an XPath picture

  @Test
  void aDatePatternParamKeepsTheAuthorsStringAndADefaultForTheOther() {
    StandardFunctionBox box =
        function("dateTrans", inputs("a1"), params("targetFormat", text("dd.MM.yyyy")));

    // the core would write the picture [D01].[M01].[Y0001]; the Literal keeps what the author
    // wrote, and the left-out sourceFormat is the catalogue's default
    assertThat(loweredQueue(lowerNote(box)))
        .isInstanceOfSatisfying(
            Lift.class,
            lift ->
                assertThat(((FunCall) lift.body()).args())
                    .containsExactly(
                        new VarRef("in1", AtomicType.STRING, id("f1")),
                        new Literal("yyyy/MM/dd", id("f1")),
                        new Literal("dd.MM.yyyy", id("f1"))));
  }

  @Test
  void aDatePatternWithoutAPictureIsInvalidParameterValueNamingItsElement() {
    LowerResult result =
        lowerNote(function("dateTrans", inputs("a1"), params("sourceFormat", text("hh:mm"))));

    assertThat(refused(result)).containsExactly(errorAtId("invalid-parameter-value", "f1"));
    assertThat(((Refused) result).diagnostics().getFirst().message())
        .isEqualTo(
            "the parameter sourceFormat of dateTrans: the date pattern \"hh:mm\" has no XPath"
                + " picture: the pattern letter h");
  }

  // --- removeContexts over a single value (#230, F-51): a generating block, as copyValue's result
  // is (ADR-0006 since #217); lowering decides it from the input, so over a queue it stays a queue,
  // and over another queue function's result it stays as it was (owner decision 1)

  private static final FunctionRef CONSTANT =
      new FunctionRef("constant", List.of(AtomicType.STRING), AtomicType.STRING);
  private static final FunctionRef COUNT = new FunctionRef("count", List.of(QUEUE), QUEUE);

  /** A constant box with the value {@code value}. */
  private static StandardFunctionBox constant(String value) {
    return function("constant", inputs(), params("value", text(value)));
  }

  /** The constant {@code value} of box {@code box} at a context or queue function's input. */
  private static AtomicToQueue constantQueue(String box, String value) {
    return new AtomicToQueue(
        new FunCall(CONSTANT, List.of(new Literal(value, id(box))), id(box)), id(box));
  }

  /** The item of Note, the second of the two the document holds, after OrderId's. */
  private static Expr loweredNote(TargetDocument document) {
    assertThat(document.content())
        .hasSize(2)
        .extracting(Expr::origin)
        .containsExactly(id("t0"), id("t1"));
    return document.content().getLast();
  }

  /**
   * Note (0..unbounded) from removeContexts over the constant k (obs-lift-reuse lift-4, PO 7.50 and
   * CPI): a generating {@code TargetRepeat} over the block, as for copyValue (ADR-0006 since #217).
   * The removeContexts call is its value, with the constant as one context with one value at its
   * input; {@code value2} is its value variable, which Note's text reads; it has {@code max(1, 0)}
   * copies per parent occurrence. Before F-51 Note is a {@code TargetSlots} over that call, written
   * under the first parent occurrence only. Another single value, trim of a constant, is one
   * context with one value as well.
   */
  @Test
  void removeContextsOfConstantIsGeneratingBlock() {
    TargetDocument document = lowered(lowerNote(removeContexts(inputs("k1")), "k1", constant("k")));

    assertThat(loweredNote(document))
        .isEqualTo(
            new TargetRepeat(
                1,
                new VarRef("root", AtomicType.INTEGER, id("t1")),
                "slot2",
                Optional.of(
                    new FunCall(REMOVE_CONTEXTS, List.of(constantQueue("k1", "k")), id("f1"))),
                Optional.of("value2"),
                new ElementConstructor(
                    "",
                    new Name("", "Note"),
                    List.of(
                        new TextConstructor(
                            new VarRef("value2", AtomicType.STRING, id("t1")), id("t1"))),
                    id("t1")),
                id("t1")));
    assertThatCode(() -> IrVerifier.verify(document)).doesNotThrowAnyException();

    assertThat(
            loweredNote(
                lowered(
                    lowerNote(
                        removeContexts(inputs("f2")),
                        "f2",
                        function("trim", inputs("k1"), noParams()),
                        "k1",
                        constant(" k ")))))
        .as("removeContexts over trim(constant)")
        .isInstanceOfSatisfying(
            TargetRepeat.class, repeat -> assertThat(repeat.valueVar()).contains("value2"));
  }

  /**
   * Guard: over a queue removeContexts stays a queue, so Note is a {@code TargetSlots} over its
   * call: over Note's source queue, and over concat of Note with a constant, a {@code Lift} that
   * applies the constant to every slot (ADR-0006).
   */
  @Test
  void removeContextsOfSourceQueueStaysQueue() {
    assertThat(loweredQueue(lowerNote(removeContexts(inputs("a1")))))
        .isEqualTo(new FunCall(REMOVE_CONTEXTS, List.of(NOTES), id("f1")));

    assertThat(
            loweredQueue(
                lowerNote(
                    removeContexts(inputs("f2")),
                    "f2",
                    function("concat", inputs("a1", "k1"), noParams()),
                    "k1",
                    constant("k"))))
        .as("removeContexts over concat(Note, constant)")
        .isInstanceOfSatisfying(
            FunCall.class,
            call -> {
              assertThat(call.function()).isEqualTo(REMOVE_CONTEXTS);
              assertThat(call.args()).singleElement().isInstanceOf(Lift.class);
            });
  }

  /**
   * The deviation F-51 records (owner decision 2, #230): a box that takes a single value cannot
   * read removeContexts over a constant, as it cannot read copyValue's block (F-46). It is {@code
   * unsupported-generating-input} at the concat box, whichever input reads it, and its message
   * names the removeContexts box r1; SAP PO accepts that graph. Witnesses: concat of the constant
   * itself with Note, and of removeContexts over Note with Note, lower.
   */
  @Test
  void concatOfRemoveContextsOfConstantIsRefused() {
    for (List<Optional<AuthoringId>> order : List.of(inputs("r1", "a1"), inputs("a1", "r1"))) {
      LowerResult result =
          lowerNote(
              function("concat", order, noParams()),
              "r1",
              removeContexts(inputs("k1")),
              "k1",
              constant("k"));

      assertThat(refused(result))
          .as("concat %s", order)
          .containsExactly(errorAtId("unsupported-generating-input", "f1"));
      assertThat(((Refused) result).diagnostics().getFirst().message())
          .as("concat %s names the removeContexts box", order)
          .contains("r1");
    }

    assertThat(lowerNote(function("concat", inputs("k1", "a1"), noParams()), "k1", constant("k")))
        .as("concat(constant, Note)")
        .isInstanceOf(Lowered.class);
    assertThat(
            lowerNote(
                function("concat", inputs("r1", "a1"), noParams()),
                "r1",
                removeContexts(inputs("a1"))))
        .as("concat(removeContexts(Note), Note)")
        .isInstanceOf(Lowered.class);
  }

  /**
   * At a context function's input the block is the queue it is (ADR-0006 since #217): count over
   * removeContexts of a constant is count's call over that call, and Note is a {@code TargetSlots}
   * over it, as count of the constant itself is a queue (fn/constant/006, F-21).
   */
  @Test
  void countOfRemoveContextsOfConstantIsQueue() {
    assertThat(
            loweredQueue(
                lowerNote(
                    function("count", inputs("r1"), noParams()),
                    "r1",
                    removeContexts(inputs("k1")),
                    "k1",
                    constant("k"))))
        .isEqualTo(
            new FunCall(
                COUNT,
                List.of(new FunCall(REMOVE_CONTEXTS, List.of(constantQueue("k1", "k")), id("r1"))),
                id("f1")));
  }

  /**
   * Guard for owner decision 1 (#230): removeContexts over copyValue's generating block is not
   * observed, so it stays as before F-51, a queue function's call over that queue, and Note is a
   * {@code TargetSlots} over it.
   */
  @Test
  void removeContextsOfCopyValueStaysAsToday() {
    assertThat(
            loweredQueue(
                lowerNote(
                    removeContexts(inputs("c1")),
                    "c1",
                    function("copyValue", inputs("a1"), noParams()))))
        .isEqualTo(
            new FunCall(
                REMOVE_CONTEXTS,
                List.of(
                    new FunCall(
                        new FunctionRef("copyValue", List.of(QUEUE, AtomicType.STRING), QUEUE),
                        List.of(NOTES, new Literal("0", id("c1"))),
                        id("c1"))),
                id("f1")));
  }

  /**
   * Guard for owner decision 1 (#230): removeContexts over removeContexts of a constant is not
   * observed, so it stays as before F-51: the outer call reads the inner one as a queue, and Note
   * is a {@code TargetSlots} over it.
   */
  @Test
  void removeContextsOfRemoveContextsOfConstantStaysAsToday() {
    assertThat(
            loweredQueue(
                lowerNote(
                    removeContexts(inputs("r1")),
                    "r1",
                    removeContexts(inputs("k1")),
                    "k1",
                    constant("k"))))
        .isEqualTo(
            new FunCall(
                REMOVE_CONTEXTS,
                List.of(new FunCall(REMOVE_CONTEXTS, List.of(constantQueue("k1", "k")), id("r1"))),
                id("f1")));
  }
}
