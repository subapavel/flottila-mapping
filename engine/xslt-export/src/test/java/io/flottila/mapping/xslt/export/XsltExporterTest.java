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
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.io.InputStream;
import java.util.List;
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

  /** The variables lowering binds: the root's slot number and a slot's value. */
  private static final String ROOT = "root";

  private static final String VALUE = "value";

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

  /** The #27 design's stylesheet of the field link: one element per line, two-space indent. */
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
      select="po:slots(array:join(/s0:Order ! [OrderId ! string()]), $root, 1)">
              <xsl:variable name="value" as="xs:string" select="."/>
              <OrderId><xsl:value-of select="$value"/></OrderId>
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
            "array:join(/s0:Order ! [s0:Item ! string()])",
            "array:join(/s0:Order ! [s1:Note ! string()])",
            "array:join(/s0:Order ! [Plain ! string()])");
  }

  @Test
  void anUnboundedMaxIsTheEmptySequence() {
    String unbounded = XsltExporter.export(fieldLink(UNBOUNDED));
    String three = XsltExporter.export(fieldLink(3));

    assertThat(unbounded)
        .contains(
            "<xsl:for-each select=\"po:slots(array:join(/s0:Order ! [OrderId ! string()]),"
                + " $root, ())\">")
        .doesNotContain(Long.toString(UNBOUNDED));
    // witness: a bounded max is written as its number
    assertThat(three)
        .contains(
            "<xsl:for-each select=\"po:slots(array:join(/s0:Order ! [OrderId ! string()]),"
                + " $root, 3)\">");
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
   * IrVerifier accepts a {@code TargetSlots} inside an element, which spec 1's lowering does not
   * give yet: each level is two spaces deeper, one element per line (#27 design), and the inner
   * queue's context is {@code Item}.
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
            new VarRef(ROOT, AtomicType.INTEGER, t2),
            0,
            1,
            "name",
            new ElementConstructor(
                "",
                name,
                List.of(new TextConstructor(new VarRef("name", AtomicType.STRING, t2), t2)),
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
                <ns0:Order>
                  <xsl:for-each \
            select="po:slots(array:join(/s0:Order ! [Item ! string()]), $root, ())">
                    <xsl:variable name="value" as="xs:string" select="."/>
                    <Item>
                      <xsl:for-each \
            select="po:slots(array:join(/s0:Order/Item ! [Name ! string()]), $root, 1)">
                        <xsl:variable name="name" as="xs:string" select="."/>
                        <Name><xsl:value-of select="$name"/></Name>
                      </xsl:for-each>
                    </Item>
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
    String queue = "array:join(/s0:Order ! [OrderId ! string()])";
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
        .contains("<xsl:for-each select=\"" + nested + "\">");
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
    String call = "po:slots(po:splitByValue(array:join(/s0:Order ! [OrderId ! string()])";

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
    assertThat(select.substring(literal.end())).matches(" *\\) *, *\\$root *, *1 *\\)");
  }
}
