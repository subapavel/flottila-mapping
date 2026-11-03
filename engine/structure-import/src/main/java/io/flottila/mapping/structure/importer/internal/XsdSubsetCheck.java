package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.importer.StructureImportDiagnostics;
import io.flottila.mapping.structure.importer.StructureLoadException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.Serial;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Set;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.Locator;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;
import org.xml.sax.helpers.NamespaceSupport;

/**
 * Reads one XSD file with the JDK's SAX parser before XmlSchema sees it, and refuses every
 * construct outside the nested subset where it stands. XmlSchema 2.3.3 keeps no line or column on
 * its objects, so this pass gives every load error its position (ADR-0008).
 *
 * <p>The nested subset (#62, F-14) is the flat subset of spec #21 with structure fields at any
 * depth: one {@code xs:schema} ({@code targetNamespace}, {@code elementFormDefault}) of global
 * {@code xs:element}s (only {@code name}), each with an anonymous {@code xs:complexType} that holds
 * an optional {@code xs:sequence} of local {@code xs:element}s and then {@code xs:attribute}s
 * ({@code name}, {@code type}, {@code use}). A local element is either a leaf ({@code name}, {@code
 * type}, {@code minOccurs}, {@code maxOccurs}, {@code nillable}) or, without {@code type}, a
 * structure field ({@code name}, {@code minOccurs}, {@code maxOccurs}) whose one anonymous {@code
 * xs:complexType} holds one {@code xs:sequence} of local elements and nothing else. Every type is a
 * built-in simple type.
 */
final class XsdSubsetCheck extends DefaultHandler {

  static final String UNSUPPORTED = StructureImportDiagnostics.SCHEMA_CONSTRUCT_UNSUPPORTED;
  static final String INVALID = StructureImportDiagnostics.SCHEMA_INVALID;

  private static final Pattern COUNT = Pattern.compile("[0-9]{1,18}");
  private static final Pattern BOOLEAN = Pattern.compile("true|false");
  private static final Pattern USE = Pattern.compile("optional|required");
  private static final Pattern FORM = Pattern.compile("qualified|unqualified");

  /** Where an XSD element may stand in the nested subset, and the attributes it may carry. */
  private enum Role {
    DOCUMENT(Set.of(), Set.of()),
    SCHEMA(Set.of("targetNamespace", "elementFormDefault"), Set.of()),
    ROOT(Set.of("name"), Set.of("name")),
    COMPLEX_TYPE(Set.of(), Set.of()),
    SEQUENCE(Set.of(), Set.of()),
    // a local element is a leaf only when it has a type (child), so a leaf never lacks one
    LEAF(Set.of("name", "type", "minOccurs", "maxOccurs", "nillable"), Set.of("name")),
    STRUCTURE(Set.of("name", "minOccurs", "maxOccurs"), Set.of("name")),
    STRUCTURE_TYPE(Set.of(), Set.of()),
    ATTRIBUTE(Set.of("name", "type", "use"), Set.of("name", "type"));

    final Set<String> attributes;
    final Set<String> required;

    Role(Set<String> attributes, Set<String> required) {
      this.attributes = attributes;
      this.required = required;
    }

    /**
     * The role of the XSD element {@code xs:<name>} inside this one, or null if it may not be. A
     * local element is a leaf when it has a {@code type}, and a structure field otherwise.
     */
    Role child(String name, boolean typed) {
      return switch (this) {
        case DOCUMENT -> name.equals("schema") ? SCHEMA : null;
        case SCHEMA -> name.equals("element") ? ROOT : null;
        case ROOT -> name.equals("complexType") ? COMPLEX_TYPE : null;
        case COMPLEX_TYPE ->
            switch (name) {
              case "sequence" -> SEQUENCE;
              case "attribute" -> ATTRIBUTE;
              default -> null;
            };
        case SEQUENCE -> name.equals("element") ? (typed ? LEAF : STRUCTURE) : null;
        case STRUCTURE -> name.equals("complexType") ? STRUCTURE_TYPE : null;
        case STRUCTURE_TYPE -> name.equals("sequence") ? SEQUENCE : null;
        case LEAF, ATTRIBUTE -> null;
      };
    }
  }

