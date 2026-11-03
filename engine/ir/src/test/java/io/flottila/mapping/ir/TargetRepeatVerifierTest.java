package io.flottila.mapping.ir;

import static io.flottila.mapping.ir.FieldLinkIr.A1;
import static io.flottila.mapping.ir.FieldLinkIr.ORDER;
import static io.flottila.mapping.ir.FieldLinkIr.T1;
import static io.flottila.mapping.ir.FieldLinkIr.document;
import static io.flottila.mapping.ir.FieldLinkIr.rootSlot;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The verifier on {@link TargetRepeat} (ADR-0006; #63): at least one copy, an {@code INTEGER}
 * parent slot, content as its body, and its slot number in scope as an {@code INTEGER} only in its
 * body. Every refused document differs from the accepted one in the one defect it names.
 */
class TargetRepeatVerifierTest {

  private static final Name PAIR = new Name("", "Pair");
  private static final Name V = new Name("", "V");
  private static final AuthoringId PAIR_ORIGIN = new AuthoringId("/Order/Pair");

  /** V per slot of context {@code parentSlot} of V's queue in Pair's context. */
  private static TargetSlots values(Expr parentSlot) {
    return new TargetSlots(
        new SourceQueue(List.of(ORDER, PAIR, V), 2, A1),
        parentSlot,
        0,
        Long.MAX_VALUE,
        "vSlot",
        "v",
        new ElementConstructor(
            "", V, List.of(new TextConstructor(new VarRef("v", AtomicType.STRING, T1), T1)), T1),
        T1);
  }

  private static TargetRepeat pairs(long copies, Expr parentSlot, Expr body) {
    return new TargetRepeat(copies, parentSlot, "pairSlot", body, PAIR_ORIGIN);
  }

  private static ElementConstructor pair(Expr... content) {
    return new ElementConstructor("", PAIR, List.of(content), PAIR_ORIGIN);
  }

  private static VarRef pairSlot(AtomicType type) {
    return new VarRef("pairSlot", type, T1);
  }

  /** Pair twice under the root, its V reading Pair's slot number as its parent slot. */
  private static TargetDocument accepted() {
    return document(pairs(2, rootSlot(), pair(values(pairSlot(AtomicType.INTEGER)))));
  }

  static Stream<Arguments> defects() {
    Expr child = pair(values(pairSlot(AtomicType.INTEGER)));
    return Stream.of(
        Arguments.of("no copy", document(pairs(0, rootSlot(), child))),
        Arguments.of("fewer than no copy", document(pairs(-1, rootSlot(), child))),
        Arguments.of(
            "a string parent slot", document(pairs(2, new Literal("1", PAIR_ORIGIN), child))),
        Arguments.of(
            "its slot number read as a string",
            document(pairs(2, rootSlot(), pair(values(pairSlot(AtomicType.STRING)))))),
        Arguments.of(
            "its slot number read beside it, out of its body",
            document(pairs(2, rootSlot(), pair()), values(pairSlot(AtomicType.INTEGER)))),
        Arguments.of(
            "a value as its body", document(pairs(2, rootSlot(), new Literal("a", PAIR_ORIGIN)))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("defects")
  void refusesADefectiveTargetRepeat(String why, TargetDocument document) {
    assertThatCode(() -> IrVerifier.verify(accepted())).doesNotThrowAnyException();
    // one copy is the least accepted, as an unmapped 1..1 field gives it
    assertThatCode(
            () ->
                IrVerifier.verify(
                    document(pairs(1, rootSlot(), pair(values(pairSlot(AtomicType.INTEGER)))))))
        .doesNotThrowAnyException();

    assertThatThrownBy(() -> IrVerifier.verify(document))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
