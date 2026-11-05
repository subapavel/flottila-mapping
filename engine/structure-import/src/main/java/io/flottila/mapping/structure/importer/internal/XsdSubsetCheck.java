package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.importer.StructureImportDiagnostics;
import io.flottila.mapping.structure.importer.StructureLoadException;
import io.flottila.mapping.structure.importer.internal.SchemaFile.FileReference;
import io.flottila.mapping.structure.importer.internal.SchemaFile.GlobalElement;
import io.flottila.mapping.structure.importer.internal.SchemaFile.NameUse;
import io.flottila.mapping.structure.importer.internal.SchemaFile.Position;
import io.flottila.mapping.structure.importer.internal.SchemaFile.SimpleType;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.Serial;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.namespace.QName;
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
 * Reads one XSD file with the JDK's SAX parser before XmlSchema sees it. It refuses every construct
 * outside the XSD the reader reads where it stands, and records what {@link BundleCheck} needs.
 * XmlSchema 2.3.3 keeps no line or column on its objects, so this pass gives every load error its
 * position (ADR-0008). A refused construct's content is not read; a file that is not well-formed
 * stops at the parser's error, and every refusal before it stays.
 *
 * <p>The XSD read (#93) is one {@code xs:schema} ({@code targetNamespace}, {@code
 * elementFormDefault}, {@code attributeFormDefault}) of {@code xs:import}s, {@code xs:include}s,
 * global {@code xs:element}s and {@code xs:attribute}s, and named {@code xs:complexType}s and
 * {@code xs:simpleType}s.
 *
 * <ul>
 *   <li>A complex type, named or anonymous, holds an optional {@code xs:sequence} first and then
 *       {@code xs:attribute}s ({@code name}, {@code type}, {@code use}, {@code form}, {@code
 *       default}, {@code fixed}). An anonymous one below the root holds at least one of them.
 *   <li>A sequence holds local {@code xs:element}s, element references ({@code ref}, {@code
 *       minOccurs}, {@code maxOccurs}) and {@code xs:any}.
 *   <li>A global or local element has a {@code type} or one anonymous {@code xs:complexType}. A
 *       local one is a leaf or structure field ({@code name}, {@code minOccurs}, {@code maxOccurs},
 *       {@code form}; with a type also {@code nillable}, {@code default}, {@code fixed}).
 *   <li>A named simple type is an {@code xs:restriction} of a {@code base}, an {@code xs:list} or
 *       an {@code xs:union}.
 * </ul>
 *
 * <p>Accepted with no effect, their content unread (ADR-0008): {@code xs:annotation} anywhere,
 * {@code xs:any}, {@code xs:anyAttribute}, facets, identity constraints, and the content of a list
 * or union.
 */
final class XsdSubsetCheck extends DefaultHandler {

  static final String UNSUPPORTED = StructureImportDiagnostics.SCHEMA_CONSTRUCT_UNSUPPORTED;
  static final String INVALID = StructureImportDiagnostics.SCHEMA_INVALID;

  private static final Pattern COUNT = Pattern.compile("[0-9]{1,18}");
  private static final Pattern BOOLEAN = Pattern.compile("true|false");
  private static final Pattern USE = Pattern.compile("optional|required");
  private static final Pattern FORM = Pattern.compile("qualified|unqualified");

  // one string: FamilyLocalityTest reads a quoted standard function name, such as the facet
  // length's, as a mention of the function outside its family
  private static final Set<String> FACETS =
      Set.of(
          ("minExclusive minInclusive maxExclusive maxInclusive totalDigits fractionDigits length"
                  + " minLength maxLength enumeration whiteSpace pattern")
              .split(" "));

  private static final Set<String> IDENTITY_CONSTRAINTS = Set.of("unique", "key", "keyref");

