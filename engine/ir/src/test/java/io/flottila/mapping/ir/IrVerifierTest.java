package io.flottila.mapping.ir;

import static io.flottila.mapping.ir.FieldLinkIr.A1;
import static io.flottila.mapping.ir.FieldLinkIr.A2;
import static io.flottila.mapping.ir.FieldLinkIr.NOTE;
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

  static void assertRefused(TargetDocument document) {
    assertThatThrownBy(() -> IrVerifier.verify(document))
        .isInstanceOfAny(IllegalArgumentException.class, IllegalStateException.class);
  }
}