  /** An open XSD element, where its start tag ends, and the number of child elements so far. */
  private static final class Frame {
    final Role role;
    final Position start;
    int children;

    Frame(Role role, Position start) {
      this.role = role;
      this.start = start;
    }
  }

  /** A position in the file: where SAX reports a start tag, at its end. */
  record Position(int line, int column) {}

  /** A refused construct, at the parser's position or at a start tag read before. */
  private static final class Refusal extends SAXParseException {
    @Serial private static final long serialVersionUID = 1L;

    final String code;

    Refusal(String code, String message, Locator locator) {
      super(message, locator);
      this.code = code;
    }

    Refusal(String code, String message, Position at) {
      super(message, null, null, at.line(), at.column());
      this.code = code;
    }
  }

  private final Deque<Frame> open = new ArrayDeque<>();
  private final NamespaceSupport namespaces = new NamespaceSupport();
  private boolean contextPushed;
  private Locator locator;
  private Position schema;

  private XsdSubsetCheck() {
    // the document has no start tag
    open.push(new Frame(Role.DOCUMENT, null));
  }

  /**
   * @return the position of the {@code xs:schema} start tag
   * @throws StructureLoadException when the file is not well-formed XML, has a DOCTYPE, or holds a
   *     construct outside the nested subset
   */
  static Position check(String file, byte[] content) throws StructureLoadException {
    XsdSubsetCheck handler = new XsdSubsetCheck();
    try {
      SAXParserFactory factory = SAXParserFactory.newInstance();
      factory.setNamespaceAware(true);
      // no DTD: no entity and no external file is ever read (ADR-0008: loading is offline)
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.newSAXParser().parse(new InputSource(new ByteArrayInputStream(content)), handler);
    } catch (Refusal e) {
      throw new StructureLoadException(
          e.code, file, e.getLineNumber(), e.getColumnNumber(), e.getMessage());
    } catch (SAXParseException e) {
      throw new StructureLoadException(
          StructureImportDiagnostics.SCHEMA_NOT_WELL_FORMED,
          file,
          e.getLineNumber(),
          e.getColumnNumber(),
          e.getMessage());
    } catch (ParserConfigurationException | SAXException | IOException e) {
      // the JDK parser supports both features, and the input is in memory
      throw new IllegalStateException(e);
    }
    return handler.schema;
  }

  @Override
  public void setDocumentLocator(Locator locator) {
    this.locator = locator;
  }

  @Override
  public void startPrefixMapping(String prefix, String uri) {
    if (!contextPushed) {
      namespaces.pushContext();
      contextPushed = true;
    }
    namespaces.declarePrefix(prefix, uri);
  }