  /** Where an XSD element may stand, and the attributes it may carry. */
  private enum Role {
    DOCUMENT(Set.of(), Set.of()),
    SCHEMA(Set.of("targetNamespace", "elementFormDefault", "attributeFormDefault"), Set.of()),
    IMPORT(Set.of("namespace", "schemaLocation"), Set.of()),
    INCLUDE(Set.of("schemaLocation"), Set.of("schemaLocation")),
    // a global element with an anonymous complex type, and one with a type
    GLOBAL(Set.of("name"), Set.of("name")),
    GLOBAL_TYPED(Set.of("name", "type", "nillable", "default", "fixed"), Set.of("name")),
    GLOBAL_ATTRIBUTE(Set.of("name", "type", "default", "fixed"), Set.of("name", "type")),
    NAMED_COMPLEX_TYPE(Set.of("name"), Set.of("name")),
    COMPLEX_TYPE(Set.of(), Set.of()),
    SEQUENCE(Set.of(), Set.of()),
    // a local element is a leaf only when it has a type (child), so a leaf never lacks one
    LEAF(
        Set.of("name", "type", "minOccurs", "maxOccurs", "nillable", "form", "default", "fixed"),
        Set.of("name")),
    ELEMENT_REF(Set.of("ref", "minOccurs", "maxOccurs"), Set.of("ref")),
    STRUCTURE(Set.of("name", "minOccurs", "maxOccurs", "form"), Set.of("name")),
    STRUCTURE_TYPE(Set.of(), Set.of()),
    ATTRIBUTE(Set.of("name", "type", "use", "form", "default", "fixed"), Set.of("name", "type")),
    NAMED_SIMPLE_TYPE(Set.of("name"), Set.of("name")),
    RESTRICTION(Set.of("base"), Set.of("base")),
    // read with no effect: its attributes and content are not read
    NO_EFFECT(Set.of(), Set.of());

    final Set<String> attributes;
    final Set<String> required;

    Role(Set<String> attributes, Set<String> required) {
      this.attributes = attributes;
      this.required = required;
    }

    /**
     * The role of the XSD element {@code xs:<name>} inside this one, or null if it may not be. An
     * element is a reference when it has a {@code ref}, typed when it has a {@code type}, and
     * otherwise has an anonymous complex type.
     */
    Role child(String name, Attributes attributes) {
      if (this == DOCUMENT) {
        return name.equals("schema") ? SCHEMA : null;
      }
      if (name.equals("annotation")) {
        return NO_EFFECT;
      }
      boolean typed = attributes.getValue("", "type") != null;
      return switch (this) {
        case SCHEMA ->
            switch (name) {
              case "import" -> IMPORT;
              case "include" -> INCLUDE;
              case "element" -> typed ? GLOBAL_TYPED : GLOBAL;
              case "attribute" -> GLOBAL_ATTRIBUTE;
              case "complexType" -> NAMED_COMPLEX_TYPE;
              case "simpleType" -> NAMED_SIMPLE_TYPE;
              default -> null;
            };
        case GLOBAL -> name.equals("complexType") ? COMPLEX_TYPE : identityConstraint(name);
        case GLOBAL_TYPED, LEAF -> identityConstraint(name);
        case NAMED_COMPLEX_TYPE, COMPLEX_TYPE, STRUCTURE_TYPE ->
            switch (name) {
              case "sequence" -> SEQUENCE;
              case "attribute" -> ATTRIBUTE;
              case "anyAttribute" -> NO_EFFECT;
              default -> null;
            };
        case SEQUENCE ->
            switch (name) {
              case "element" ->
                  attributes.getValue("", "ref") != null ? ELEMENT_REF : typed ? LEAF : STRUCTURE;
              case "any" -> NO_EFFECT;
              default -> null;
            };
        case STRUCTURE -> name.equals("complexType") ? STRUCTURE_TYPE : identityConstraint(name);
        case NAMED_SIMPLE_TYPE ->
            switch (name) {
              case "restriction" -> RESTRICTION;
              case "list", "union" -> NO_EFFECT;
              default -> null;
            };
        case RESTRICTION -> FACETS.contains(name) ? NO_EFFECT : null;
        case DOCUMENT, IMPORT, INCLUDE, GLOBAL_ATTRIBUTE, ELEMENT_REF, ATTRIBUTE, NO_EFFECT -> null;
      };
    }

