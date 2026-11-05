package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.Refusal;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.StructureType;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.importer.StructureLoadException;
import io.flottila.mapping.structure.importer.internal.SchemaFile.Particle;
import io.flottila.mapping.structure.importer.internal.SchemaFile.Position;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

  /**
   * The element particles of a complex type and the file a refusal among them names (#92).
   *
   * @param particles the particles of its sequence, in document order
   */
  private record Declared(String file, List<Particle> particles) {}

  /** The particles of each global element's anonymous complex type, across the bundle. */
  private final Map<QName, Declared> elementParticles = new HashMap<>();

  /** The particles of each named complex type, across the bundle. */
  private final Map<QName, Declared> complexTypeParticles = new HashMap<>();

  private XsdReader(XmlSchemaCollection collection, List<SchemaFile> schemas, QName root) {
    this.collection = collection;
    // as #92's one-file reader: every refusal names the file that declares the root
    String file =
        schemas.stream().filter(s -> s.elements.containsKey(root)).findFirst().orElseThrow().name;
    for (SchemaFile schema : schemas) {
      schema.elementParticles.forEach(
          (name, particles) -> elementParticles.put(name, new Declared(file, particles)));
      schema.complexTypeParticles.forEach(
          (name, particles) -> complexTypeParticles.put(name, new Declared(file, particles)));
    }
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
    for (String file : files) {
      byte[] content = contents.get(file);
      // a file the resolver did not read declares what is unknown, in a namespace unknown
      schemas.add(
          content == null ? new SchemaFile(file) : XsdSubsetCheck.check(file, content, errors));
    }
    BundleCheck.check(files, schemas, root, errors);
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
    for (Map.Entry<String, byte[]> file : contents.entrySet()) {
      InputSource source = new InputSource(new ByteArrayInputStream(file.getValue()));
      // the bundle name tells apart two files of one target namespace, such as an include's
      source.setSystemId(file.getKey());
      collection.read(source);
    }
    XmlSchemaElement element = collection.getElementByQName(root);
    // a global element is always qualified; XmlSchema's getWireName() drops its namespace
    // (observed)
    FieldPath.Step rootStep = step(FieldKind.ELEMENT, element.getQName());
    XsdReader reader = new XsdReader(collection, schemas, root);
    Field rootField =
        reader.field(rootStep, new Occurrence(1, 1), element, "/" + rootStep, Optional.empty());
    return new Structure(rootField, reader.types);
  }

  /**
   * The field of a local element or an element reference inside the type {@code owner}, declared at
   * {@code at} in {@code file}.
   */
  private Field field(String owner, XmlSchemaElement particle, String file, Particle at) {
    XmlSchemaElement declaration = particle.isRef() ? particle.getRef().getTarget() : particle;
    // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
    FieldPath.Step step =
        step(FieldKind.ELEMENT, particle.isRef() ? declaration.getQName() : particle.getWireName());
    // the subset has no sequence occurrence, so the effective occurrence is the particle's own;
    // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
    Occurrence occurrence = new Occurrence(particle.getMinOccurs(), particle.getMaxOccurs());
    String base = declaration.isTopLevel() ? "/" + step : owner + "/" + step;
    return field(step, occurrence, declaration, base, Optional.of(new Declared(file, at.type())));
  }

  /**
   * The field of an element declaration. A leaf names a simple type; a structure field has a named
   * complex type or an anonymous one.
   *
   * @param base the id of the element's anonymous complex type, before any {@code #n}: the field
   *     path of a global element, otherwise its owner's id and its step
   * @param local the particles of a local element's anonymous complex type, and the file that
   *     declares it; not read for a global element, whose type's particles are looked up by name
   */
  private Field field(
      FieldPath.Step step,
      Occurrence occurrence,
      XmlSchemaElement declaration,
      String base,
      Optional<Declared> local) {
    QName typeName = declaration.getSchemaTypeName();
    if (typeName == null) {
      XmlSchemaComplexType anonymous = (XmlSchemaComplexType) declaration.getSchemaType();
      String id =
          declaration.isTopLevel()
              ? shared(base, anonymous, elementParticles.get(declaration.getQName()))
              : local(base, anonymous, local.orElseThrow());
      return structureField(step, occurrence, id);
    }
    if (!XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(typeName.getNamespaceURI())
        && collection.getTypeByQName(typeName) instanceof XmlSchemaComplexType named) {
      return structureField(
          step,
          occurrence,
          shared(BundleCheck.eqName(typeName), named, complexTypeParticles.get(typeName)));
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
   * recursive type refers to itself and is never expanded (ADR-0008). Every use shares its refusals
   * too, at their positions in the file that declares it (#92).
   */
  private String shared(String id, XmlSchemaComplexType complexType, Declared declared) {
    if (!types.containsKey(id)) {
      types.put(id, null);
      types.put(id, new StructureType(id, fields(id, complexType, declared)));
    }
    return id;
  }

  /**
   * The id of a local element's anonymous complex type: {@code base}, with {@code #2}, {@code #3} …
   * for each further sibling structure field with the same step (ADR-0007 refuses those only when a
   * mapping uses them, so they load as refused fields, #92).
   */
  private String local(String base, XmlSchemaComplexType complexType, Declared declared) {
    List<Field> fields = fields(base, complexType, declared);
    String id = base;
    for (int n = 2; types.containsKey(id); n++) {
      id = base + "#" + n;
    }
    types.put(id, new StructureType(id, fields));
    return id;
  }

  /**
   * The fields of a complex type: attributes first, then the elements of its sequence, whose
   * particles {@code declared} holds in the same order.
   */
  private List<Field> fields(String owner, XmlSchemaComplexType complexType, Declared declared) {
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
    List<Field> elements = new ArrayList<>();
    List<Position> starts = new ArrayList<>();
    for (XmlSchemaSequenceMember member : members) {
      // an xs:any has no effect (ADR-0008), and the subset check records no particle for it
      if (member instanceof XmlSchemaElement element) {
        Particle at = declared.particles().get(elements.size());
        starts.add(at.at());
        elements.add(field(owner, element, declared.file(), at));
      }
    }
    fields.addAll(refused(declared.file(), elements, starts));
    return fields;
  }

  /**
   * {@code elements}, in output order, with each one whose step occurs twice or more refused with
   * ambiguous-field-path at that step's second declaration in {@code file} (ADR-0008 Shape (#92));
   * {@code starts} holds where each element's declaration ends its start tag. Attributes are not
   * looked at: two of one name in one complex type make the schema invalid (XSD 1.1 Part 1,
   * ct-props-correct.4).
   */
  private static List<Field> refused(String file, List<Field> elements, List<Position> starts) {
    Set<FieldPath.Step> seen = new HashSet<>();
    Map<FieldPath.Step, Position> second = new HashMap<>();
    for (int i = 0; i < elements.size(); i++) {
      FieldPath.Step step = elements.get(i).step();
      if (!seen.add(step)) {
        second.putIfAbsent(step, starts.get(i));
      }
    }
    List<Field> fields = new ArrayList<>();
    for (Field field : elements) {
      Position at = second.get(field.step());
      fields.add(
          at == null
              ? field
              : new Field(
                  field.step(),
                  field.occurrence(),
                  field.valueType(),
                  field.nillable(),
                  field.type(),
                  Optional.of(
                      new Refusal(
                          Refusal.Reason.AMBIGUOUS_FIELD_PATH, file, at.line(), at.column()))));
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
