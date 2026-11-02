package io.flottila.mapping.xslt.export;

import static java.nio.charset.StandardCharsets.UTF_8;

import io.flottila.mapping.ir.ElementConstructor;
import io.flottila.mapping.ir.Expr;
import io.flottila.mapping.ir.FunCall;
import io.flottila.mapping.ir.Lift;
import io.flottila.mapping.ir.Literal;
import io.flottila.mapping.ir.Name;
import io.flottila.mapping.ir.SourceQueue;
import io.flottila.mapping.ir.TargetDocument;
import io.flottila.mapping.ir.TargetSlots;
import io.flottila.mapping.ir.TextConstructor;
import io.flottila.mapping.ir.VarRef;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The portable XSLT 3.0 export of unoptimised IR (ADR-0023): one stylesheet that imports the helper
 * module from its own directory. Each instruction and literal element starts a line of its own, two
 * spaces deeper than its parent. An element whose content is a single text keeps its {@code
 * xsl:value-of} and end tag on its own line; any other element's end tag starts a line.
 *
 * <ul>
 *   <li>Every (prefix, URI) pair is declared once, on {@code xsl:stylesheet}, under {@code
 *       exclude-result-prefixes="#all"}: first the stylesheet's own (XSLT, XML Schema, arrays and
 *       the helper's {@code po}), then the source namespaces as {@code s0}, {@code s1} … in IR walk
 *       order, then the IR's output prefixes (ADR-0022) in the order first met, the root's first. A
 *       pair met again is not declared again.
 *   <li>A name without a namespace stays bare. There is never a default namespace and never an
 *       {@code xpath-default-namespace}.
 *   <li>{@code TargetSlots} is {@code po:slots} over its queue, its parent's slot number and its
 *       {@code max}, {@code ()} when unbounded; spec 1 does not enforce {@code min} (ADR-0006).
 *   <li>A queue is an {@code array(item()*)} with one member per context, each value an {@code
 *       xs:string} or {@code $po:SUPPRESS}, and a {@code FunCall} is {@code po:<catalogue name>} of
 *       the helper module over its args in {@code FunCall} order (ADR-0025). A {@code Literal} is
 *       an XPath string literal in apostrophes.
 *   <li>A {@code Lift} is {@code po:lift} over the sequence of its queues and an inline function of
 *       {@code $in as xs:string*}, which binds slot variable k to {@code $in[k]} and returns the
 *       body (ADR-0025 since #51).
 *   <li>An expression is escaped for the attribute it stands in, so a literal keeps every
 *       character, white space included.
 * </ul>
 *
 * <p>An IR it cannot write is a compiler bug, as in {@code IrVerifier}, so it throws {@link
 * IllegalArgumentException}: a namespace under prefix {@code ""} or a prefix without a namespace,
 * one prefix bound to two URIs, or a node where it cannot stand. It never returns part of a
 * stylesheet.
 */
public final class XsltExporter {

  /** The file name of the helper module every export imports (ADR-0023). */
  public static final String HELPER_MODULE = "po-runtime.xsl";

  /**
   * The stylesheet: its declarations, the helper module, the root's slot variable, the root's name
   * and its content, each line of which starts with its own line break.
   */
  private static final String STYLESHEET =
      """
      <?xml version="1.0" encoding="UTF-8"?>
      <xsl:stylesheet version="3.0"%1$s exclude-result-prefixes="#all">
        <xsl:import href="%2$s"/>
        <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no" \
      omit-xml-declaration="no"/>
        <xsl:template match="/">
          <xsl:variable name="%3$s" as="xs:integer" select="1"/>
          <%4$s>%5$s
          </%4$s>
        </xsl:template>
      </xsl:stylesheet>
      """;

  /** A namespace declaration on {@code xsl:stylesheet}, with the space before it. */
  private static final String DECLARATION = " xmlns:%s=\"%s\"";

  private static final String FOR_EACH =
      """
      <xsl:for-each select="po:slots(%s, %s, %s)">""";

  private static final String VALUE_VARIABLE =
      """
      <xsl:variable name="%s" as="xs:string" select="."/>""";

  private static final String END_FOR_EACH =
      """
      </xsl:for-each>""";

  private static final String VALUE_OF =
      """
      <xsl:value-of select="%s"/>""";

  /** A {@code SourceQueue}: its context's path from the root, then its field's path under it. */
  private static final String QUEUE =
      """
      array:join(/%s ! [%s ! string()])""";

  /**
   * A {@code Lift} (ADR-0025): {@code po:lift} over its queues, and over the inline function that
   * binds the slot variables and returns the body.
   */
  private static final String LIFT =
      """
      po:lift((%s), function($in as xs:string*) as xs:string { let %s return %s })""";

  /** The {@code max} of a {@code TargetSlots} that is unbounded. */
  private static final String UNBOUNDED = "()";

  /** The indent of one level. */
  private static final String INDENT = "  ";

  /** The depth of the root's content: stylesheet, template, root. */
  private static final int CONTENT_DEPTH = 3;

  /** Every prefix bound so far, to its URI. */
  private final Map<String, String> bound = new HashMap<>();

  /** The prefix of each source namespace met so far. */
  private final Map<String, String> sourcePrefixes = new HashMap<>();

  /** The declarations of the stylesheet's own namespaces, then of the source namespaces. */
  private final StringBuilder declarations = new StringBuilder();

  /** The declarations of the IR's output prefixes. */
  private final StringBuilder outputDeclarations = new StringBuilder();

  private XsltExporter() {
    String stylesheet = "xsl:stylesheet";
    bind("xsl", "http://www.w3.org/1999/XSL/Transform", declarations, stylesheet);
    bind("xs", "http://www.w3.org/2001/XMLSchema", declarations, stylesheet);
    bind("array", "http://www.w3.org/2005/xpath-functions/array", declarations, stylesheet);
    bind("po", "urn:flottila:mapping:po", declarations, stylesheet);
  }

  /**
   * The stylesheet of {@code document}, which the IR verifier has accepted.
   *
   * @throws IllegalArgumentException if the exporter cannot write {@code document}
   */
  public static String export(TargetDocument document) {
    XsltExporter exporter = new XsltExporter();
    String root = exporter.outputName(document.prefix(), document.root(), "the root");
    StringBuilder content = new StringBuilder();
    for (Expr expr : document.content()) {
      exporter.instruction(expr, CONTENT_DEPTH, content);
    }
    return STYLESHEET.formatted(
        exporter.declarations.toString() + exporter.outputDeclarations,
        HELPER_MODULE,
        document.rootSlot(),
        root,
        content);
  }

  /** The text of the helper module, the resource {@link #HELPER_MODULE} of this package. */
  public static String helperModule() {
    try (InputStream in = XsltExporter.class.getResourceAsStream(HELPER_MODULE)) {
      return new String(in.readAllBytes(), UTF_8);
    } catch (IOException e) {
      // the resource lies in this module's own jar or directory: only a broken build fails here
      throw new UncheckedIOException(e);
    }
  }

  /** Appends {@code expr} as the instructions that create its content, at {@code depth}. */
  private void instruction(Expr expr, int depth, StringBuilder out) {
    switch (expr) {
      case TargetSlots s -> {
        line(
            out,
            depth,
            FOR_EACH.formatted(
                attribute(expression(s.queue())),
                attribute(expression(s.parentSlot())),
                max(s.max())));
        line(out, depth + 1, VALUE_VARIABLE.formatted(s.valueVar()));
        instruction(s.body(), depth + 1, out);
        line(out, depth, END_FOR_EACH);
      }
      case ElementConstructor e -> {
        String name =
            outputName(e.prefix(), e.name(), "ElementConstructor of " + e.origin().value());
        line(out, depth, "<" + name + ">");
        for (Expr content : e.content()) {
          instruction(content, depth + 1, out);
        }
        String end = "</" + name + ">";
        if (e.content().size() == 1 && e.content().getFirst() instanceof TextConstructor) {
          // a single text stays on its element's line; any other content ends on a line of its own
          out.append(end);
        } else {
          line(out, depth, end);
        }
      }
      case TextConstructor t -> out.append(VALUE_OF.formatted(attribute(expression(t.value()))));
      case SourceQueue q -> throw misplaced(q, "content");
      case VarRef v -> throw misplaced(v, "content");
      case Literal l -> throw misplaced(l, "content");
      case FunCall c -> throw misplaced(c, "content");
      case Lift l -> throw misplaced(l, "content");
    }
  }

  /** {@code expr} as an XPath expression. */
  private String expression(Expr expr) {
    return switch (expr) {
      case SourceQueue q -> {
        String where = "SourceQueue of " + q.origin().value();
        yield QUEUE.formatted(
            path(q.field().subList(0, q.contextDepth()), where),
            path(q.field().subList(q.contextDepth(), q.field().size()), where));
      }
      case VarRef v -> "$" + v.name();
      case Literal l -> "'" + l.value().replace("'", "''") + "'";
      case FunCall c ->
          c.args().stream()
              .map(this::expression)
              .collect(Collectors.joining(", ", "po:" + c.function().name() + "(", ")"));
      case Lift l -> lift(l);
      case TargetSlots s -> throw misplaced(s, "an expression");
      case ElementConstructor e -> throw misplaced(e, "an expression");
      case TextConstructor t -> throw misplaced(t, "an expression");
    };
  }

  /**
   * {@code l} as {@code po:lift} over the sequence of its queues and an inline function, whose
   * {@code let} binds slot variable k to the k-th string it gets, and which returns the body.
   */
  private String lift(Lift l) {
    List<String> bindings = new ArrayList<>();
    for (int k = 0; k < l.slotVars().size(); k++) {
      bindings.add("$" + l.slotVars().get(k) + " := $in[" + (k + 1) + "]");
    }
    return LIFT.formatted(
        l.queues().stream().map(this::expression).collect(Collectors.joining(", ")),
        String.join(", ", bindings),
        expression(l.body()));
  }

  private static String max(long max) {
    return max == Long.MAX_VALUE ? UNBOUNDED : Long.toString(max);
  }

  /** The relative path of source element {@code steps}, each under its source prefix. */
  private String path(List<Name> steps, String where) {
    StringBuilder path = new StringBuilder();
    String separator = "";
    for (Name step : steps) {
      path.append(separator).append(sourceName(step, where));
      separator = "/";
    }
    return path.toString();
  }

  /** The name test of a source step: bare without a namespace, else {@code s0}, {@code s1} … */
  private String sourceName(Name step, String where) {
    String namespace = step.namespace();
    if (namespace.isEmpty()) {
      return step.localName();
    }
    String prefix = sourcePrefixes.get(namespace);
    if (prefix == null) {
      prefix = "s" + sourcePrefixes.size();
      sourcePrefixes.put(namespace, prefix);
      bind(prefix, namespace, declarations, where);
    }
    return prefix + ":" + step.localName();
  }

  /** The name of an output element under the IR's {@code prefix} (ADR-0022). */
  private String outputName(String prefix, Name name, String where) {
    if (prefix.isEmpty() != name.namespace().isEmpty()) {
      throw new IllegalArgumentException(
          where
              + ": "
              + name
              + " under prefix \""
              + prefix
              + "\"; a name has a prefix exactly when it has a namespace (ADR-0022)");
    }
    if (prefix.isEmpty()) {
      return name.localName();
    }
    bind(prefix, name.namespace(), outputDeclarations, where);
    return prefix + ":" + name.localName();
  }

  /**
   * Binds {@code prefix} to {@code uri}, and appends its declaration to {@code into} if it is new.
   */
  private void bind(String prefix, String uri, StringBuilder into, String where) {
    String was = bound.putIfAbsent(prefix, uri);
    if (was == null) {
      into.append(DECLARATION.formatted(prefix, attribute(uri)));
    } else if (!was.equals(uri)) {
      throw new IllegalArgumentException(
          where + ": prefix " + prefix + " is bound to " + was + " and to " + uri);
    }
  }

  /**
   * {@code value} escaped for an attribute in quotes, white space included, which a parser would
   * otherwise normalise (XML 1.0 §3.3.3).
   */
  private static String attribute(String value) {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace("\"", "&quot;")
        .replace("\t", "&#9;")
        .replace("\n", "&#10;")
        .replace("\r", "&#13;");
  }

  private static void line(StringBuilder out, int depth, String text) {
    out.append('\n').append(INDENT.repeat(depth)).append(text);
  }

  /**
   * A node where the IR's shape has no place for it; the IR verifier does not check places. The
   * node's text names its origin.
   */
  private static IllegalArgumentException misplaced(Expr expr, String place) {
    return new IllegalArgumentException(expr + " stands in " + place);
  }
}
