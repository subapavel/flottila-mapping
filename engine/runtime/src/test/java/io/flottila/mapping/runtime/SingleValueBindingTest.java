package io.flottila.mapping.runtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Lift;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The interpreter binds the single-value function of a {@code Lift}'s body by its catalogue name
 * once, when it compiles (ADR-0025): a name no single-value function has is a compiler bug, as
 * lowering calls only functions of the catalogue.
 */
class SingleValueBindingTest {

  private static final String NS = "urn:flottila:corpus:skeleton";
  private static final Name ORDER = new Name(NS, "Order");
  private static final Name NOTE = new Name("", "Note");
  private static final AuthoringId T1 = new AuthoringId("t1");
  private static final AuthoringId F1 = new AuthoringId("f1");

  /** {@code <Note>{value}</Note>} per slot of a Lift over Note whose body calls {@code name}. */
  private static TargetDocument noteOverACallOf(String name) {
    FunctionRef function =
        new FunctionRef(name, List.of(AtomicType.STRING, AtomicType.STRING), AtomicType.STRING);
    Lift lift =
        new Lift(
            List.of(new SourceQueue(List.of(ORDER, NOTE), 1, new AuthoringId("a1"))),
            List.of("in1"),
            new FunCall(
                function,
                List.of(new VarRef("in1", AtomicType.STRING, F1), new Literal("X", F1)),
                F1),
            F1);
    return new TargetDocument(
        "ns0",
        ORDER,
        "root",
        List.of(
            new TargetSlots(
                lift,
                new VarRef("root", AtomicType.INTEGER, T1),
                0,
                Long.MAX_VALUE,
                "v",
                new ElementConstructor(
                    "",
                    NOTE,
                    List.of(new TextConstructor(new VarRef("v", AtomicType.STRING, T1), T1)),
                    T1),
                T1)));
  }

  @Test
  void aSingleValueFunctionTheRuntimeLacksIsACompilerBug() {
    TargetDocument unknown = noteOverACallOf("noSuchFunction");
    // witness: the IR is well-formed, and the same Lift over replaceValue compiles
    IrVerifier.verify(unknown);
    assertThat(Interpreter.compile(noteOverACallOf("replaceValue"), false)).isNotNull();

    assertThatThrownBy(() -> Interpreter.compile(unknown, false))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("noSuchFunction");
  }
}
