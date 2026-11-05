package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.StructureType;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.importer.StructureLoadException;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import javax.xml.XMLConstants;
import javax.xml.namespace.QName;
import org.apache.ws.commons.schema.XmlSchemaAttribute;
import org.apache.ws.commons.schema.XmlSchemaAttributeOrGroupRef;
import org.apache.ws.commons.schema.XmlSchemaCollection;
import org.apache.ws.commons.schema.XmlSchemaComplexType;
import org.apache.ws.commons.schema.XmlSchemaElement;
import org.apache.ws.commons.schema.XmlSchemaSequence;
import org.apache.ws.commons.schema.XmlSchemaSequenceMember;
import org.apache.ws.commons.schema.XmlSchemaSimpleType;
import org.apache.ws.commons.schema.XmlSchemaSimpleTypeRestriction;
import org.apache.ws.commons.schema.XmlSchemaUse;
import org.xml.sax.InputSource;

/**
 * Reads the XSD files of a schema bundle into one structure, with Apache XmlSchema (ADR-0008). The
 * SAX pass ({@link XsdSubsetCheck}) and the checks across the bundle ({@link BundleCheck}) run
 * first and give every load error its position; XmlSchema reads only a bundle that has none.
 */
public final class XsdReader {

  private final XmlSchemaCollection collection;
  private final Map<String, StructureType> types = new HashMap<>();

  private XsdReader(XmlSchemaCollection collection) {
    this.collection = collection;
  }

  /**
   * @param files the bundle's files, in bundle order
   * @param contents the bytes of each file the host's resolver read, by its name in {@code files}
   * @param errors the load errors so far, of files the resolver did not read; the read adds its own
   * @throws StructureLoadException with every load error, files in bundle order and each file in
   *     document order
   */
  public static Structure read(
      List<String> files,
      Map<String, byte[]> contents,
      List<StructureLoadException> errors,
      QName root)
      throws StructureLoadException {
    List<SchemaFile> schemas = new ArrayList<>();
    List<Consumer<XmlSchemaCollection>> reads = new ArrayList<>();
    for (String file : files) {
      byte[] content = contents.get(file);
      // a file the resolver did not read declares what is unknown, in a namespace unknown
      schemas.add(
          content == null ? new SchemaFile(file) : XsdSubsetCheck.check(file, content, errors));
      reads.add(document(file, content));
    }
    return read(
        files,
        schemas,
        errors,
        root,
        "the schema bundle declares no global element " + BundleCheck.eqName(root),
        reads);
  }

  /** XmlSchema's read of a whole XSD file. */
  static Consumer<XmlSchemaCollection> document(String file, byte[] content) {
    return collection -> {
      InputSource source = new InputSource(new ByteArrayInputStream(content));
      // the bundle name tells apart two files of one target namespace, such as an include's
      source.setSystemId(file);
      collection.read(source);
    };
  }

  /**
   * Checks the bundle across its files, then reads it with XmlSchema when it has no load error.
   *
   * @param schemas what the SAX passes read, every file's in bundle order
   * @param root the root element, or null when none is found
   * @param missing the message of {@code schema-root-not-found}
   * @param reads XmlSchema's read of each file, in bundle order; run only when there is no error
   */
  static Structure read(
      List<String> files,
      List<SchemaFile> schemas,
      List<StructureLoadException> errors,
      QName root,
      String missing,
      List<Consumer<XmlSchemaCollection>> reads)
      throws StructureLoadException {
    BundleCheck.check(files, schemas, root, missing, errors);
    if (!errors.isEmpty()) {
      List<StructureLoadException> ordered = new ArrayList<>(errors);
      ordered.sort(
          Comparator.comparingInt((StructureLoadException e) -> files.indexOf(e.file()))
              .thenComparingInt(StructureLoadException::line)
              .thenComparingInt(StructureLoadException::column));
      throw new StructureLoadException(ordered);
    }

    XmlSchemaCollection collection = new XmlSchemaCollection();
    // XmlSchema opens no file: its resolver declines every schemaLocation (ADR-0014 "Reference
    // resolver shape"), and a declined one is looked up among the schemas already read. Every
    // bundle file is read below, so every name resolves across the collection.
    collection.setSchemaResolver((namespace, schemaLocation, baseUri) -> null);
    reads.forEach(read -> read.accept(collection));
    XmlSchemaElement element = collection.getElementByQName(root);
    // a global element is always qualified; XmlSchema's getWireName() drops its namespace
    // (observed)
    FieldPath.Step rootStep = step(FieldKind.ELEMENT, element.getQName());
    XsdReader reader = new XsdReader(collection);
    Field rootField = reader.field(rootStep, new Occurrence(1, 1), element, "/" + rootStep);
    return new Structure(rootField, reader.types);
  }

