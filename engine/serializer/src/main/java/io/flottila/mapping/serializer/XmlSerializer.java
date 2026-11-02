package io.flottila.mapping.serializer;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Writes one XML document as UTF-8 bytes (ADR-0022): the declaration {@code <?xml version="1.0"
 * encoding="UTF-8"?>}, then the elements without indentation and without a trailing newline. A
 * prefix is bound on the first element that needs it, where it is not already bound to the same
 * namespace; a default namespace is never declared. In text, {@code &}, {@code <} and {@code >} are
 * escaped and CR is written {@code &#13;}. An element without text is self-closing.
 *
 * <p>The serializer writes what it is told and never invents a prefix; the prefixes come from
 * lowering. It holds the state of one document and is not thread-safe.
 */
public final class XmlSerializer {

  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";

  private final Writer out;

  /**
   * Per open element, outermost first: its prefix, local name and namespace. An element's prefix is
   * bound to its namespace there, whether it declared the binding or inherited it.
   */
  private final List<String> open = new ArrayList<>();

  /** Whether the last start tag still waits for its {@code >} or {@code />}. */
  private boolean startTagOpen;

  /**
   * A serializer onto {@code out}. {@link #endDocument()} flushes; closing {@code out} is the
   * caller's.
   */
  public XmlSerializer(OutputStream out) {
    this.out = new OutputStreamWriter(out, StandardCharsets.UTF_8);
  }

  /** Writes the XML declaration. */
  public void startDocument() throws IOException {
    out.write(DECLARATION);
  }

  /**
   * Starts an element.
   *
   * @param prefix the prefix of {@code namespace}; {@code ""} for a name without a namespace
   * @param namespace the element's namespace, or {@code ""}
   * @param localName the element's local name
   * @throws IllegalArgumentException for a namespace without a prefix: it would need a default
   *     namespace or an invented prefix
   */
  public void startElement(String prefix, String namespace, String localName) throws IOException {
    if (prefix.isEmpty() && !namespace.isEmpty()) {
      throw new IllegalArgumentException(
          "the namespace " + namespace + " of " + localName + " has no prefix");
    }
    closeStartTag();
    out.write('<');
    writeName(prefix, localName);
    if (!prefix.isEmpty() && !bound(prefix, namespace)) {
      out.write(" xmlns:");
      out.write(prefix);
      out.write("=\"");
      escape(namespace, true);
      out.write('"');
    }
    open.add(prefix);
    open.add(localName);
    open.add(namespace);
    startTagOpen = true;
  }

  /** Writes {@code text} as content of the open element; {@code ""} writes nothing. */
  public void text(String text) throws IOException {
    if (text.isEmpty()) {
      return;
    }
    closeStartTag();
    escape(text, false);
  }

  /** Ends the element started last: {@code />} if it has no content, else its end tag. */
  public void endElement() throws IOException {
    int top = open.size() - 3;
    if (startTagOpen) {
      startTagOpen = false;
      out.write("/>");
    } else {
      out.write("</");
      writeName(open.get(top), open.get(top + 1));
      out.write('>');
    }
    open.subList(top, top + 3).clear();
  }

  /** Ends the document and flushes its bytes to the output stream. */
  public void endDocument() throws IOException {
    out.flush();
  }

  private void closeStartTag() throws IOException {
    if (startTagOpen) {
      startTagOpen = false;
      out.write('>');
    }
  }

  private void writeName(String prefix, String localName) throws IOException {
    if (!prefix.isEmpty()) {
      out.write(prefix);
      out.write(':');
    }
    out.write(localName);
  }

  /**
   * Whether {@code prefix} is bound to {@code namespace} at the innermost open element: the binding
   * of the innermost open element with that prefix.
   */
  private boolean bound(String prefix, String namespace) {
    for (int k = open.size() - 3; k >= 0; k -= 3) {
      if (open.get(k).equals(prefix)) {
        return open.get(k + 2).equals(namespace);
      }
    }
    return false;
  }

  /**
   * Writes {@code text} with {@code &}, {@code <}, {@code >} and CR escaped, and in an attribute
   * value {@code "} as well. The runs between them are written as they are.
   */
  private void escape(String text, boolean attribute) throws IOException {
    int run = 0;
    for (int k = 0; k < text.length(); k++) {
      String reference =
          switch (text.charAt(k)) {
            case '&' -> "&amp;";
            case '<' -> "&lt;";
            case '>' -> "&gt;";
            case '\r' -> "&#13;";
            case '"' -> attribute ? "&quot;" : null;
            default -> null;
          };
      if (reference != null) {
        out.write(text, run, k - run);
        out.write(reference);
        run = k + 1;
      }
    }
    out.write(text, run, text.length() - run);
  }
}
