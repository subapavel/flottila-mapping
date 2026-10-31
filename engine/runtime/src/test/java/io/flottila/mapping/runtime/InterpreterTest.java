package io.flottila.mapping.runtime;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.flottila.mapping.ir.AtomicType;
import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import io.flottila.mapping.xdm.QueueBlock;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The closure-compiled interpreter (ADR-0021) at {@code Interpreter.compile} and {@code
 * ExecutableMapping.run}: it projects the source queues in one StAX pass, creates the root once
 * with slot number 1, and creates a target field per slot of the context its parent's slot number
 * names (ADR-0006). Inputs are written by hand; expected outputs are byte literals (ADR-0022).
 *
 * <p>{@code Tracer.values()} lists every report in the order made, as an entry of the box's
 * authoring id and the queue block, so a second report of one box is visible.
 */
class InterpreterTest {

  private static final String NS = "urn:flottila:corpus:skeleton";
  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
  private static final String ROOT_OPEN = "<ns0:Order xmlns:ns0=\"" + NS + "\">";
  private static final String ROOT_CLOSE = "</ns0:Order>";
  private static final String EMPTY_ROOT = "<ns0:Order xmlns:ns0=\"" + NS + "\"/>";
  private static final Name ORDER = new Name(NS, "Order");
  private static final String ROOT_SLOT = "root";
  private static final long UNBOUNDED = Long.MAX_VALUE;

  // --- IR, built by hand as lowering gives it

  private static Name local(String name) {
    return new Name("", name);
  }

  private static AuthoringId id(String value) {
    return new AuthoringId(value);
  }

  private static TargetDocument document(Expr... content) {
    return new TargetDocument("ns0", ORDER, ROOT_SLOT, List.of(content));
  }

  /** A target leaf under the root, one per slot of {@code queue}'s context 1. */
  private static TargetSlots leaf(
      String target, SourceQueue queue, long min, long max, String mapping) {
    AuthoringId origin = id(mapping);
    return new TargetSlots(
        queue,
        new VarRef(ROOT_SLOT, AtomicType.INTEGER, origin),
        min,
        max,
        "v",
        new ElementConstructor(
            "",
            local(target),
            List.of(new TextConstructor(new VarRef("v", AtomicType.STRING, origin), origin)),
            origin),
        origin);
  }

  /** The queue of a leaf directly under the root, in the root's context. */
  private static SourceQueue rootLeaf(String field, String box) {
    return new SourceQueue(List.of(ORDER, local(field)), 1, id(box));
  }

  /** {@code OrderId <- OrderId}, 1..1: the skeleton's field link. */
  private static TargetDocument orderIdLink() {
    return document(leaf("OrderId", rootLeaf("OrderId", "a1"), 1, 1, "t1"));
  }

  /** Three field links; {@code a1} and {@code a3} read the same source field. */
  private static TargetDocument threeLinks() {
    return document(
        leaf("OrderId", rootLeaf("OrderId", "a1"), 1, 1, "t1"),
        leaf("Note", rootLeaf("Note", "a2"), 0, UNBOUNDED, "t2"),
        leaf("Copy", rootLeaf("OrderId", "a3"), 0, 1, "t3"));
  }

  private static final String THREE_LINKS_INPUT =
      "<s:Order xmlns:s=\"" + NS + "\"><OrderId>1</OrderId><Note>x</Note><Note>y</Note></s:Order>";
  private static final String THREE_LINKS_OUTPUT =
      DECLARATION
          + ROOT_OPEN
          + "<OrderId>1</OrderId><Note>x</Note><Note>y</Note><Copy>1</Copy>"
          + ROOT_CLOSE;

  // --- running

  private static byte[] run(TargetDocument document, boolean traced, byte[] input, Tracer tracer)
      throws Exception {
    ExecutableMapping mapping = Interpreter.compile(document, traced);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    mapping.run(new ByteArrayInputStream(input), out, tracer);
    return out.toByteArray();
  }

  private static String run(TargetDocument document, String input) throws Exception {
    return new String(run(document, false, input.getBytes(UTF_8), new Tracer()), UTF_8);
  }

  private static String sourceOrder(String content) {
    return "<s:Order xmlns:s=\"" + NS + "\">" + content + "</s:Order>";
  }

  /** The block as contexts of values. */
  private static List<List<String>> contexts(QueueBlock block) {
    List<List<String>> contexts = new ArrayList<>();
    for (int c = 0; c < block.contexts(); c++) {
      List<String> context = new ArrayList<>();
      for (int i = block.start(c); i < block.end(c); i++) {
        context.add(block.value(i));
      }
      contexts.add(context);
    }
    return contexts;
  }

  /** The one block traced for {@code box}; fails unless it was reported exactly once. */
  private static List<List<String>> tracedOnce(Tracer tracer, String box) {
    List<QueueBlock> blocks =
        tracer.values().stream()
            .filter(e -> e.getKey().equals(id(box)))
            .map(Map.Entry::getValue)
            .toList();
    assertThat(blocks).as("reports of %s", box).hasSize(1);
    return contexts(blocks.getFirst());
  }

