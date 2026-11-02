package io.flottila.mapping.runtime;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.FunctionRef;
import io.flottila.mapping.ir.IrVerifier;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.QueueType;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The interpreter binds a call by its catalogue name once, when it compiles (ADR-0025), and a
 * {@code Literal} is its constant value (ADR-0006). The IR is built by hand, one target field
 * {@code Note} under the root over {@code Note} in the root's context.
 */
class RuntimeLibraryBindingTest {

  private static final String NS = "urn:flottila:corpus:skeleton";
  private static final Name ORDER = new Name(NS, "Order");
  private static final Name NOTE = new Name("", "Note");
  private static final AuthoringId T1 = new AuthoringId("t1");
  private static final QueueType QUEUE = new QueueType();

  /** {@code <Note>{text}</Note>} per slot of {@code queue}'s context 1. */
  private static TargetDocument notes(Expr queue, Expr text) {
    return new TargetDocument(
        "ns0",
        ORDER,
        "root",
        List.of(
            new TargetSlots(
                queue,
                new VarRef("root", AtomicType.INTEGER, T1),
                0,
                Long.MAX_VALUE,
                "v",
                new ElementConstructor("", NOTE, List.of(new TextConstructor(text, T1)), T1),
                T1)));
  }

  private static SourceQueue sourceNotes() {
    return new SourceQueue(List.of(ORDER, NOTE), 1, new AuthoringId("a1"));
  }

  @Test
  void aFunctionTheRuntimeLibraryLacksIsACompilerBug() {
    FunCall unknown =
        new FunCall(
            new FunctionRef("noSuchFunction", List.of(QUEUE), QUEUE),
            List.of(sourceNotes()),
            new AuthoringId("f1"));
    TargetDocument document = notes(unknown, new VarRef("v", AtomicType.STRING, T1));
    // witness: the IR is well-formed, and binding is what refuses it
    IrVerifier.verify(document);

    assertThatThrownBy(() -> Interpreter.compile(document, false))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("noSuchFunction");
  }

  @Test
  void aLiteralIsItsValueInEverySlot() throws Exception {
    TargetDocument document = notes(sourceNotes(), new Literal("fixed", T1));
    IrVerifier.verify(document);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    String input = "<s:Order xmlns:s=\"" + NS + "\"><Note>x</Note><Note>y</Note></s:Order>";

    Interpreter.compile(document, false)
        .run(new ByteArrayInputStream(input.getBytes(UTF_8)), out, new Tracer());

    assertThat(out.toString(UTF_8))
        .isEqualTo(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ns0:Order xmlns:ns0=\""
                + NS
                + "\"><Note>fixed</Note><Note>fixed</Note></ns0:Order>");
  }
}
