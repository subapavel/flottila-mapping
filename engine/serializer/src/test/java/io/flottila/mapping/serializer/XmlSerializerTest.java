package io.flottila.mapping.serializer;

import static java.nio.charset.StandardCharsets.US_ASCII;
import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

/**
 * The XML serializer's bytes (ADR-0022): the declaration, no indentation, no trailing newline,
 * UTF-8; a prefix bound on the first element that needs it and never a default namespace; {@code
 * &}, {@code <}, {@code >} and CR escaped in text. Expected bytes are literals.
 */
class XmlSerializerTest {

  private static final String DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";

  @FunctionalInterface
  private interface Body {
    void write(XmlSerializer serializer) throws Exception;
  }

  /** The bytes of a whole document whose root and content {@code body} writes. */
  private static byte[] document(Body body) throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    XmlSerializer serializer = new XmlSerializer(out);
    serializer.startDocument();
    body.write(serializer);
    serializer.endDocument();
    return out.toByteArray();
  }

  private static void assertAscii(String expected, byte[] actual) {
    assertThat(new String(actual, UTF_8)).isEqualTo(expected);
    assertThat(actual).isEqualTo(expected.getBytes(US_ASCII));
  }

  @Test
  void writesTheDeclarationThenTheRootWithoutWhitespace() throws Exception {
    byte[] bytes =
        document(
            s -> {
              s.startElement("ns0", "urn:a", "Order");
              s.startElement("", "", "OrderId");
              s.text("4711");
              s.endElement();
              s.startElement("", "", "Note");
              s.text("x");
              s.endElement();
              s.endElement();
            });

    assertAscii(
        DECLARATION
            + "<ns0:Order xmlns:ns0=\"urn:a\"><OrderId>4711</OrderId><Note>x</Note></ns0:Order>",
        bytes);
  }

  @Test
  void declaresAPrefixAtFirstUseAndNeverADefaultNamespace() throws Exception {
    byte[] bytes =
        document(
            s -> {
              s.startElement("ns0", "urn:a", "A");
              s.startElement("ns1", "urn:b", "B");
              s.startElement("ns1", "urn:b", "C");
              s.text("x");
              s.endElement();
              s.endElement();
              // the first B's binding went out of scope with it
              s.startElement("ns1", "urn:b", "B");
              s.endElement();
              s.startElement("", "", "D");
              s.text("y");
              s.endElement();
              s.startElement("ns0", "urn:a", "E");
              s.text("z");
              s.endElement();
              s.endElement();
            });

    assertAscii(
        DECLARATION
            + "<ns0:A xmlns:ns0=\"urn:a\">"
            + "<ns1:B xmlns:ns1=\"urn:b\"><ns1:C>x</ns1:C></ns1:B>"
            + "<ns1:B xmlns:ns1=\"urn:b\"/>"
            + "<D>y</D>"
            + "<ns0:E>z</ns0:E>"
            + "</ns0:A>",
        bytes);
  }

  @Test
  void refusesANamespaceWithoutAPrefix() throws Exception {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    XmlSerializer serializer = new XmlSerializer(out);
    serializer.startDocument();

    // writing it would need a default namespace or an invented prefix, and ADR-0022 allows neither
    assertThatThrownBy(() -> serializer.startElement("", "urn:a", "Order"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void anEmptyElementIsSelfClosing() throws Exception {
    byte[] rootOnly =
        document(
            s -> {
              s.startElement("ns0", "urn:a", "Order");
              s.endElement();
            });
    byte[] emptyChildren =
        document(
            s -> {
              s.startElement("ns0", "urn:a", "Order");
              s.startElement("", "", "OrderId");
              s.endElement();
              s.startElement("", "", "Note");
              s.text("");
              s.endElement();
              s.endElement();
            });

    assertAscii(DECLARATION + "<ns0:Order xmlns:ns0=\"urn:a\"/>", rootOnly);
    assertAscii(
        DECLARATION + "<ns0:Order xmlns:ns0=\"urn:a\"><OrderId/><Note/></ns0:Order>",
        emptyChildren);
  }

  @Test
  void escapesMarkupAndCarriageReturnInText() throws Exception {
    byte[] bytes =
        document(
            s -> {
              s.startElement("", "", "v");
              s.text("a&b<c>d\re\"f'g\n\th]]>i");
              s.endElement();
            });

    // quotes, LF and tab are written as they are
    assertAscii(DECLARATION + "<v>a&amp;b&lt;c&gt;d&#13;e\"f'g\n\th]]&gt;i</v>", bytes);
  }

  @Test
  void writesNonAsciiAsUtf8() throws Exception {
    byte[] bytes =
        document(
            s -> {
              s.startElement("", "", "v");
              s.text("Grüße € 𝄞");
              s.endElement();
            });

    // G r ü ß e SP € SP U+1D11E, encoded by hand: no character references, no CESU-8 surrogates
    byte[] text = HexFormat.of().parseHex("4772c3bcc39f6520e282ac20f09d849e");
    ByteArrayOutputStream expected = new ByteArrayOutputStream();
    expected.writeBytes((DECLARATION + "<v>").getBytes(US_ASCII));
    expected.writeBytes(text);
    expected.writeBytes("</v>".getBytes(US_ASCII));
    assertThat(bytes).isEqualTo(expected.toByteArray());
  }
}