    private static Role identityConstraint(String name) {
      return IDENTITY_CONSTRAINTS.contains(name) ? NO_EFFECT : null;
    }
  }

  /** An open XSD element, where its start tag ends, and its children so far. */
  private static final class Frame {
    final Role role;
    final Position start;

    /** Child elements other than annotations, refused ones among them. */
    int children;

    /** Whether it has an anonymous type, refused or not. */
    boolean anonymousType;

    Frame(Role role, Position start) {
      this.role = role;
      this.start = start;
    }
  }

  /** A refused construct, at the parser's position or at a start tag read before. */
  private static final class Refusal extends Exception {
    @Serial private static final long serialVersionUID = 1L;

    final String code;
    final transient Position at;

    Refusal(String code, String message, Position at) {
      super(message);
      this.code = code;
      this.at = at;
    }
  }

  private final SchemaFile schema;
  private final List<StructureLoadException> errors;
  private final Deque<Frame> open = new ArrayDeque<>();
  private final NamespaceSupport namespaces = new NamespaceSupport();
  private boolean contextPushed;
  private Locator locator;

  /** The depth inside an element whose content is not read; 0 outside any. */
  private int skipped;

  /** The named simple type being read. */
  private QName simpleType;

  private XsdSubsetCheck(SchemaFile schema, List<StructureLoadException> errors) {
    this.schema = schema;
    this.errors = errors;
    // the document has no start tag
    open.push(new Frame(Role.DOCUMENT, null));
  }