  // --- target creation (ADR-0006)

  @Test
  void theRootIsCreatedOnceAndAFieldPerSlotOfContextOne() throws Exception {
    // Name under Item under Order, in Item's context: two contexts, [x1, x2] and [y]
    TargetDocument names =
        document(
            leaf(
                "Name",
                new SourceQueue(List.of(ORDER, local("Item"), local("Name")), 2, id("a1")),
                0,
                UNBOUNDED,
                "t1"));
    String input =
        sourceOrder("<Item><Name>x1</Name><Name>x2</Name></Item><Item><Name>y</Name></Item>");
    Tracer tracer = new Tracer();

    byte[] out = run(names, true, input.getBytes(UTF_8), tracer);

    assertThat(tracedOnce(tracer, "a1")).containsExactly(List.of("x1", "x2"), List.of("y"));
    // the root has slot number 1, so only context 1 is read
    assertThat(new String(out, UTF_8))
        .isEqualTo(DECLARATION + ROOT_OPEN + "<Name>x1</Name><Name>x2</Name>" + ROOT_CLOSE);
  }

  @Test
  void anEmptyContextCreatesNoFieldButWritesTheRoot() throws Exception {
    Tracer tracer = new Tracer();

    byte[] out = run(orderIdLink(), true, sourceOrder("").getBytes(UTF_8), tracer);

    // one occurrence of the context field without the field: one empty context, not none
    assertThat(tracedOnce(tracer, "a1")).containsExactly(List.of());
    assertThat(new String(out, UTF_8)).isEqualTo(DECLARATION + EMPTY_ROOT);
  }

  @Test
  void creationStopsAfterMax() throws Exception {
    TargetDocument atMostTwo = document(leaf("Note", rootLeaf("Note", "a1"), 0, 2, "t1"));

    String out = run(atMostTwo, sourceOrder("<Note>a</Note><Note>b</Note><Note>c</Note>"));

    assertThat(out)
        .isEqualTo(DECLARATION + ROOT_OPEN + "<Note>a</Note><Note>b</Note>" + ROOT_CLOSE);
  }

  @Test
  void anUnmappedSourceFieldIsNeverCreated() throws Exception {
    String input =
        "<s:Order xmlns:s=\""
            + NS
            + "\" channel=\"web\">"
            + "<OrderId>4711</OrderId><Quantity>3</Quantity><Note>n</Note>"
            // the same local name in another namespace is another field
            + "<o:OrderId xmlns:o=\"urn:other\">9</o:OrderId>"
            + "</s:Order>";

    String out = run(orderIdLink(), input);

    assertThat(out).isEqualTo(DECLARATION + ROOT_OPEN + "<OrderId>4711</OrderId>" + ROOT_CLOSE);
  }

  @Test
  void anEmptyLeafIsTheValueEmptyString() throws Exception {
    Tracer selfClosed = new Tracer();
    Tracer openClose = new Tracer();

    byte[] fromSelfClosed =
        run(orderIdLink(), true, sourceOrder("<OrderId/>").getBytes(UTF_8), selfClosed);
    byte[] fromOpenClose =
        run(orderIdLink(), true, sourceOrder("<OrderId></OrderId>").getBytes(UTF_8), openClose);

    assertThat(tracedOnce(selfClosed, "a1")).containsExactly(List.of(""));
    assertThat(tracedOnce(openClose, "a1")).containsExactly(List.of(""));
    // "" is a value, so the field is created, and empty
    String expected = DECLARATION + ROOT_OPEN + "<OrderId/>" + ROOT_CLOSE;
    assertThat(new String(fromSelfClosed, UTF_8)).isEqualTo(expected);
    assertThat(new String(fromOpenClose, UTF_8)).isEqualTo(expected);
  }

  @Test
  void whitespaceInsideAValueIsCopied() throws Exception {
    // indentation between elements is no value; inside a leaf every character is, with
    // references and CDATA resolved, and a CR from &#13; kept (an input CR the parser normalises)
    String input =
        "<s:Order xmlns:s=\""
            + NS
            + "\">\n  <OrderId>  PO\t4711 \n x&amp;y<![CDATA[ <z> ]]>&#13; </OrderId>\n</s:Order>\n";

    String out = run(orderIdLink(), input);

    assertThat(out)
        .isEqualTo(
            DECLARATION
                + ROOT_OPEN
                + "<OrderId>  PO\t4711 \n x&amp;y &lt;z&gt; &#13; </OrderId>"
                + ROOT_CLOSE);
  }

  // --- tracing (ADR-0006, ADR-0021)