  @Override
  public void startElement(String uri, String localName, String qName, Attributes attributes)
      throws SAXException {
    if (!contextPushed) {
      namespaces.pushContext();
    }
    contextPushed = false;
    Frame parent = open.element();
    Role role =
        XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(uri)
            ? parent.role.child(localName, attributes.getValue("", "type") != null)
            : null;
    if (role == null) {
      throw refuse(UNSUPPORTED, "<" + qName + "> here is outside the nested XSD subset");
    }
    // an element has one xs:complexType; a complex type's xs:sequence comes once, first
    if (parent.children > 0
        && (role == Role.COMPLEX_TYPE || role == Role.STRUCTURE_TYPE || role == Role.SEQUENCE)) {
      throw refuse(
          UNSUPPORTED, "<" + qName + "> after another child is outside the nested XSD subset");
    }
    parent.children++;
    for (int i = 0; i < attributes.getLength(); i++) {
      if (!attributes.getURI(i).isEmpty()
          || !role.attributes.contains(attributes.getLocalName(i))) {
        throw refuse(
            UNSUPPORTED,
            "the attribute "
                + attributes.getQName(i)
                + " of <"
                + qName
                + "> is outside the nested XSD subset");
      }
    }
    for (String name : role.required) {
      if (attributes.getValue("", name) == null) {
        throw refuse(
            UNSUPPORTED, "<" + qName + "> without " + name + " is outside the nested XSD subset");
      }
    }
    Position start = new Position(locator.getLineNumber(), locator.getColumnNumber());
    if (role == Role.SCHEMA) {
      schema = start;
    }
    if (role == Role.LEAF || role == Role.ATTRIBUTE) {
      checkType(attributes.getValue("", "type"));
    }
    if (role == Role.LEAF || role == Role.STRUCTURE) {
      checkOccurrence(attributes.getValue("", "minOccurs"), attributes.getValue("", "maxOccurs"));
    }
    checkValue(attributes, "nillable", BOOLEAN);
    checkValue(attributes, "use", USE);
    checkValue(attributes, "elementFormDefault", FORM);
    open.push(new Frame(role, start));
  }

  @Override
  public void endElement(String uri, String localName, String qName) throws SAXException {
    Frame closed = open.pop();
    if (closed.role == Role.ROOT && closed.children == 0) {
      throw refuse(
          UNSUPPORTED, "<" + qName + "> without xs:complexType is outside the nested XSD subset");
    }
    // a local element without type is refused at its own start tag
    if (closed.role == Role.STRUCTURE && closed.children == 0) {
      throw new Refusal(
          UNSUPPORTED,
          "<" + qName + "> without type or xs:complexType is outside the nested XSD subset",
          closed.start);
    }
    if (closed.role == Role.STRUCTURE_TYPE && closed.children == 0) {
      throw new Refusal(
          UNSUPPORTED,
          "an xs:element whose xs:complexType holds no xs:sequence is outside the nested XSD"
              + " subset",
          open.element().start);
    }
    namespaces.popContext();
  }

  @Override
  public void characters(char[] ch, int start, int length) throws SAXException {
    if (!new String(ch, start, length).isBlank()) {
      throw refuse(UNSUPPORTED, "text inside a schema is outside the nested XSD subset");
    }
  }

  private void checkType(String type) throws SAXException {
    String[] name = namespaces.processName(type, new String[3], false);
    if (name == null
        || !XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(name[0])
        || BuiltInTypes.valueType(name[1]).isEmpty()) {
      throw refuse(
          UNSUPPORTED,
          "the type " + type + " is not a built-in simple type of the nested XSD subset");
    }
  }

  private void checkOccurrence(String min, String max) throws SAXException {
    String minText = min == null ? "1" : min;
    String maxText = max == null ? "1" : max;
    if (!COUNT.matcher(minText).matches()) {
      throw refuse(INVALID, "minOccurs=\"" + min + "\" is not a non-negative integer");
    }
    if (!maxText.equals("unbounded") && !COUNT.matcher(maxText).matches()) {
      throw refuse(
          INVALID, "maxOccurs=\"" + max + "\" is neither a non-negative integer nor unbounded");
    }
    if (!maxText.equals("unbounded") && Long.parseLong(minText) > Long.parseLong(maxText)) {
      throw refuse(INVALID, "minOccurs=\"" + min + "\" is greater than maxOccurs=\"" + max + "\"");
    }
  }

  private void checkValue(Attributes attributes, String name, Pattern allowed) throws SAXException {
    String value = attributes.getValue("", name);
    if (value != null && !allowed.matcher(value).matches()) {
      throw refuse(UNSUPPORTED, name + "=\"" + value + "\" is outside the nested XSD subset");
    }
  }

  private Refusal refuse(String code, String message) {
    return new Refusal(code, message, locator);
  }
}