  /** The field of a local element or an element reference inside the type {@code owner}. */
  private Field field(String owner, XmlSchemaElement particle) {
    XmlSchemaElement declaration = particle.isRef() ? particle.getRef().getTarget() : particle;
    // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
    FieldPath.Step step =
        step(FieldKind.ELEMENT, particle.isRef() ? declaration.getQName() : particle.getWireName());
    // the subset has no sequence occurrence, so the effective occurrence is the particle's own;
    // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
    Occurrence occurrence = new Occurrence(particle.getMinOccurs(), particle.getMaxOccurs());
    String base = declaration.isTopLevel() ? "/" + step : owner + "/" + step;
    return field(step, occurrence, declaration, base);
  }

  /**
   * The field of an element declaration. A leaf names a simple type; a structure field has a named
   * complex type or an anonymous one.
   *
   * @param base the id of the element's anonymous complex type, before any {@code #n}: the field
   *     path of a global element, otherwise its owner's id and its step
   */
  private Field field(
      FieldPath.Step step, Occurrence occurrence, XmlSchemaElement declaration, String base) {
    QName typeName = declaration.getSchemaTypeName();
    if (typeName == null) {
      XmlSchemaComplexType anonymous = (XmlSchemaComplexType) declaration.getSchemaType();
      String id = declaration.isTopLevel() ? shared(base, anonymous) : local(base, anonymous);
      return structureField(step, occurrence, id);
    }
    if (!XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(typeName.getNamespaceURI())
        && collection.getTypeByQName(typeName) instanceof XmlSchemaComplexType named) {
      return structureField(step, occurrence, shared(BundleCheck.eqName(typeName), named));
    }
    return new Field(
        step,
        occurrence,
        Optional.of(valueType(typeName)),
        declaration.isNillable(),
        Optional.empty());
  }

  private static Field structureField(FieldPath.Step step, Occurrence occurrence, String type) {
    return new Field(step, occurrence, Optional.empty(), false, Optional.of(type));
  }

  /**
   * The id of a type every use shares: a named complex type ({@code Q{ns}local}) or a global
   * element's anonymous one (its field path). It is reserved before its fields are read, so a
   * recursive type refers to itself and is never expanded (ADR-0008).
   */
  private String shared(String id, XmlSchemaComplexType complexType) {
    if (!types.containsKey(id)) {
      types.put(id, null);
      types.put(id, new StructureType(id, fields(id, complexType)));
    }
    return id;
  }

  /**
   * The id of a local element's anonymous complex type: {@code base}, with {@code #2}, {@code #3} …
   * for each further sibling structure field with the same step (ADR-0007 refuses those only when a
   * mapping uses them, so they load).
   */
  private String local(String base, XmlSchemaComplexType complexType) {
    List<Field> fields = fields(base, complexType);
    String id = base;
    for (int n = 2; types.containsKey(id); n++) {
      id = base + "#" + n;
    }
    types.put(id, new StructureType(id, fields));
    return id;
  }

  /** The fields of a complex type: attributes first, then the elements of its sequence. */
  private List<Field> fields(String owner, XmlSchemaComplexType complexType) {
    List<Field> fields = new ArrayList<>();
    // the subset check allows no attribute reference or group
    for (XmlSchemaAttributeOrGroupRef member : complexType.getAttributes()) {
      XmlSchemaAttribute attribute = (XmlSchemaAttribute) member;
      boolean required = attribute.getUse() == XmlSchemaUse.REQUIRED;
      fields.add(
          new Field(
              step(FieldKind.ATTRIBUTE, attribute.getWireName()),
              new Occurrence(required ? 1 : 0, 1),
              Optional.of(valueType(attribute.getSchemaTypeName())),
              false,
              Optional.empty()));
    }
    XmlSchemaSequence sequence = (XmlSchemaSequence) complexType.getParticle();
    List<XmlSchemaSequenceMember> members = sequence == null ? List.of() : sequence.getItems();
    for (XmlSchemaSequenceMember member : members) {
      // an xs:any has no effect (ADR-0008)
      if (member instanceof XmlSchemaElement element) {
        fields.add(field(owner, element));
      }
    }
    return fields;
  }

  /**
   * The value type of a simple type by its built-in ancestry (ADR-0008). A list is one value and a
   * union a string. The bundle check has made sure that a named type is declared and derives from a
   * built-in type of {@link BuiltInTypes}.
   */
  private ValueType valueType(QName type) {
    if (XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(type.getNamespaceURI())) {
      return BuiltInTypes.valueType(type.getLocalPart()).orElseThrow();
    }
    XmlSchemaSimpleType simple = (XmlSchemaSimpleType) collection.getTypeByQName(type);
    return simple.getContent() instanceof XmlSchemaSimpleTypeRestriction restriction
        ? valueType(restriction.getBaseTypeName())
        : ValueType.STRING;
  }

  private static FieldPath.Step step(FieldKind kind, QName name) {
    return new FieldPath.Step(kind, name.getNamespaceURI(), name.getLocalPart());
  }
}