  @Test
  void aTracedCompileReportsEachSourceQueueOnce() throws Exception {
    Tracer tracer = new Tracer();

    run(threeLinks(), true, THREE_LINKS_INPUT.getBytes(UTF_8), tracer);

    assertThat(tracer.values())
        .extracting(Map.Entry::getKey)
        .containsExactlyInAnyOrder(id("a1"), id("a2"), id("a3"));
    assertThat(tracedOnce(tracer, "a1")).containsExactly(List.of("1"));
    assertThat(tracedOnce(tracer, "a2")).containsExactly(List.of("x", "y"));
    assertThat(tracedOnce(tracer, "a3")).containsExactly(List.of("1"));
  }

  @Test
  void anUntracedCompileNeverCallsTheTracer() throws Exception {
    Tracer untraced = new Tracer();
    Tracer witness = new Tracer();

    run(threeLinks(), false, THREE_LINKS_INPUT.getBytes(UTF_8), untraced);
    run(threeLinks(), true, THREE_LINKS_INPUT.getBytes(UTF_8), witness);

    assertThat(untraced.values()).isEmpty();
    // the same mapping and input do report when traced, so the silence is the untraced compile's
    assertThat(witness.values()).hasSize(3);
  }

  @Test
  void tracedAndUntracedWriteIdenticalBytes() throws Exception {
    byte[] input = THREE_LINKS_INPUT.getBytes(UTF_8);

    byte[] untraced = run(threeLinks(), false, input, new Tracer());
    byte[] traced = run(threeLinks(), true, input, new Tracer());

    assertThat(traced).isEqualTo(untraced);
    assertThat(new String(untraced, UTF_8)).isEqualTo(THREE_LINKS_OUTPUT);
  }

  // --- refused input

  static Stream<Arguments> doctypes() {
    return Stream.of(
        Arguments.of(
            "an internal subset with an entity",
            "<!DOCTYPE s:Order [<!ENTITY id \"boom\">]>" + sourceOrder("<OrderId>&id;</OrderId>")),
        Arguments.of("a bare DOCTYPE", "<!DOCTYPE s:Order>" + sourceOrder("<OrderId>1</OrderId>")));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("doctypes")
  void aDoctypeInTheInputIsRefused(String why, String input) throws Exception {
    assertThatThrownBy(() -> run(orderIdLink(), input)).isInstanceOf(MalformedInputException.class);
    // witness: the same document without the DOCTYPE runs
    assertThat(run(orderIdLink(), sourceOrder("<OrderId>1</OrderId>")))
        .isEqualTo(DECLARATION + ROOT_OPEN + "<OrderId>1</OrderId>" + ROOT_CLOSE);
  }

  static Stream<Arguments> malformed() {
    return Stream.of(
        Arguments.of("no bytes at all", new byte[0]),
        Arguments.of("text, no element", utf8("not xml")),
        Arguments.of(
            "an unclosed root", utf8("<s:Order xmlns:s=\"" + NS + "\"><OrderId>1</OrderId>")),
        Arguments.of("a mismatched end tag", utf8(sourceOrder("<OrderId>1</Quantity>"))),
        Arguments.of("an unbound prefix", utf8("<x:Order><OrderId>1</OrderId></x:Order>")),
        Arguments.of("two roots", utf8(sourceOrder("") + sourceOrder(""))),
        Arguments.of(
            "a duplicate attribute in a field the mapping skips",
            utf8(sourceOrder("<OrderId>1</OrderId><Note a=\"1\" a=\"2\">n</Note>"))),
        Arguments.of("bad UTF-8 in a value", badUtf8()));
  }

  private static byte[] utf8(String text) {
    return text.getBytes(UTF_8);
  }

  /** {@code <OrderId>} holding C3 28, a lead byte without its continuation byte. */
  private static byte[] badUtf8() {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(utf8("<s:Order xmlns:s=\"" + NS + "\"><OrderId>"));
    out.writeBytes(HexFormat.of().parseHex("c328"));
    out.writeBytes(utf8("</OrderId></s:Order>"));
    return out.toByteArray();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("malformed")
  void malformedInputThrowsMalformedInputException(String why, byte[] input) {
    assertThatThrownBy(() -> run(orderIdLink(), false, input, new Tracer()))
        .isInstanceOf(MalformedInputException.class)
        // a checked exception (#26)
        .isNotInstanceOf(RuntimeException.class);
  }

  // --- interruption (ADR-0021)

  @Test
  void anInterruptedRunStops() throws Exception {
    TargetDocument notes = document(leaf("Note", rootLeaf("Note", "a1"), 0, UNBOUNDED, "t1"));
    String input = sourceOrder("<Note>a</Note><Note>b</Note><Note>c</Note>");
    // witness: without the interrupt the same run completes
    assertThat(run(notes, input))
        .isEqualTo(
            DECLARATION + ROOT_OPEN + "<Note>a</Note><Note>b</Note><Note>c</Note>" + ROOT_CLOSE);

    Thread.currentThread().interrupt();
    try {
      // the exception type is open in #26; it is no input error
      assertThatThrownBy(() -> run(notes, input)).isNotInstanceOf(MalformedInputException.class);
    } finally {
      Thread.interrupted();
    }
  }
}
