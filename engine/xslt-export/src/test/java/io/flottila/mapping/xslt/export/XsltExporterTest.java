package io.flottila.mapping.xslt.export;

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
import io.flottila.mapping.ir.TargetRepeat;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * The portable export (ADR-0023, #27 design) at {@code XsltExporter}: unoptimised IR, built by hand
 * as {@code Lowering.lower} gives it, in; one stylesheet that imports the helper module out. The
 * exact text of the field link's stylesheet is the design's; whether a stylesheet runs is the
 * differential oracle's question ({@code engine/oracle}).
 */
class XsltExporterTest {

  private static final String NS = "urn:flottila:corpus:skeleton";
  private static final Name ORDER = new Name(NS, "Order");
  private static final Name ORDER_ID = new Name("", "OrderId");
  private static final long UNBOUNDED = Long.MAX_VALUE;

  /**
   * The variables lowering binds: the root's slot number, and a field's slot number and value at
   * depth 2, directly under the root (ADR-0006 since #52).
   */
  private static final String ROOT = "root";

  private static final String SLOT = "slot2";

  private static final String VALUE = "value2";

  // --- IR, built by hand as lowering gives it (Lowering, ADR-0022)

  private static AuthoringId id(String value) {
    return new AuthoringId(value);
  }

  /** {@code <prefix:target>{value}</prefix:target>} per slot of {@code queue} in the root slot. */
  private static TargetSlots slots(
      SourceQueue queue, long min, long max, String prefix, Name target, String mapping) {
    AuthoringId origin = id(mapping);
    return new TargetSlots(
        queue,
        new VarRef(ROOT, AtomicType.INTEGER, origin),
        min,
        max,
        SLOT,
        VALUE,
        new ElementConstructor(
            prefix,
            target,
            List.of(new TextConstructor(new VarRef(VALUE, AtomicType.STRING, origin), origin)),
            origin),
        origin);
  }

  /** The queue of {@code field} directly under {@code root}, in the root's context. */
  private static SourceQueue underRoot(Name root, Name field, String box) {
    return new SourceQueue(List.of(root, field), 1, id(box));
  }

  /** {@code corpus/mappings/order-id-copy.mapping.json} lowered: OrderId 1..1 into ns0:Order. */
  private static TargetDocument fieldLink(long max) {
    return new TargetDocument(
        "ns0",
        ORDER,
        ROOT,
        List.of(slots(underRoot(ORDER, ORDER_ID, "a1"), 1, max, "", ORDER_ID, "t1")));
  }

  /**
   * The #27 design's stylesheet of the field link: one element per line, two-space indent. Since
   * #52 (ADR-0006) {@code po:slots} gives {@code [slot number, value]} per created occurrence,
   * bound to the slot and value variables, and {@code po:at-least} checks OrderId's min of 1.
   */
  private static final String FIELD_LINK_STYLESHEET =
      """
      <?xml version="1.0" encoding="UTF-8"?>
      <xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" \
      xmlns:xs="http://www.w3.org/2001/XMLSchema" \
      xmlns:array="http://www.w3.org/2005/xpath-functions/array" \
      xmlns:po="urn:flottila:mapping:po" xmlns:s0="urn:flottila:corpus:skeleton" \
      xmlns:ns0="urn:flottila:corpus:skeleton" exclude-result-prefixes="#all">
        <xsl:import href="po-runtime.xsl"/>
        <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no" \
      omit-xml-declaration="no"/>
        <xsl:template match="/">
          <xsl:variable name="root" as="xs:integer" select="1"/>
          <ns0:Order>
            <xsl:for-each \
      select="po:at-least(po:slots(po:source-queue(array:join(/s0:Order ! [OrderId ! string()])), $root, 1), 1, 't1')">
              <xsl:variable name="slot2" as="xs:integer" select="?1"/>
              <xsl:variable name="value2" as="xs:string" select="?2"/>
              <OrderId><xsl:value-of select="$value2"/></OrderId>
            </xsl:for-each>
          </ns0:Order>
        </xsl:template>
      </xsl:stylesheet>
      """;

  @Test
  void theFieldLinkExportsToTheDocumentedShape() {
    assertThat(XsltExporter.export(fieldLink(1))).isEqualTo(FIELD_LINK_STYLESHEET);
  }

  /** The start tag of the {@code xsl:stylesheet} element. */
  private static String stylesheetStartTag(String stylesheet) {
    int start = stylesheet.indexOf("<xsl:stylesheet ");
    assertThat(start).as("start of xsl:stylesheet").isNotNegative();
    return stylesheet.substring(start, stylesheet.indexOf('>', start) + 1);
  }

  private static int occurrences(String text, String part) {
    int count = 0;
    for (int at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + 1)) {
      count++;
    }
    return count;
  }

  /**
   * A root without a namespace, so {@code ns0} goes to the first namespace in target field order
   * (ADR-0022); two output and two source namespaces, each used twice, and URIs that hold {@code
   * &}, {@code "} and {@code <}.
   */
  @Test
  void namespacesAreDeclaredOnceOnTheStylesheetAndEscaped() {
    String a = "urn:flottila:a&b";
    String c = "urn:flottila:c\"<d";
    Name sourceRoot = new Name(a, "Order");
    TargetDocument document =
        new TargetDocument(
            "",
            new Name("", "Order"),
            ROOT,
            List.of(
                slots(
                    underRoot(sourceRoot, new Name(a, "Item"), "a1"),
                    0,
                    UNBOUNDED,
                    "ns0",
                    new Name(a, "Item"),
                    "t1"),
                slots(
                    underRoot(sourceRoot, new Name(c, "Note"), "a2"),
                    0,
                    UNBOUNDED,
                    "ns1",
                    new Name(c, "Note"),
                    "t2"),
                slots(
                    underRoot(sourceRoot, new Name(c, "Note"), "a3"),
                    0,
                    1,
                    "ns1",
                    new Name(c, "Remark"),
                    "t3"),
                slots(
                    underRoot(sourceRoot, new Name("", "Plain"), "a4"),
                    0,
                    1,
                    "ns0",
                    new Name(a, "Again"),
                    "t4")));

    String stylesheet = XsltExporter.export(document);
    String startTag = stylesheetStartTag(stylesheet);

    assertThat(startTag)
        .contains(" xmlns:ns0=\"urn:flottila:a&amp;b\"")
        .contains(" xmlns:ns1=\"urn:flottila:c&quot;&lt;d\"")
        .contains(" xmlns:s0=\"urn:flottila:a&amp;b\"")
        .contains(" xmlns:s1=\"urn:flottila:c&quot;&lt;d\"")
        .contains(" exclude-result-prefixes=\"#all\"");
    for (String prefix : List.of("ns0", "ns1", "s0", "s1")) {
      assertThat(occurrences(stylesheet, " xmlns:" + prefix + "="))
          .as("declarations of %s", prefix)
          .isEqualTo(1);
    }
    assertThat(stylesheet)
        .doesNotContain("xmlns:ns2=", "xmlns:s2=", "xmlns=", "xpath-default-namespace")
        .doesNotContain(c, a);
    // the root without a namespace stays bare; the IR's prefixes name the other elements
    assertThat(stylesheet)
        .contains("<Order>", "</Order>", "<ns0:Item>", "<ns1:Note>", "<ns1:Remark>", "<ns0:Again>")
        // source names in walk order; a step without a namespace stays bare
        .contains(
            "po:source-queue(array:join(/s0:Order ! [s0:Item ! string()]))",
            "po:source-queue(array:join(/s0:Order ! [s1:Note ! string()]))",
            "po:source-queue(array:join(/s0:Order ! [Plain ! string()]))");
  }

  @Test
  void anUnboundedMaxIsTheEmptySequence() {
    String unbounded = XsltExporter.export(fieldLink(UNBOUNDED));
    String three = XsltExporter.export(fieldLink(3));

    assertThat(unbounded)
        .contains(
            "<xsl:for-each select=\"po:at-least(po:slots(po:source-queue(array:join(/s0:Order ! [OrderId !"
                + " string()])), $root, ()), 1, 't1')\">")
        .doesNotContain(Long.toString(UNBOUNDED));
    // witness: a bounded max is written as its number
    assertThat(three)
        .contains(
            "<xsl:for-each select=\"po:at-least(po:slots(po:source-queue(array:join(/s0:Order ! [OrderId !"
                + " string()])), $root, 3), 1, 't1')\">");
  }

  /** {@code OrderId <- OrderId} at {@code min..max}. */
  private static TargetDocument fieldLink(long min, long max) {
    return new TargetDocument(
        "ns0",
        ORDER,
        ROOT,
        List.of(slots(underRoot(ORDER, ORDER_ID, "a1"), min, max, "", ORDER_ID, "t1")));
  }

  /**
   * ADR-0006 since #52: the export of TargetSlots is {@code po:at-least(po:slots(queue, p, max),
   * min, mapping)}, and {@code po:at-least} is written only when min is above 0. The helper module
   * holds both functions, po:slots with its queue, parent slot and max, po:at-least with the slots,
   * the min and the id of the target field mapping, which its error names.
   */
  @Test
  void minAboveZeroWrapsPoAtLeast() {
    String slots =
        "po:slots(po:source-queue(array:join(/s0:Order ! [OrderId ! string()])), $root, 3)";

    assertThat(XsltExporter.export(fieldLink(0, 3)))
        .contains("<xsl:for-each select=\"" + slots + "\">")
        .doesNotContain("po:at-least");
    assertThat(XsltExporter.export(fieldLink(1, 3)))
        .contains("<xsl:for-each select=\"po:at-least(" + slots + ", 1, 't1')\">");
    assertThat(XsltExporter.export(fieldLink(2, 3)))
        .contains("<xsl:for-each select=\"po:at-least(" + slots + ", 2, 't1')\">");
    assertThat(helperParams("po:slots")).isEqualTo(3);
    assertThat(helperParams("po:at-least")).isEqualTo(3);
  }

  /** The field link with {@code Note} in {@code namespace} under {@code prefix} added. */
  private static TargetDocument withNote(String prefix, String namespace) {
    return new TargetDocument(
        "ns0",
        ORDER,
        ROOT,
        List.of(
            slots(underRoot(ORDER, ORDER_ID, "a1"), 1, 1, "", ORDER_ID, "t1"),
            slots(
                underRoot(ORDER, new Name("", "Note"), "a2"),
                0,
                UNBOUNDED,
                prefix,
                new Name(namespace, "Note"),
                "t2")));
  }

  @Test
  void anIrItCannotWriteIsACompilerBug() {
    TargetDocument rootUnderNoPrefix = new TargetDocument("", ORDER, ROOT, fieldLink(1).content());

    assertThatThrownBy(() -> XsltExporter.export(withNote("", "urn:flottila:other")))
        .as("a namespace under prefix \"\"")
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> XsltExporter.export(rootUnderNoPrefix))
        .as("the root's namespace under prefix \"\"")
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> XsltExporter.export(withNote("ns0", "urn:flottila:other")))
        .as("ns0 bound to the root's namespace and to another")
        .isInstanceOf(IllegalArgumentException.class);
    // xmlns:ns1="" is no declaration XML 1.0 allows, and a bare Note would be the right name
    assertThatThrownBy(() -> XsltExporter.export(withNote("ns1", "")))
        .as("a prefix without a namespace")
        .isInstanceOf(IllegalArgumentException.class);
    // witness: the same IR with the namespace under a prefix of its own exports
    assertThat(XsltExporter.export(withNote("ns1", "urn:flottila:other")))
        .contains("xmlns:ns1=\"urn:flottila:other\"", "<ns1:Note>");
  }

  /** The field link with {@code queue} and {@code content} as its target field's queue and body. */
  private static TargetDocument fieldLinkWith(Expr queue, List<Expr> content) {
    AuthoringId t1 = id("t1");
    return new TargetDocument(
        "ns0",
        ORDER,
        ROOT,
        List.of(
            new TargetSlots(
                queue,
                new VarRef(ROOT, AtomicType.INTEGER, t1),
                1,
                1,
                SLOT,
                VALUE,
                new ElementConstructor("", ORDER_ID, content, t1),
                t1)));
  }

  private static TextConstructor valueText() {
    return new TextConstructor(new VarRef(VALUE, AtomicType.STRING, id("t1")), id("t1"));
  }

  /**
   * The verifier checks scopes, not places (IrVerifier), so the exporter meets these. Each IR is
   * the field link with one node, whose origin is {@code x9}, where the IR's shape has no place for
   * it.
   */
  static Stream<Arguments> misplacedNodes() {
    SourceQueue queue = underRoot(ORDER, ORDER_ID, "a1");
    AuthoringId x9 = id("x9");
    return Stream.of(
        Arguments.of(
            "a SourceQueue as an element's content",
            fieldLinkWith(queue, List.of(new SourceQueue(List.of(ORDER, ORDER_ID), 1, x9)))),
        Arguments.of(
            "a VarRef as an element's content",
            fieldLinkWith(queue, List.of(new VarRef(VALUE, AtomicType.STRING, x9)))),
        Arguments.of(
            "a TextConstructor as a queue",
            fieldLinkWith(new TextConstructor(queue, x9), List.of(valueText()))),
        Arguments.of(
            "an ElementConstructor as a queue",
            fieldLinkWith(
                new ElementConstructor("", ORDER_ID, List.of(), x9), List.of(valueText()))),
        Arguments.of(
            "a TargetSlots as a text's value",
            fieldLinkWith(
                queue,
                List.of(
                    new TextConstructor(
                        slots(underRoot(ORDER, ORDER_ID, "a2"), 0, 1, "", ORDER_ID, "x9"),
                        id("t1"))))),
        Arguments.of(
            "a TargetRepeat as a text's value",
            fieldLinkWith(
                queue,
                List.of(
                    new TextConstructor(
                        new TargetRepeat(
                            1,
                            new VarRef(ROOT, AtomicType.INTEGER, x9),
                            "slot3",
                            new ElementConstructor("", ORDER_ID, List.of(), x9),
                            x9),
                        id("t1"))))));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("misplacedNodes")
  void aNodeWhereTheIrHasNoPlaceForItIsACompilerBug(String why, TargetDocument document) {
    assertThatThrownBy(() -> XsltExporter.export(document))
        .as(why)
        .isInstanceOf(IllegalArgumentException.class)
        // the message names the node's origin
        .hasMessageContaining("x9");
  }

  /**
   * A {@code TargetSlots} inside a mapped field's element, as lowering gives it since #52: each
   * level is two spaces deeper, one element per line (#27 design), the inner queue's context is
   * {@code Item}, and the inner field reads Item's slot number {@code $slot2} as its parent's. The
   * inner queue is bound once at the top of the template, where the focus is the source document,
   * and the inner {@code xsl:for-each} reads it by name: each back end evaluates a queue at most
   * once per mapping run (ADR-0006 since #52).
   */
  @Test
  void aTargetFieldInsideAnElementIsWrittenOneLevelDeeper() {
    Name item = new Name("", "Item");
    Name name = new Name("", "Name");
    AuthoringId t1 = id("t1");
    AuthoringId t2 = id("t2");
    TargetSlots names =
        new TargetSlots(
            new SourceQueue(List.of(ORDER, item, name), 2, id("a2")),
            new VarRef(SLOT, AtomicType.INTEGER, t2),
            0,
            1,
            "slot3",
            "value3",
            new ElementConstructor(
                "",
                name,
                List.of(new TextConstructor(new VarRef("value3", AtomicType.STRING, t2), t2)),
                t2),
            t2);
    TargetDocument document =
        new TargetDocument(
            "ns0",
            ORDER,
            ROOT,
            List.of(
                new TargetSlots(
                    underRoot(ORDER, item, "a1"),
                    new VarRef(ROOT, AtomicType.INTEGER, t1),
                    0,
                    UNBOUNDED,
                    SLOT,
                    VALUE,
                    new ElementConstructor("", item, List.of(names), t1),
                    t1)));
    IrVerifier.verify(document);

    assertThat(XsltExporter.export(document))
        .isEqualTo(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" \
            xmlns:xs="http://www.w3.org/2001/XMLSchema" \
            xmlns:array="http://www.w3.org/2005/xpath-functions/array" \
            xmlns:po="urn:flottila:mapping:po" xmlns:s0="urn:flottila:corpus:skeleton" \
            xmlns:ns0="urn:flottila:corpus:skeleton" exclude-result-prefixes="#all">
              <xsl:import href="po-runtime.xsl"/>
              <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no" \
            omit-xml-declaration="no"/>
              <xsl:template match="/">
                <xsl:variable name="root" as="xs:integer" select="1"/>
                <xsl:variable name="po:queue1" as="array(item()*)" \
            select="po:source-queue(array:join(/s0:Order/Item ! [Name ! string()]))"/>
                <ns0:Order>
                  <xsl:for-each \
            select="po:slots(po:source-queue(array:join(/s0:Order ! [Item ! string()])), $root, ())">
                    <xsl:variable name="slot2" as="xs:integer" select="?1"/>
                    <xsl:variable name="value2" as="xs:string" select="?2"/>
                    <Item>
                      <xsl:for-each select="po:slots($po:queue1, $slot2, 1)">
                        <xsl:variable name="slot3" as="xs:integer" select="?1"/>
                        <xsl:variable name="value3" as="xs:string" select="?2"/>
                        <Name><xsl:value-of select="$value3"/></Name>
                      </xsl:for-each>
                    </Item>
                  </xsl:for-each>
                </ns0:Order>
              </xsl:template>
            </xsl:stylesheet>
            """);
  }

  /**
   * {@code TargetSlots} of {@code queue} under the parent slot {@code parentSlot}, unbounded,
   * binding {@code slot<depth>} and {@code value<depth>}, with {@code content} in its element.
   */
  private static TargetSlots nested(
      SourceQueue queue, String parentSlot, int depth, Name element, List<Expr> content) {
    AuthoringId origin = id("t" + depth);
    return new TargetSlots(
        queue,
        new VarRef(parentSlot, AtomicType.INTEGER, origin),
        0,
        UNBOUNDED,
        "slot" + depth,
        "value" + depth,
        new ElementConstructor("", element, content, origin),
        origin);
  }

  /**
   * Each back end evaluates a {@code TargetSlots} queue at most once per mapping run (ADR-0006
   * since #52), and an {@code xsl:for-each} evaluates its select once per occurrence of its parent:
   * no queue is written inside an occurrence, at any depth. Each queue inside one is bound once at
   * the top of the template, in IR walk order, and read there by name.
   */
  @Test
  void noQueueIsWrittenInsideAnOccurrence() {
    Name item = new Name("", "Item");
    Name line = new Name("", "Line");
    Name sku = new Name("", "Sku");
    TargetSlots skus =
        nested(
            new SourceQueue(List.of(ORDER, item, line, sku), 3, id("a3")),
            "slot3",
            4,
            sku,
            List.of(
                new TextConstructor(new VarRef("value4", AtomicType.STRING, id("t4")), id("t4"))));
    TargetSlots lines =
        nested(
            new SourceQueue(List.of(ORDER, item, line), 2, id("a2")), SLOT, 3, line, List.of(skus));
    TargetDocument document =
        new TargetDocument(
            "ns0",
            ORDER,
            ROOT,
            List.of(nested(underRoot(ORDER, item, "a1"), ROOT, 2, item, List.of(lines))));
    IrVerifier.verify(document);

    String stylesheet = XsltExporter.export(document);

    String root = "<ns0:Order>";
    assertThat(stylesheet.substring(0, stylesheet.indexOf(root) + root.length()))
        .as("the top of the template")
        .contains(
            "<xsl:variable name=\"po:queue1\" as=\"array(item()*)\""
                + " select=\"po:source-queue(array:join(/s0:Order/Item ! [Line ! string()]))\"/>\n"
                + "    <xsl:variable name=\"po:queue2\" as=\"array(item()*)\""
                + " select=\"po:source-queue(array:join(/s0:Order/Item/Line ! [Sku ! string()]))\"/>\n"
                + "    "
                + root);
    // everything after Item's slot-number variable stands inside Item's occurrences
    String inside = stylesheet.substring(stylesheet.indexOf("select=\"?1\""));
    assertThat(inside)
        .as("inside an occurrence")
        .doesNotContain("array:join")
        .contains(
            "<xsl:for-each select=\"po:slots($po:queue1, $slot2, ())\">",
            "<xsl:for-each select=\"po:slots($po:queue2, $slot3, ())\">");
  }

  /**
   * A {@code TargetRepeat} under the root, as lowering gives an unmapped {@code Pair} of 2..2 since
   * #63: an {@code xsl:for-each} over {@code 1 to 2} that binds its slot-number variable to {@code
   * ($root - 1) * 2 + .}, the j-th copy under parent slot p (ADR-0006). Inside it stands an
   * occurrence, so the queue of the {@code TargetSlots} below is bound at the top of the template.
   * That queue is of the structure field {@code Item}: one {@code ''} per occurrence (ADR-0008).
   */
  @Test
  void aTargetRepeatIsAForEachOverItsCopiesNumberedAcrossItsParentsSlots() {
    Name pair = new Name("", "Pair");
    Name item = new Name("", "Item");
    AuthoringId origin = id("/Order/Pair");
    TargetSlots items =
        nested(new SourceQueue(List.of(ORDER, item), 1, true, id("a1")), SLOT, 3, item, List.of());
    TargetDocument document =
        new TargetDocument(
            "ns0",
            ORDER,
            ROOT,
            List.of(
                new TargetRepeat(
                    2,
                    new VarRef(ROOT, AtomicType.INTEGER, origin),
                    SLOT,
                    new ElementConstructor("", pair, List.of(items), origin),
                    origin)));
    IrVerifier.verify(document);

    String stylesheet = XsltExporter.export(document);

    assertThat(stylesheet)
        .contains(
            "<xsl:variable name=\"po:queue1\" as=\"array(item()*)\""
                + " select=\"po:source-queue(array:join(/s0:Order ! [Item ! '']))\"/>\n"
                + "    <ns0:Order>\n"
                + "      <xsl:for-each select=\"1 to 2\">\n"
                + "        <xsl:variable name=\"slot2\" as=\"xs:integer\""
                + " select=\"($root - 1) * 2 + .\"/>\n"
                + "        <Pair>\n"
                + "          <xsl:for-each select=\"po:slots($po:queue1, $slot2, ())\">")
        // the copies' xsl:for-each ends after Pair, on a line of its own
        .contains("        </Pair>\n      </xsl:for-each>\n    </ns0:Order>\n");
  }

  /**
   * IrVerifier accepts an element without content, which spec 1's lowering does not give yet: like
   * any content but a single text, its end tag stands on a line of its own (#27 design, #49).
   */
  @Test
  void anElementWithoutContentEndsOnALineOfItsOwn() {
    TargetDocument document = fieldLinkWith(underRoot(ORDER, ORDER_ID, "a1"), List.of());
    IrVerifier.verify(document);

    assertThat(XsltExporter.export(document))
        .isEqualTo(
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" \
            xmlns:xs="http://www.w3.org/2001/XMLSchema" \
            xmlns:array="http://www.w3.org/2005/xpath-functions/array" \
            xmlns:po="urn:flottila:mapping:po" xmlns:s0="urn:flottila:corpus:skeleton" \
            xmlns:ns0="urn:flottila:corpus:skeleton" exclude-result-prefixes="#all">
              <xsl:import href="po-runtime.xsl"/>
              <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no" \
            omit-xml-declaration="no"/>
              <xsl:template match="/">
                <xsl:variable name="root" as="xs:integer" select="1"/>
                <ns0:Order>
                  <xsl:for-each \
            select="po:at-least(po:slots(po:source-queue(array:join(/s0:Order ! [OrderId ! string()])), $root, 1), 1, 't1')">
                    <xsl:variable name="slot2" as="xs:integer" select="?1"/>
                    <xsl:variable name="value2" as="xs:string" select="?2"/>
                    <OrderId>
                    </OrderId>
                  </xsl:for-each>
                </ns0:Order>
              </xsl:template>
            </xsl:stylesheet>
            """);
  }

  @Test
  void theHelperModuleIsTheModulesResource() throws Exception {
    String resource;
    try (InputStream in = XsltExporter.class.getResourceAsStream("po-runtime.xsl")) {
      assertThat(in).as("resource io/flottila/mapping/xslt/export/po-runtime.xsl").isNotNull();
      resource = new String(in.readAllBytes(), UTF_8);
    }

    assertThat(XsltExporter.HELPER_MODULE).isEqualTo("po-runtime.xsl");
    assertThat(XsltExporter.helperModule()).isEqualTo(resource);
    // spec 1's helper holds po:slots in the po namespace (ADR-0023)
    assertThat(resource)
        .contains("xmlns:po=\"urn:flottila:mapping:po\"")
        .contains("<xsl:function ")
        .contains("name=\"po:slots\"");
  }

  // --- function calls (#50, ADR-0025): a FunCall is po:<catalogue name>(args…), its args in
  // FunCall order, the inputs and then every param as a Literal; the back ends bind by name only

  private static final QueueType QUEUE = new QueueType();

  private static FunCall removeContexts(Expr queue, String box) {
    return new FunCall(
        new FunctionRef("removeContexts", List.of(QUEUE), QUEUE), List.of(queue), id(box));
  }

  /** The number of {@code xsl:param} of the helper module's {@code xsl:function} {@code name}. */
  private static int helperParams(String name) {
    String helper = XsltExporter.helperModule();
    int at = helper.indexOf("name=\"" + name + "\"");
    assertThat(at).as("%s in the helper module", name).isNotNegative();
    assertThat(helper.substring(helper.lastIndexOf('<', at)))
        .as("the element named %s", name)
        .startsWith("<xsl:function ");
    int end = helper.indexOf("</xsl:function>", at);
    assertThat(end).as("the end of %s", name).isGreaterThan(at);
    return occurrences(helper.substring(at, end), "<xsl:param ");
  }

  @Test
  void aFunCallIsItsPoFunction() {
    SourceQueue orderIds = underRoot(ORDER, ORDER_ID, "a1");
    String queue = "po:source-queue(array:join(/s0:Order ! [OrderId ! string()]))";
    String once = "po:slots(po:removeContexts(" + queue + "), $root, 1)";
    String nested = "po:slots(po:removeContexts(po:removeContexts(" + queue + ")), $root, 1)";
    String fieldLink = "po:slots(" + queue + ", $root, 1)";
    assertThat(FIELD_LINK_STYLESHEET).as("the field link's call").contains(fieldLink);

    // the field link's stylesheet with the call around its queue, and nothing else changed
    assertThat(
            XsltExporter.export(
                fieldLinkWith(removeContexts(orderIds, "r1"), List.of(valueText()))))
        .isEqualTo(FIELD_LINK_STYLESHEET.replace(fieldLink, once));
    // an argument is any queue expression, a call included
    assertThat(
            XsltExporter.export(
                fieldLinkWith(
                    removeContexts(removeContexts(orderIds, "r1"), "r2"), List.of(valueText()))))
        .contains("<xsl:for-each select=\"po:at-least(" + nested + ", 1, 't1')\">");
    // the helper module holds the function, with one parameter per argument
    assertThat(helperParams("po:removeContexts")).isEqualTo(1);
  }

  /**
   * The raw value of the first {@code xsl:for-each}'s {@code select}, as written between quotes.
   */
  private static String forEachSelect(String stylesheet) {
    String start = "<xsl:for-each select=\"";
    int at = stylesheet.indexOf(start);
    assertThat(at).as("an xsl:for-each with a select").isNotNegative();
    int from = at + start.length();
    return stylesheet.substring(from, stylesheet.indexOf('"', from));
  }

  /**
   * The value an XML 1.0 parser gives for an attribute value written as {@code raw} in double
   * quotes: line ends normalised (§2.11), then references resolved and every literal white-space
   * character made a space (§3.3.3). A raw {@code <} or an {@code &} that starts no reference is no
   * well-formed XML.
   */
  private static String attributeValue(String raw) {
    String text = raw.replace("\r\n", "\n").replace('\r', '\n');
    StringBuilder value = new StringBuilder();
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      assertThat(c).as("a raw < in the attribute %s", raw).isNotEqualTo('<');
      if (c == '&') {
        int semicolon = text.indexOf(';', i);
        assertThat(semicolon).as("a reference at %d of %s", i, raw).isGreaterThan(i + 1);
        String name = text.substring(i + 1, semicolon);
        if (name.startsWith("#x")) {
          value.appendCodePoint(Integer.parseInt(name.substring(2), 16));
        } else if (name.startsWith("#")) {
          value.appendCodePoint(Integer.parseInt(name.substring(1)));
        } else {
          String entity =
              switch (name) {
                case "amp" -> "&";
                case "lt" -> "<";
                case "gt" -> ">";
                case "quot" -> "\"";
                case "apos" -> "'";
                default ->
                    throw new AssertionError("no predefined entity &" + name + "; in " + raw);
              };
          value.append(entity);
        }
        i = semicolon;
      } else if (c == ' ' || c == '\t' || c == '\n') {
        value.append(' ');
      } else {
        value.append(c);
      }
    }
    return value.toString();
  }

  /**
   * An XPath 3.1 StringLiteral starting at {@code at}: in apostrophes or quotation marks, where the
   * delimiter doubled stands for itself; its value and the index after it.
   */
  private record StringLiteral(String value, int end) {

    static StringLiteral at(String expression, int at) {
      char delimiter = expression.charAt(at);
      assertThat(delimiter).as("a string literal at %d of %s", at, expression).isIn('\'', '"');
      StringBuilder value = new StringBuilder();
      int i = at + 1;
      while (true) {
        assertThat(i)
            .as("the end of the literal in %s", expression)
            .isLessThan(expression.length());
        char c = expression.charAt(i);
        if (c == delimiter
            && i + 1 < expression.length()
            && expression.charAt(i + 1) == delimiter) {
          value.append(delimiter);
          i += 2;
        } else if (c == delimiter) {
          return new StringLiteral(value.toString(), i + 1);
        } else {
          value.append(c);
          i++;
        }
      }
    }
  }

  static Stream<Arguments> literals() {
    return Stream.of(
        Arguments.of("the empty string", ""),
        Arguments.of("plain text", "each value"),
        Arguments.of("an apostrophe", "it's"),
        Arguments.of("quotation marks", "say \"hi\""),
        Arguments.of("both delimiters, doubled", "'\"''\"\""),
        Arguments.of("markup characters", "a&b<c>d&amp;"),
        Arguments.of("a tab, a line feed and a carriage return", "a\tb\nc\rd"),
        Arguments.of("a CR LF pair and leading and trailing spaces", " a\r\nb "),
        Arguments.of("braces, which select never treats as a template", "{x}"),
        Arguments.of("non-ASCII and a character outside the BMP", "Grüße 😀"));
  }

  /**
   * A box parameter is a {@code Literal} argument. Read back as an XML parser and then an XPath
   * parser read it, the literal is the parameter's value, whatever characters it holds; how it is
   * quoted and escaped is the exporter's choice. The function name stands for any context function
   * with a parameter: the exporter binds by name only.
   */
  @ParameterizedTest(name = "{0}")
  @MethodSource("literals")
  void aLiteralIsQuotedAndEscaped(String why, String value) {
    FunCall split =
        new FunCall(
            new FunctionRef("splitByValue", List.of(QUEUE, AtomicType.STRING), QUEUE),
            List.of(underRoot(ORDER, ORDER_ID, "a1"), new Literal(value, id("s1"))),
            id("s1"));
    String call =
        "po:at-least(po:slots(po:splitByValue(po:source-queue(array:join(/s0:Order ! [OrderId ! string()]))";

    String select =
        attributeValue(
            forEachSelect(XsltExporter.export(fieldLinkWith(split, List.of(valueText())))));

    assertThat(select).startsWith(call);
    int comma = select.indexOf(',', call.length());
    assertThat(select.substring(call.length(), comma)).as("before the second argument").isBlank();
    int start = comma + 1;
    while (select.charAt(start) == ' ') {
      start++;
    }
    StringLiteral literal = StringLiteral.at(select, start);
    assertThat(literal.value()).isEqualTo(value);
    assertThat(select.substring(literal.end()))
        .matches(" *\\) *, *\\$root *, *1 *\\) *, *1 *, *'t1' *\\)");
  }

  // --- the helper module's sources (ADR-0025 "Families", F-15): core.xsl and one module per
  // function family, which the build joins into po-runtime.xsl, core first, then the families by
  // id; ADR-0023's one-file export is unchanged

  private static final String HELPER_SOURCES = "engine/xslt-export/src/main/xsl/po-runtime";

  private static final String CORE = "core.xsl";

  /** The packed helper module of main at 9c6fd1a, before the split, copied byte for byte. */
  private static final String MAIN_HELPER_MODULE =
      "engine/xslt-export/src/test/resources/main-9c6fd1a/po-runtime.xsl";

  /** Surefire runs in the module directory: the root is the nearest ancestor holding mvnw. */
  private static Path repoRoot() {
    for (Path p = Path.of("").toAbsolutePath(); p != null; p = p.getParent()) {
      if (Files.isRegularFile(p.resolve("mvnw")) && Files.isDirectory(p.resolve("contract"))) {
        return p;
      }
    }
    throw new IllegalStateException("no repository root above " + Path.of("").toAbsolutePath());
  }

  private static final Pattern FUNCTION_NAME =
      Pattern.compile("<xsl:function\\s[^>]*?\\bname=\"([^\"]*)\"");

  /** The names of the {@code xsl:function} elements of {@code stylesheet}, in document order. */
  private static List<String> functionNames(String stylesheet) {
    List<String> names = new ArrayList<>();
    Matcher function = FUNCTION_NAME.matcher(stylesheet);
    while (function.find()) {
      names.add(function.group(1));
    }
    return names;
  }

  @Test
  void theHelperModuleIsCoreThenItsFamilyModules() throws Exception {
    // witness: a function's name is read whatever attribute comes first
    assertThat(
            functionNames(
                "<xsl:function name=\"po:a\" as=\"xs:string\"/><xsl:function as=\"item()\""
                    + " name=\"po:b\"/><xsl:variable name=\"po:c\"/>"))
        .containsExactly("po:a", "po:b");

    Path dir = repoRoot().resolve(HELPER_SOURCES);
    assertThat(dir).as("the helper module's sources").isDirectory();
    String core = Files.readString(dir.resolve(CORE), UTF_8);
    SortedMap<String, String> families = new TreeMap<>();
    List<Path> modules;
    try (Stream<Path> listing = Files.list(dir)) {
      modules = listing.filter(p -> p.getFileName().toString().endsWith(".xsl")).toList();
    }
    for (Path module : modules) {
      String name = module.getFileName().toString();
      if (!name.equals(CORE)) {
        families.put(
            name.substring(0, name.length() - ".xsl".length()), Files.readString(module, UTF_8));
      }
    }
    // core holds SUPPRESS, source-queue, slots, at-least and lift; today's eleven functions form
    // the family context (ADR-0025)
    assertThat(core).contains("<xsl:variable name=\"po:SUPPRESS\"");
    assertThat(functionNames(core))
        .contains("po:source-queue", "po:slots", "po:at-least", "po:lift");
    assertThat(families).as("the family modules beside %s", CORE).containsKey("context");
    assertThat(functionNames(families.get("context")))
        .contains("po:removeContexts", "po:replaceValue");

    // every module carries core's root start tag, byte for byte
    String coreTag = stylesheetStartTag(core);
    assertThat(coreTag).contains("xmlns:po=\"urn:flottila:mapping:po\"");
    families.forEach(
        (family, module) ->
            assertThat(stylesheetStartTag(module))
                .as("the root start tag of %s.xsl", family)
                .isEqualTo(coreTag));

    // core's functions, then each family's, the families by id, each declared once
    List<String> expected = new ArrayList<>(functionNames(core));
    families.values().forEach(module -> expected.addAll(functionNames(module)));
    assertThat(expected).as("the functions the modules declare").doesNotHaveDuplicates();
    String packed = XsltExporter.helperModule();

    assertThat(functionNames(packed))
        .as("the packed helper module's functions")
        .containsExactlyElementsOf(expected);
    // one root, core's, and core's prolog up to it begins the packed module
    assertThat(occurrences(packed, coreTag))
        .as("core's root start tag in the packed module")
        .isEqualTo(1);
    assertThat(packed).startsWith(core.substring(0, core.indexOf(coreTag) + coreTag.length()));
  }

  /** The split changes no byte of the helper module (ADR-0025 "Families", ADR-0023). */
  @Test
  void thePackedHelperModuleIsMainsByteForByte() throws Exception {
    byte[] main = Files.readAllBytes(repoRoot().resolve(MAIN_HELPER_MODULE));
    // witness: main's copy is the helper module of spec 2, with po:useOneAsMany
    assertThat(functionNames(new String(main, UTF_8))).contains("po:slots", "po:useOneAsMany");
    byte[] packed;
    try (InputStream in = XsltExporter.class.getResourceAsStream(XsltExporter.HELPER_MODULE)) {
      assertThat(in).as("resource io/flottila/mapping/xslt/export/po-runtime.xsl").isNotNull();
      packed = in.readAllBytes();
    }

    assertThat(new String(packed, UTF_8)).isEqualTo(new String(main, UTF_8));
    assertThat(packed).isEqualTo(main);
    assertThat(XsltExporter.helperModule().getBytes(UTF_8)).isEqualTo(main);
  }
}