  /**
   * Checks one file, adding each load error in it to {@code errors}: one per refused construct, and
   * one where the file stops being well-formed XML or has a DOCTYPE.
   *
   * @return what the file declares and refers to, as far as it was read
   */
  static SchemaFile check(String file, byte[] content, List<StructureLoadException> errors) {
    SchemaFile schema = new SchemaFile(file);
    XsdSubsetCheck handler = new XsdSubsetCheck(schema, errors);
    try {
      SAXParserFactory factory = SAXParserFactory.newInstance();
      factory.setNamespaceAware(true);
      // no DTD: no entity and no external file is ever read (ADR-0008: loading is offline)
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.newSAXParser().parse(new InputSource(new ByteArrayInputStream(content)), handler);
    } catch (SAXParseException e) {
      errors.add(
          new StructureLoadException(
              StructureImportDiagnostics.SCHEMA_NOT_WELL_FORMED,
              file,
              e.getLineNumber(),
              e.getColumnNumber(),
              e.getMessage()));
    } catch (ParserConfigurationException | SAXException | IOException e) {
      // the JDK parser supports both features, the input is in memory, and the handler throws no
      // SAXException of its own
      throw new IllegalStateException(e);
    }
    return schema;
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
  public void startElement(String uri, String localName, String qName, Attributes attributes) {
    if (!contextPushed) {
      namespaces.pushContext();
    }
    contextPushed = false;
    if (skipped > 0) {
      skipped++;
      return;
    }
    try {
      Frame frame = start(uri, localName, qName, attributes);
      if (frame.role == Role.NO_EFFECT) {
        skipped = 1;
      } else {
        open.push(frame);
      }
    } catch (Refusal refusal) {
      refuse(refusal);
      skipped = 1;
    }
  }

  /**
   * The frame of an element that may stand here, or the refusal of one that may not. A {@link
   * Role#NO_EFFECT} frame is never opened: its content is not read.
   */
  private Frame start(String uri, String localName, String qName, Attributes attributes)
      throws Refusal {
    Position start = position();
    Frame parent = open.element();
    Role role =
        XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(uri)
            ? parent.role.child(localName, attributes)
            : null;
    // a refused child counts as well, so that its parent is not refused for lacking it; an
    // annotation may come first anywhere
    int earlier = parent.children;
    parent.children += localName.equals("annotation") ? 0 : 1;
    parent.anonymousType |= localName.equals("complexType") || localName.equals("simpleType");
    if (role == null) {
      throw refusal(UNSUPPORTED, "<" + qName + "> here is outside the XSD the reader reads");
    }
    if (role == Role.NO_EFFECT) {
      return new Frame(role, start);
    }
    // an element has one xs:complexType; a complex type's xs:sequence comes once, first
    if (earlier > 0
        && (role == Role.COMPLEX_TYPE || role == Role.STRUCTURE_TYPE || role == Role.SEQUENCE)) {
      throw refusal(
          UNSUPPORTED, "<" + qName + "> after another child is outside the XSD the reader reads");
    }
    for (int i = 0; i < attributes.getLength(); i++) {
      if (!attributes.getURI(i).isEmpty()
          || !role.attributes.contains(attributes.getLocalName(i))) {
        throw refusal(
            UNSUPPORTED,
            "the attribute "
                + attributes.getQName(i)
                + " of <"
                + qName
                + "> is outside the XSD the reader reads");
      }
    }
    for (String name : role.required) {
      if (attributes.getValue("", name) == null) {
        throw refusal(
            UNSUPPORTED,
            "<" + qName + "> without " + name + " is outside the XSD the reader reads");
      }
    }
    if (role == Role.LEAF || role == Role.STRUCTURE || role == Role.ELEMENT_REF) {
      checkOccurrence(attributes.getValue("", "minOccurs"), attributes.getValue("", "maxOccurs"));
    }
    checkValue(attributes, "nillable", BOOLEAN);
    checkValue(attributes, "use", USE);
    checkValue(attributes, "elementFormDefault", FORM);
    checkValue(attributes, "attributeFormDefault", FORM);
    checkValue(attributes, "form", FORM);
    record(role, attributes, start);
    return new Frame(role, start);
  }

  /** Records what {@link BundleCheck} needs of an element that stands where it may. */
  private void record(Role role, Attributes attributes, Position start) throws Refusal {
    String name = attributes.getValue("", "name");
    String type = attributes.getValue("", "type");
    switch (role) {
      case SCHEMA -> {
        String targetNamespace = attributes.getValue("", "targetNamespace");
        schema.targetNamespace = targetNamespace == null ? "" : targetNamespace;
        schema.schemaTag = start;
      }
      case IMPORT -> {
        String namespace = attributes.getValue("", "namespace");
        schema.references.add(
            new FileReference(
                namespace == null ? "" : namespace,
                attributes.getValue("", "schemaLocation"),
                start));
      }
      case INCLUDE ->
          schema.references.add(
              new FileReference(null, attributes.getValue("", "schemaLocation"), start));
      case GLOBAL -> schema.elements.put(global(name), new GlobalElement(schema.name, null, start));
      case GLOBAL_TYPED ->
          schema.elements.put(
              global(name),
              new GlobalElement(schema.name, typeName(type, schema.elementTypes, start), start));
      case LEAF -> typeName(type, schema.elementTypes, start);
      case GLOBAL_ATTRIBUTE, ATTRIBUTE -> typeName(type, schema.simpleTypeRefs, start);
      case ELEMENT_REF ->
          schema.elementRefs.add(new NameUse(qualified(attributes.getValue("", "ref")), start));
      case NAMED_COMPLEX_TYPE -> schema.complexTypes.add(global(name));
      case NAMED_SIMPLE_TYPE -> {
        simpleType = global(name);
        schema.simpleTypes.put(simpleType, new SimpleType(null, start));
      }
      case RESTRICTION -> {
        QName base = typeName(attributes.getValue("", "base"), schema.simpleTypeRefs, start);
        schema.simpleTypes.put(simpleType, new SimpleType(base, start));
      }
      case DOCUMENT, COMPLEX_TYPE, SEQUENCE, STRUCTURE, STRUCTURE_TYPE, NO_EFFECT -> {
        // nothing to record
      }
    }
  }

  @Override
  public void endElement(String uri, String localName, String qName) {
    namespaces.popContext();
    if (skipped > 0) {
      skipped--;
      return;
    }
    Frame closed = open.pop();
    if (closed.role == Role.GLOBAL && !closed.anonymousType) {
      refuse(
          refusal(
              UNSUPPORTED,
              "<"
                  + qName
                  + "> without type or xs:complexType is outside the XSD the reader reads"));
    }
    // a local element without type is refused at its own start tag
    if (closed.role == Role.STRUCTURE && !closed.anonymousType) {
      refuse(
          new Refusal(
              UNSUPPORTED,
              "<" + qName + "> without type or xs:complexType is outside the XSD the reader reads",
              closed.start));
    }
    if (closed.role == Role.STRUCTURE_TYPE && closed.children == 0) {
      refuse(
          new Refusal(
              UNSUPPORTED,
              "an xs:element whose xs:complexType holds neither xs:sequence nor xs:attribute is"
                  + " outside the XSD the reader reads",
              open.element().start));
    }
  }

  @Override
  public void characters(char[] ch, int start, int length) {
    if (skipped == 0 && !new String(ch, start, length).isBlank()) {
      refuse(refusal(UNSUPPORTED, "text inside a schema is outside the XSD the reader reads"));
    }
  }

  /**
   * The name a {@code type} or {@code base} attribute gives. A built-in type must be a simple type
   * of {@link BuiltInTypes}; any other name is added to {@code uses}, to be found in the bundle.
   */
  private QName typeName(String value, List<NameUse> uses, Position at) throws Refusal {
    QName name = qualified(value);
    if (XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(name.getNamespaceURI())) {
      if (BuiltInTypes.valueType(name.getLocalPart()).isEmpty()) {
        throw refusal(UNSUPPORTED, "the type " + value + " is not a built-in simple type");
      }
    } else {
      uses.add(new NameUse(name, at));
    }
    return name;
  }

  /** A QName attribute value, its prefix bound by the namespaces in scope. */
  private QName qualified(String value) throws Refusal {
    String[] name = namespaces.processName(value, new String[3], false);
    if (name == null) {
      throw refusal(UNSUPPORTED, "the prefix of " + value + " is not declared");
    }
    return new QName(name[0], name[1]);
  }

  /** A global declaration's name, in the file's target namespace. */
  private QName global(String name) {
    return new QName(schema.targetNamespace, name);
  }

  private void checkOccurrence(String min, String max) throws Refusal {
    String minText = min == null ? "1" : min;
    String maxText = max == null ? "1" : max;
    if (!COUNT.matcher(minText).matches()) {
      throw refusal(INVALID, "minOccurs=\"" + min + "\" is not a non-negative integer");
    }
    if (!maxText.equals("unbounded") && !COUNT.matcher(maxText).matches()) {
      throw refusal(
          INVALID, "maxOccurs=\"" + max + "\" is neither a non-negative integer nor unbounded");
    }
    if (!maxText.equals("unbounded") && Long.parseLong(minText) > Long.parseLong(maxText)) {
      throw refusal(INVALID, "minOccurs=\"" + min + "\" is greater than maxOccurs=\"" + max + "\"");
    }
  }

  private void checkValue(Attributes attributes, String name, Pattern allowed) throws Refusal {
    String value = attributes.getValue("", name);
    if (value != null && !allowed.matcher(value).matches()) {
      throw refusal(UNSUPPORTED, name + "=\"" + value + "\" is outside the XSD the reader reads");
    }
  }

  private Position position() {
    return new Position(locator.getLineNumber(), locator.getColumnNumber());
  }

  private Refusal refusal(String code, String message) {
    return new Refusal(code, message, position());
  }

  private void refuse(Refusal refusal) {
    errors.add(
        new StructureLoadException(
            refusal.code,
            schema.name,
            refusal.at.line(),
            refusal.at.column(),
            refusal.getMessage()));
  }
}
