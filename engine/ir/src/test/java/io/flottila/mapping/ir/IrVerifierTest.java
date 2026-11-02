package io.flottila.mapping.ir;

import static io.flottila.mapping.ir.FieldLinkIr.A1;
import static io.flottila.mapping.ir.FieldLinkIr.A2;
import static io.flottila.mapping.ir.FieldLinkIr.NOTE;
import static io.flottila.mapping.ir.FieldLinkIr.ORDER;
import static io.flottila.mapping.ir.FieldLinkIr.ORDER_ID;
import static io.flottila.mapping.ir.FieldLinkIr.T1;
import static io.flottila.mapping.ir.FieldLinkIr.T2;
import static io.flottila.mapping.ir.FieldLinkIr.document;
import static io.flottila.mapping.ir.FieldLinkIr.fieldLink;
import static io.flottila.mapping.ir.FieldLinkIr.orderIdLink;
import static io.flottila.mapping.ir.FieldLinkIr.queue;
import static io.flottila.mapping.ir.FieldLinkIr.rootSlot;
import static io.flottila.mapping.ir.FieldLinkIr.slots;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The IR verifier (ADR-0006): it re-checks lowered IR, and a refusal is a compiler bug, so it
 * throws. Every refused document differs from an accepted one of {@link
 * #acceptsTheLoweredFieldLink} in the one defect it names. The exception type is not fixed by #26;
 * it is an illegal argument or an illegal state, never an incidental failure.
 */
class IrVerifierTest {

  private static final long UNBOUNDED = Long.MAX_VALUE;

  @Test
  void acceptsTheLoweredFieldLink() {
    assertThatCode(() -> IrVerifier.verify(fieldLink())).doesNotThrowAnyException();
    // the root alone, as an empty source gives it
    assertThatCode(() -> IrVerifier.verify(document())).doesNotThrowAnyException();
    // two siblings, each with its own value in scope; min 0 and an unbounded max
    assertThatCode(
            () ->
                IrVerifier.verify(
                    document(
                        orderIdLink(),
                        slots(
                            NOTE,
                            queue(NOTE, 1, A2),
                            rootSlot(),
                            0,
                            UNBOUNDED,
                            "w",
                            new VarRef("w", AtomicType.STRING, T2),
                            T2))))
        .doesNotThrowAnyException();
  }

  static Stream<Arguments> badVarRefs() {
    return Stream.of(
        Arguments.of(
            "a value that is never bound",
            document(
                slots(
                    ORDER_ID,
                    queue(ORDER_ID, 1, A1),
                    rootSlot(),
                    1,
                    1,
                    "v",
                    new VarRef("w", AtomicType.STRING, T1),
                    T1))),
        Arguments.of(
            "the slot value read as an integer",
            document(
                slots(
                    ORDER_ID,
                    queue(ORDER_ID, 1, A1),
                    rootSlot(),
                    1,
                    1,
                    "v",
                    new VarRef("v", AtomicType.INTEGER, T1),
                    T1))),
        Arguments.of(
            "the root slot number read as a string",
            document(
                slots(
                    ORDER_ID,
                    queue(ORDER_ID, 1, A1),
                    new VarRef(FieldLinkIr.ROOT_SLOT, AtomicType.STRING, T1),
                    1,
                    1,
                    "v",
                    new VarRef("v", AtomicType.STRING, T1),
                    T1))),
        Arguments.of(
            "a parent slot that is never bound",
            document(
                slots(
                    ORDER_ID,
                    queue(ORDER_ID, 1, A1),
                    new VarRef("parent", AtomicType.INTEGER, T1),
                    1,
                    1,
                    "v",
                    new VarRef("v", AtomicType.STRING, T1),
                    T1))),
        Arguments.of(
            "the slot value used outside its body, as its own parent slot",
            document(
                slots(
                    ORDER_ID,
                    queue(ORDER_ID, 1, A1),
                    new VarRef("v", AtomicType.INTEGER, T1),
                    1,
                    1,
                    "v",
                    new VarRef("v", AtomicType.STRING, T1),
                    T1))),
        Arguments.of(
            "a sibling's slot value, out of its scope",
            document(
                orderIdLink(),
                slots(
                    NOTE,
                    queue(NOTE, 1, A2),
                    rootSlot(),
                    0,
                    UNBOUNDED,
                    "w",
                    new VarRef("v", AtomicType.STRING, T2),
                    T2))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("badVarRefs")
  void refusesAnUnboundOrMistypedVarRef(String why, TargetDocument document) {
    assertRefused(document);
  }

  /**
   * {@code OrderId} has two steps; only depth 1, its parent {@code Order}, is a proper ancestor.
   */
  @ParameterizedTest(name = "context depth {0}")
  @ValueSource(ints = {-1, 0, 2, 3})
  void refusesAContextThatIsNotAProperAncestor(int contextDepth) {
    assertRefused(
        document(
            slots(
                ORDER_ID,
                queue(ORDER_ID, contextDepth, A1),
                rootSlot(),
                1,
                1,
                "v",
                new VarRef("v", AtomicType.STRING, T1),
                T1)));
  }

  @ParameterizedTest(name = "min {0} max {1}")
  @MethodSource("minAboveMax")
  void refusesMinAboveMax(long min, long max) {
    assertRefused(
        document(
            slots(
                ORDER_ID,
                queue(ORDER_ID, 1, A1),
                rootSlot(),
                min,
                max,
                "v",
                new VarRef("v", AtomicType.STRING, T1),
                T1)));
  }

  static Stream<Arguments> minAboveMax() {
    return Stream.of(Arguments.of(2L, 1L), Arguments.of(1L, 0L));
  }

  // --- function calls (#50, ADR-0025): a FunCall's args match its FunctionRef in number and type,
  // and a param, an atomic argument of a context function, is a Literal. Lowering fills every
  // default, so the IR is total. A node's type is derived: a call's is its FunctionRef's result.

  private static final QueueType QUEUE = new QueueType();
  private static final AuthoringId R1 = new AuthoringId("r1");

  /** removeContexts: one queue input, no param. */
  private static final FunctionRef REMOVE_CONTEXTS =
      new FunctionRef("removeContexts", List.of(QUEUE), QUEUE);

  /** A context function with one queue input and one string param, as splitByValue's mode. */
  private static final FunctionRef SPLIT_BY_VALUE =
      new FunctionRef("splitByValue", List.of(QUEUE, AtomicType.STRING), QUEUE);

  /** A single-value function of one string, as trim: an atomic call. */
  private static final FunctionRef TRIM =
      new FunctionRef("trim", List.of(AtomicType.STRING), AtomicType.STRING);

  private static FunCall call(FunctionRef function, Expr... args) {
    return new FunCall(function, List.of(args), R1);
  }

  private static Literal literal(String value) {
    return new Literal(value, R1);
  }

  private static SourceQueue orderIds() {
    return queue(ORDER_ID, 1, A1);
  }

  /** The field link with {@code queue} as its target field's queue. */
  private static TargetDocument over(Expr queue) {
    return document(
        slots(ORDER_ID, queue, rootSlot(), 1, 1, "v", new VarRef("v", AtomicType.STRING, T1), T1));
  }

  /**
   * {@code Item} per slot of its queue, its value bound to {@code item}, and inside it {@code Name}
   * per slot of {@code splitByValue(Name, param)}: there {@code item} is a string in scope.
   */
  private static TargetDocument nested(Expr param) {
    Name item = new Name("", "Item");
    Name name = new Name("", "Name");
    TargetSlots names =
        slots(
            name,
            call(SPLIT_BY_VALUE, new SourceQueue(List.of(ORDER, item, name), 2, A2), param),
            rootSlot(),
            0,
            UNBOUNDED,
            "name",
            new VarRef("name", AtomicType.STRING, T2),
            T2);
    return document(
        new TargetSlots(
            queue(item, 1, A1),
            rootSlot(),
            0,
            UNBOUNDED,
            "item",
            new ElementConstructor("", item, List.of(names), T1),
            T1));
  }

  static void assertAccepted(TargetDocument document) {
    assertThatCode(() -> IrVerifier.verify(document)).doesNotThrowAnyException();
  }

  static Stream<Arguments> wrongArities() {
    return Stream.of(
        Arguments.of("removeContexts without its input", over(call(REMOVE_CONTEXTS))),
        Arguments.of(
            "removeContexts with a second input",
            over(call(REMOVE_CONTEXTS, orderIds(), orderIds()))),
        Arguments.of(
            "a param left out, which lowering fills with its default",
            over(call(SPLIT_BY_VALUE, orderIds()))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("wrongArities")
  void aFunCallWithTheWrongArityIsRefused(String why, TargetDocument document) {
    // witness: each function with exactly its args is accepted
    assertAccepted(over(call(REMOVE_CONTEXTS, orderIds())));
    assertAccepted(over(call(SPLIT_BY_VALUE, orderIds(), literal("each"))));

    assertRefused(document);
  }

  static Stream<Arguments> wrongArgTypes() {
    return Stream.of(
        Arguments.of("a literal for a queue", over(call(REMOVE_CONTEXTS, literal("a")))),
        Arguments.of("the root's slot number for a queue", over(call(REMOVE_CONTEXTS, rootSlot()))),
        Arguments.of(
            "an atomic call for a queue", over(call(REMOVE_CONTEXTS, call(TRIM, literal(" a "))))),
        Arguments.of(
            "a queue call for a string param",
            over(call(SPLIT_BY_VALUE, orderIds(), call(REMOVE_CONTEXTS, orderIds())))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("wrongArgTypes")
  void aFunCallArgOfTheWrongTypeIsRefused(String why, TargetDocument document) {
    // witness: a call over a call, whose type is its FunctionRef's result, a queue
    assertAccepted(over(call(REMOVE_CONTEXTS, call(REMOVE_CONTEXTS, orderIds()))));
    assertAccepted(over(call(SPLIT_BY_VALUE, orderIds(), literal("each"))));

    assertRefused(document);
  }

  static Stream<Arguments> paramsThatAreNoLiterals() {
    return Stream.of(
        Arguments.of(
            "an atomic call",
            over(call(SPLIT_BY_VALUE, orderIds(), call(TRIM, literal(" each "))))),
        Arguments.of(
            "a string variable in scope", nested(new VarRef("item", AtomicType.STRING, T2))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("paramsThatAreNoLiterals")
  void aParamThatIsNoLiteralIsRefused(String why, TargetDocument document) {
    // witness: the same documents with a Literal in the param's place are accepted
    assertAccepted(over(call(SPLIT_BY_VALUE, orderIds(), literal("each"))));
    assertAccepted(nested(literal("each")));

    assertRefused(document);
  }

  static Stream<Arguments> atomicQueues() {
    return Stream.of(
        Arguments.of("a literal", over(literal("a"))),
        Arguments.of("the root's slot number", over(rootSlot())),
        Arguments.of("an atomic call", over(call(TRIM, literal(" a ")))));
  }

  /** A target field's occurrences are the slots of a queue, never of an atomic value. */
  @ParameterizedTest(name = "{0}")
  @MethodSource("atomicQueues")
  void targetSlotsOverAnAtomicIsRefused(String why, TargetDocument document) {
    // witness: a queue call is a queue to create slots from
    assertAccepted(over(call(REMOVE_CONTEXTS, orderIds())));

    assertRefused(document);
  }

  static void assertRefused(TargetDocument document) {
    assertThatThrownBy(() -> IrVerifier.verify(document))
        .isInstanceOfAny(IllegalArgumentException.class, IllegalStateException.class);
  }
}
