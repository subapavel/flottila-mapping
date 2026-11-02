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

  /**
   * The args bind in catalogue order, values then example (#58): Id in the root's context is A, B,
   * C, and Name in Item's context x1, x2 | y, so the result is A, B | C and the root's one slot
   * reads A, B. The args swapped would give x1, x2, y.
   */
  @Test
  void formatByExampleIsBoundByNameWithItsArgsInOrder() throws Exception {
    FunCall formatByExample =
        new FunCall(
            new FunctionRef("formatByExample", List.of(QUEUE, QUEUE), QUEUE),
            List.of(
                new SourceQueue(List.of(ORDER, new Name("", "Id")), 1, new AuthoringId("a1")),
                new SourceQueue(
                    List.of(ORDER, new Name("", "Item"), new Name("", "Name")),
                    2,
                    new AuthoringId("a2"))),
            new AuthoringId("f1"));
    TargetDocument document = notes(formatByExample, new VarRef("v", AtomicType.STRING, T1));
    IrVerifier.verify(document);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    String input =
        "<s:Order xmlns:s=\""
            + NS
            + "\"><Id>A</Id><Id>B</Id><Id>C</Id><Item><Name>x1</Name><Name>x2</Name></Item>"
            + "<Item><Name>y</Name></Item></s:Order>";

    Interpreter.compile(document, false)
        .run(new ByteArrayInputStream(input.getBytes(UTF_8)), out, new Tracer());

    assertThat(out.toString(UTF_8))
        .isEqualTo(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ns0:Order xmlns:ns0=\""
                + NS
                + "\"><Note>A</Note><Note>B</Note></ns0:Order>");
  }
}
