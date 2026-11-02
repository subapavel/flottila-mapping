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
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

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

  static Stream<Arguments> modes() {
    return Stream.of(
        Arguments.of("eachValue", "<Note>x</Note>"),
        Arguments.of("valueChange", "<Note>x</Note><Note>x</Note>"),
        Arguments.of("emptyValue", "<Note>x</Note><Note>x</Note><Note>y</Note>"));
  }

  /**
   * The mode param selects the function the call binds. {@code Note} x, x, y in the root's context
   * is one context, and the root's slot reads context 1 of the call's queue.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("modes")
  void theModeParamSelectsTheSplit(String mode, String notes) throws Exception {
    AuthoringId box = new AuthoringId("f1");
    FunCall split =
        new FunCall(
            new FunctionRef("splitByValue", List.of(QUEUE, AtomicType.STRING), QUEUE),
            List.of(sourceNotes(), new Literal(mode, box)),
            box);
    TargetDocument document = notes(split, new VarRef("v", AtomicType.STRING, T1));
    IrVerifier.verify(document);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    String input =
        "<s:Order xmlns:s=\"" + NS + "\"><Note>x</Note><Note>x</Note><Note>y</Note></s:Order>";

    Interpreter.compile(document, false)
        .run(new ByteArrayInputStream(input.getBytes(UTF_8)), out, new Tracer());

    assertThat(out.toString(UTF_8))
        .isEqualTo(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ns0:Order xmlns:ns0=\""
                + NS
                + "\">"
                + notes
                + "</ns0:Order>");
  }

  /**
   * A param is parsed once, when the call binds, so a value lowering would refuse is caught there.
   */
  @Test
  void aParamValueTheFunctionLacksIsACompilerBug() {
    AuthoringId box = new AuthoringId("f1");
    FunCall split =
        new FunCall(
            new FunctionRef("splitByValue", List.of(QUEUE, AtomicType.STRING), QUEUE),
            List.of(sourceNotes(), new Literal("everyOtherValue", box)),
            box);
    TargetDocument document = notes(split, new VarRef("v", AtomicType.STRING, T1));
    // witness: the IR is well-formed, and binding is what refuses it
    IrVerifier.verify(document);

    assertThatThrownBy(() -> Interpreter.compile(document, false))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("everyOtherValue");
  }

  /** {@code Order/<steps>} read in the context {@code depth} steps from the root. */
  private static SourceQueue source(int depth, String box, String... steps) {
    List<Name> names = new ArrayList<>(List.of(ORDER));
    for (String step : steps) {
      names.add(new Name("", step));
    }
    return new SourceQueue(names, depth, new AuthoringId(box));
  }

  /** Two Ids in the root's context, and Name in Item's: x1, x2 | y. */
  private static final String ITEMS =
      "<s:Order xmlns:s=\""
          + NS
          + "\"><Id>A</Id><Id>B</Id><Item><Name>x1</Name><Name>x2</Name></Item>"
          + "<Item><Name>y</Name></Item></s:Order>";

  /** The output of {@link #notes} over {@code queue} for the input {@link #ITEMS}. */
  private static String runOverItems(FunCall queue) throws Exception {
    TargetDocument document = notes(queue, new VarRef("v", AtomicType.STRING, T1));
    IrVerifier.verify(document);
    ByteArrayOutputStream out = new ByteArrayOutputStream();

    Interpreter.compile(document, false)
        .run(new ByteArrayInputStream(ITEMS.getBytes(UTF_8)), out, new Tracer());

    return out.toString(UTF_8);
  }

  private static String notesOf(String... values) {
    StringBuilder notes = new StringBuilder();
    for (String value : values) {
      notes.append("<Note>").append(value).append("</Note>");
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ns0:Order xmlns:ns0=\""
        + NS
        + "\">"
        + notes
        + "</ns0:Order>";
  }

  @Test
  void collapseContextsIsBoundByName() throws Exception {
    FunCall collapse =
        new FunCall(
            new FunctionRef("collapseContexts", List.of(QUEUE), QUEUE),
            List.of(source(2, "a1", "Item", "Name")),
            new AuthoringId("f1"));

    // Name in Item's context is x1, x2 | y; the root's one slot reads the collapsed context
    assertThat(runOverItems(collapse)).isEqualTo(notesOf("x1", "y"));
  }

  /** The args bind in catalogue order: value, occurrences, contexts. */
  @Test
  void useOneAsManyIsBoundByNameWithItsArgsInOrder() throws Exception {
    FunCall useOneAsMany =
        new FunCall(
            new FunctionRef("useOneAsMany", List.of(QUEUE, QUEUE, QUEUE), QUEUE),
            List.of(
                source(1, "a1", "Id"),
                source(2, "a2", "Item", "Name"),
                source(1, "a3", "Item", "Name")),
            new AuthoringId("f1"));

    // A once per Name of the first Item, B once per Name of the second, in one context
    assertThat(runOverItems(useOneAsMany)).isEqualTo(notesOf("A", "A", "B"));
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
