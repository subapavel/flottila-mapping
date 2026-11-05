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
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import javax.xml.XMLConstants;
import javax.xml.namespace.QName;
import org.apache.ws.commons.schema.XmlSchemaAll;
import org.apache.ws.commons.schema.XmlSchemaAny;
import org.apache.ws.commons.schema.XmlSchemaAttribute;
import org.apache.ws.commons.schema.XmlSchemaAttributeGroupRef;
import org.apache.ws.commons.schema.XmlSchemaChoice;
import org.apache.ws.commons.schema.XmlSchemaCollection;
import org.apache.ws.commons.schema.XmlSchemaComplexType;
import org.apache.ws.commons.schema.XmlSchemaElement;
import org.apache.ws.commons.schema.XmlSchemaGroupRef;
import org.apache.ws.commons.schema.XmlSchemaParticle;
import org.apache.ws.commons.schema.XmlSchemaSequence;
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
   * The particles of a complex type or a group and the file that declares it, which a refusal among
   * them names (#92, #94).
   *
   * @param particles its content particle, if it has one, or a group's model group
   */
  private record Declared(String file, List<Particle> particles) {}

  /** An element field and where it is declared: the file and the end of its start tag. */
  private record Placed(Field field, String file, Position at) {}

  /** The particles of each global element's anonymous complex type, across the bundle. */
  private final Map<QName, Declared> elementParticles = new HashMap<>();

  /** The particles of each named complex type, across the bundle. */
  private final Map<QName, Declared> complexTypeParticles = new HashMap<>();

  /** The model group of each named group, across the bundle (#94). */
  private final Map<QName, Declared> groupParticles = new HashMap<>();

  /**
   * The id of each local element's anonymous complex type read so far, by its declaration (#94): an
   * element declared in a group is read at every use of the group, and every use shares its type.
   */
  private final Map<XmlSchemaElement, String> anonymousIds = new IdentityHashMap<>();

  private XsdReader(XmlSchemaCollection collection, List<SchemaFile> schemas) {
    this.collection = collection;
    // a refusal names the file that declares the type, whichever file declares the root (ADR-0008)
    for (SchemaFile schema : schemas) {
      schema.elementParticles.forEach(
          (name, particles) -> elementParticles.put(name, new Declared(schema.name, particles)));
      schema.complexTypeParticles.forEach(
          (name, particles) ->
              complexTypeParticles.put(name, new Declared(schema.name, particles)));
      schema.groupParticles.forEach(
          (name, particles) -> groupParticles.put(name, new Declared(schema.name, particles)));
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
    XsdReader reader = new XsdReader(collection, schemas);
    Field rootField =
        reader.field(rootStep, new Occurrence(1, 1), element, "/" + rootStep, Optional.empty());
    return new Structure(rootField, reader.types);
  }

  /**
   * The field of a local element or an element reference inside the type or group {@code owner},
   * declared at {@code at} in {@code file}, with its effective occurrence.
   */
  private Field field(
      String owner, XmlSchemaElement particle, String file, Particle at, Occurrence occurrence) {
    XmlSchemaElement declaration = particle.isRef() ? particle.getRef().getTarget() : particle;
    // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
    FieldPath.Step step =
        step(FieldKind.ELEMENT, particle.isRef() ? declaration.getQName() : particle.getWireName());
    String base = declaration.isTopLevel() ? "/" + step : owner + "/" + step;
    return field(
        step, occurrence, declaration, base, Optional.of(new Declared(file, at.content())));
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
              : local(base, declaration, anonymous, local.orElseThrow());
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
   * mapping uses them, so they load as refused fields, #92). It is reserved before its fields are
   * read, and a declaration read again, in a group used twice or that refers to itself through the
   * element, gets the id it got first, so the recursion is never expanded (#94).
   */
  private String local(
      String base,
      XmlSchemaElement declaration,
      XmlSchemaComplexType complexType,
      Declared declared) {
    String known = anonymousIds.get(declaration);
    if (known != null) {
      return known;
    }
    String id = base;
    for (int n = 2; types.containsKey(id); n++) {
      id = base + "#" + n;
    }
    anonymousIds.put(declaration, id);
    types.put(id, null);
    types.put(id, new StructureType(id, fields(base, complexType, declared)));
    return id;
  }

  /**
   * The fields of a complex type: attributes first, an attribute group reference's inlined where it
   * stands, then the elements of its content particle, which {@code declared} holds.
   */
  private List<Field> fields(String owner, XmlSchemaComplexType complexType, Declared declared) {
    List<Field> fields = new ArrayList<>();
    attributes(complexType.getAttributes(), fields);
    List<Placed> elements = new ArrayList<>();
    XmlSchemaParticle content = complexType.getParticle();
    // a complex type of attributes only has no content particle
    if (content != null) {
      particle(
          owner,
          content,
          declared.file(),
          declared.particles().getFirst(),
          new Occurrence(1, 1),
          Optional.empty(),
          Optional.empty(),
          elements);
    }
    fields.addAll(refused(elements));
    return fields;
  }

  /**
   * Adds the attribute fields of {@code members}, attributes and attribute group references, to
   * {@code fields} in document order, each reference's attribute group inlined (ADR-0008, #94). The
   * subset check allows no attribute reference.
   */
  private void attributes(List<?> members, List<Field> fields) {
    for (Object member : members) {
      if (member instanceof XmlSchemaAttributeGroupRef reference) {
        attributes(reference.getRef().getTarget().getAttributes(), fields);
      } else {
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
    }
  }

  /**
   * Adds the element fields of {@code particle}, declared at {@code at} in {@code file}, to {@code
   * elements} in document order (ADR-0008 "XSD", #94): an element's own field; the members of a
   * sequence, a choice or an all, the branches of a choice as siblings; and a group reference's
   * group, inlined. A field's effective occurrence is the product of its own occurrence and every
   * enclosing particle's, and below a choice of two or more branches its minimum is 0.
   *
   * <p>Streamed output writes all occurrences of one field together, so a group of two or more
   * particles that repeats cannot be written, unless it is a choice of single elements. Every field
   * below such a group carries interleaved-target-group, at the nearest enclosing particle, the
   * group itself among them, whose maxOccurs is above 1.
   *
   * @param owner the id of the type the fields belong to, or a group's EQName inside a group: a
   *     local element's anonymous type is named after it
   * @param enclosing the product of the enclosing particles' occurrences
   * @param repeated the refusal at the nearest enclosing particle whose maxOccurs is above 1, if
   *     any
   * @param interleaved the refusal of every field below, once an enclosing group repeats that
   *     streamed output cannot write
   */
  private void particle(
      String owner,
      XmlSchemaParticle particle,
      String file,
      Particle at,
      Occurrence enclosing,
      Optional<Refusal> repeated,
      Optional<Refusal> interleaved,
      List<Placed> elements) {
    // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
    Occurrence occurrence =
        new Occurrence(
            times(enclosing.min(), particle.getMinOccurs()),
            times(enclosing.max(), particle.getMaxOccurs()));
    if (particle instanceof XmlSchemaElement element) {
      Field field = field(owner, element, file, at, occurrence);
      elements.add(new Placed(interleaved.map(field::withRefusal).orElse(field), file, at.at()));
      return;
    }
    Optional<Refusal> here =
        particle.getMaxOccurs() > 1
            ? Optional.of(
                new Refusal(
                    Refusal.Reason.INTERLEAVED_TARGET_GROUP,
                    file,
                    at.at().line(),
                    at.at().column()))
            : repeated;
    if (particle instanceof XmlSchemaGroupRef reference) {
      QName name = reference.getRefName();
      Declared group = groupParticles.get(name);
      particle(
          BundleCheck.eqName(name),
          collection.getGroupByQName(name).getParticle(),
          group.file(),
          group.particles().getFirst(),
          occurrence,
          here,
          interleaved,
          elements);
      return;
    }
    boolean choice = particle instanceof XmlSchemaChoice;
    List<?> members =
        particle instanceof XmlSchemaSequence sequence
            ? sequence.getItems()
            : choice
                ? ((XmlSchemaChoice) particle).getItems()
                : ((XmlSchemaAll) particle).getItems();
    List<XmlSchemaParticle> items = new ArrayList<>();
    for (Object member : members) {
      // an xs:any has no effect (ADR-0008), and the subset check records no particle for it
      if (!(member instanceof XmlSchemaAny)) {
        items.add((XmlSchemaParticle) member);
      }
    }
    boolean interleaves =
        occurrence.max() > 1
            && items.size() > 1
            && !(choice && items.stream().allMatch(XmlSchemaElement.class::isInstance));
    // an xs:any is a branch too
    Occurrence member =
        choice && members.size() > 1 ? new Occurrence(0, occurrence.max()) : occurrence;
    for (int i = 0; i < items.size(); i++) {
      particle(
          owner,
          items.get(i),
          file,
          at.content().get(i),
          member,
          here,
          interleaves ? here : interleaved,
          elements);
    }
  }

  /** {@code a} times {@code b}, two occurrence bounds; a product beyond a long is unbounded. */
  private static long times(long a, long b) {
    return b != 0 && a > Occurrence.UNBOUNDED / b ? Occurrence.UNBOUNDED : a * b;
  }

  /**
   * {@code elements}, in output order, with each one whose step occurs twice or more refused with
   * ambiguous-field-path at that step's second declaration, in the file that declares it (ADR-0008
   * Shape (#92)). A field carries at most one refusal: ambiguous-field-path, which holds in a
   * source too, replaces interleaved-target-group (#94). Attributes are not looked at: two of one
   * name in one complex type make the schema invalid (XSD 1.1 Part 1, ct-props-correct.4).
   */
  private static List<Field> refused(List<Placed> elements) {
    Set<FieldPath.Step> seen = new HashSet<>();
    Map<FieldPath.Step, Placed> second = new HashMap<>();
    for (Placed element : elements) {
      FieldPath.Step step = element.field().step();
      if (!seen.add(step)) {
        second.putIfAbsent(step, element);
      }
    }
    List<Field> fields = new ArrayList<>();
    for (Placed element : elements) {
      Field field = element.field();
      Placed at = second.get(field.step());
      fields.add(
          at == null
              ? field
              : field.withRefusal(
                  new Refusal(
                      Refusal.Reason.AMBIGUOUS_FIELD_PATH,
                      at.file(),
                      at.at().line(),
                      at.at().column())));
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
