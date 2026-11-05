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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import javax.xml.XMLConstants;
import javax.xml.namespace.QName;
import org.apache.ws.commons.schema.XmlSchemaAttribute;
import org.apache.ws.commons.schema.XmlSchemaAttributeOrGroupRef;
import org.apache.ws.commons.schema.XmlSchemaCollection;
import org.apache.ws.commons.schema.XmlSchemaComplexContent;
import org.apache.ws.commons.schema.XmlSchemaComplexContentExtension;
import org.apache.ws.commons.schema.XmlSchemaComplexContentRestriction;
import org.apache.ws.commons.schema.XmlSchemaComplexType;
import org.apache.ws.commons.schema.XmlSchemaContent;
import org.apache.ws.commons.schema.XmlSchemaElement;
import org.apache.ws.commons.schema.XmlSchemaParticle;
import org.apache.ws.commons.schema.XmlSchemaSequence;
import org.apache.ws.commons.schema.XmlSchemaSequenceMember;
import org.apache.ws.commons.schema.XmlSchemaSimpleContent;
import org.apache.ws.commons.schema.XmlSchemaSimpleContentExtension;
import org.apache.ws.commons.schema.XmlSchemaSimpleContentRestriction;
import org.apache.ws.commons.schema.XmlSchemaSimpleType;
import org.apache.ws.commons.schema.XmlSchemaSimpleTypeRestriction;
import org.apache.ws.commons.schema.XmlSchemaUse;
import org.xml.sax.InputSource;

/**
 * Reads the XSD files of a schema bundle into one structure, with Apache XmlSchema (ADR-0008). The
 * SAX pass ({@link XsdSubsetCheck}) and the checks across the bundle ({@link BundleCheck}) run
 * first and give every load error its position; XmlSchema reads only a bundle that has none.
 *
 * <p>Derivation (#95): an extension gives the base content and then its own, attributes first, and
 * a restriction gives its own content. An element of a complex type with simple content is a leaf
 * whose attributes are fields of their own. A reference to the head of a substitution group is a
 * choice of its non-abstract members. An abstract element, or an element of an abstract type,
 * carries the refusal {@code abstract-target-element} at the abstract declaration.
 */
public final class XsdReader {

  /** Namespace first, then local name. */
  private static final Comparator<QName> BY_QNAME =
      Comparator.comparing(QName::getNamespaceURI).thenComparing(QName::getLocalPart);

  private final XmlSchemaCollection collection;
  private final Map<String, StructureType> types = new HashMap<>();

  /**
   * The element particles of a complex type and the file that declares it, which a refusal among
   * them names (#92).
   *
   * @param particles the particles of its sequence, in document order
   */
  private record Declared(String file, List<Particle> particles) {}

  /** Where the declaration of an element field ends its start tag, in which file. */
  private record Start(String file, Position at) {}

  /**
   * The element fields a complex type holds, in output order before same-step siblings are refused,
   * and where each is declared.
   */
  private record Content(List<Field> elements, List<Start> starts) {}

  /**
   * How a complex type is derived: its base, null when it is not derived, its own attribute
   * declarations, and whether it is a restriction.
   */
  private record Derivation(
      QName base, List<XmlSchemaAttributeOrGroupRef> attributes, boolean restriction) {}

  /** The particles of each global element's anonymous complex type, across the bundle. */
  private final Map<QName, Declared> elementParticles = new HashMap<>();

  /** The particles of each named complex type, across the bundle. */
  private final Map<QName, Declared> complexTypeParticles = new HashMap<>();

  /** The refusal of each abstract global element, at its declaration (#95). */
  private final Map<QName, Refusal> abstractElements = new HashMap<>();

  /** The refusal of each abstract named complex type, at its declaration (#95). */
  private final Map<QName, Refusal> abstractTypes = new HashMap<>();

  /** The elements whose substitution group each head is, across the bundle (#95). */
  private final Map<QName, List<QName>> members = new HashMap<>();

  private XsdReader(XmlSchemaCollection collection, List<SchemaFile> schemas) {
    this.collection = collection;
    // a refusal names the file that declares the type, whichever file declares the root (ADR-0008)
    for (SchemaFile schema : schemas) {
      schema.elementParticles.forEach(
          (name, particles) -> elementParticles.put(name, new Declared(schema.name, particles)));
      schema.complexTypeParticles.forEach(
          (name, particles) ->
              complexTypeParticles.put(name, new Declared(schema.name, particles)));
      // an abstract declaration's refusal stands in its declaring file (ADR-0008)
      schema.abstractElements.forEach(
          (name, at) -> abstractElements.put(name, abstractTarget(schema.name, at)));
      schema.abstractTypes.forEach(
          (name, at) -> abstractTypes.put(name, abstractTarget(schema.name, at)));
      schema.substitutions.forEach(
          (member, head) ->
              members.computeIfAbsent(head.name(), h -> new ArrayList<>()).add(member));
    }
  }

  private static Refusal abstractTarget(String file, Position at) {
    return new Refusal(Refusal.Reason.ABSTRACT_TARGET_ELEMENT, file, at.line(), at.column());
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

  /** The field of a local element inside the type {@code owner}, declared at {@code at}. */
  private Field localField(String owner, XmlSchemaElement particle, String file, Particle at) {
    // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
    FieldPath.Step step = step(FieldKind.ELEMENT, particle.getWireName());
    // the subset has no sequence occurrence, so the effective occurrence is the particle's own;
    // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
    Occurrence occurrence = new Occurrence(particle.getMinOccurs(), particle.getMaxOccurs());
    return field(
        step, occurrence, particle, owner + "/" + step, Optional.of(new Declared(file, at.type())));
  }

  /**
   * The fields of an element reference: the referenced element's, or, when it heads a substitution
   * group, one per non-abstract element of the group, transitively and across namespaces, the head
   * first and then by QName, each a branch of a choice (ADR-0008). An abstract head without a
   * non-abstract member stays, refused in a target.
   */
  private List<Field> referenced(XmlSchemaElement particle) {
    QName head = particle.getRef().getTargetQName();
    List<QName> substitutes = new ArrayList<>();
    addMembers(head, substitutes);
    substitutes.sort(BY_QNAME);
    List<QName> branches = new ArrayList<>(List.of(head));
    branches.addAll(substitutes);
    branches.removeIf(abstractElements::containsKey);
    if (branches.isEmpty()) {
      branches.add(head);
    }
    // a branch of a choice with two or more branches has minimum 0 (ADR-0008)
    Occurrence occurrence =
        new Occurrence(branches.size() > 1 ? 0 : particle.getMinOccurs(), particle.getMaxOccurs());
    List<Field> fields = new ArrayList<>();
    for (QName name : branches) {
      // a global element is always qualified, and its anonymous type's id is its field path
      FieldPath.Step step = step(FieldKind.ELEMENT, name);
      fields.add(
          field(
              step, occurrence, collection.getElementByQName(name), "/" + step, Optional.empty()));
    }
    return fields;
  }

  /**
   * Adds the elements whose substitution group {@code head} is to {@code found}, transitively. The
   * bundle check has refused an element in its own substitution group, so this ends.
   */
  private void addMembers(QName head, List<QName> found) {
    for (QName member : members.getOrDefault(head, List.of())) {
      found.add(member);
      addMembers(member, found);
    }
  }

  /**
   * The field of an element declaration. A leaf names a simple type, or a complex type with simple
   * content, whose attributes are its child fields; a structure field has a named complex type or
   * an anonymous one.
   *
   * @param base the id of a local element's anonymous complex type, before any {@code #n}: its
   *     owner's id and its step; not read for a global element, whose anonymous type's id is its
   *     field path
   * @param local the particles of a local element's anonymous complex type, and the file that
   *     declares it; not read for a global element, whose type's particles are looked up by name
   */
  private Field field(
      FieldPath.Step step,
      Occurrence occurrence,
      XmlSchemaElement declaration,
      String base,
      Optional<Declared> local) {
    XmlSchemaElement typed = typed(declaration);
    QName typeName = typed.getSchemaTypeName();
    Optional<Refusal> refusal = abstractTarget(declaration, typeName);
    XmlSchemaComplexType complexType =
        typeName == null ? (XmlSchemaComplexType) typed.getSchemaType() : complex(typeName);
    if (complexType == null) {
      return new Field(
          step,
          occurrence,
          Optional.of(valueType(typeName)),
          declaration.isNillable(),
          Optional.empty(),
          refusal);
    }
    String id;
    if (typeName != null) {
      id = shared(BundleCheck.eqName(typeName), complexType, complexTypeParticles.get(typeName));
    } else if (typed.isTopLevel()) {
      // a global element's anonymous type, its own or its head's, has that element's field path
      id =
          shared(
              "/" + step(FieldKind.ELEMENT, typed.getQName()),
              complexType,
              elementParticles.get(typed.getQName()));
    } else {
      id = local(base, complexType, local.orElseThrow());
    }
    // simple content makes a leaf, whose attributes are fields of their own (ADR-0006 since #102)
    Optional<ValueType> valueType = simpleContent(complexType);
    return new Field(
        step,
        occurrence,
        valueType,
        valueType.isPresent() && declaration.isNillable(),
        Optional.of(id),
        refusal);
  }

  /**
   * The refusal of an abstract global element, or else of an element of an abstract named type,
   * each at its abstract declaration (#95). A local element is never abstract.
   */
  private Optional<Refusal> abstractTarget(XmlSchemaElement declaration, QName typeName) {
    Refusal own = declaration.isTopLevel() ? abstractElements.get(declaration.getQName()) : null;
    if (own != null || typeName == null) {
      return Optional.ofNullable(own);
    }
    return Optional.ofNullable(abstractTypes.get(typeName));
  }

  /**
   * The declaration whose type {@code declaration} has: itself, or for a substitution-group member
   * with neither a type nor an anonymous one, its head's, transitively (XSD 1.1 Part 1, 3.3.2.1).
   * The subset check refuses any other element without a type, and the bundle check an element in
   * its own substitution group, so this ends.
   */
  private XmlSchemaElement typed(XmlSchemaElement declaration) {
    XmlSchemaElement typed = declaration;
    while (typed.getSchemaTypeName() == null && typed.getSchemaType() == null) {
      typed = collection.getElementByQName(typed.getSubstitutionGroup());
    }
    return typed;
  }

  /** The named complex type {@code name}, or null for a simple type, built-in or named. */
  private XmlSchemaComplexType complex(QName name) {
    return !XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(name.getNamespaceURI())
            && collection.getTypeByQName(name) instanceof XmlSchemaComplexType named
        ? named
        : null;
  }

  /**
   * The value type of a complex type with simple content, by the built-in ancestry of its base;
   * empty for a complex type with element content. A restriction keeps its base's value type: its
   * facets are not validated (ADR-0004).
   */
  private Optional<ValueType> simpleContent(XmlSchemaComplexType complexType) {
    if (!(complexType.getContentModel() instanceof XmlSchemaSimpleContent)) {
      return Optional.empty();
    }
    QName base = derivation(complexType).base();
    XmlSchemaComplexType complexBase = complex(base);
    return complexBase == null ? Optional.of(valueType(base)) : simpleContent(complexBase);
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
   * The fields of a complex type: attributes first, then elements, each in output order, with
   * same-step element siblings refused.
   */
  private List<Field> fields(String owner, XmlSchemaComplexType complexType, Declared declared) {
    Content content = content(owner, complexType, declared);
    List<Field> fields = new ArrayList<>(attributes(complexType).values());
    fields.addAll(refused(content.elements(), content.starts()));
    return fields;
  }

  /**
   * How {@code complexType} is derived. The subset check allows no other content than an extension
   * or restriction of complex or simple content, so the last case is a simple-content restriction.
   */
  private static Derivation derivation(XmlSchemaComplexType complexType) {
    XmlSchemaContent content =
        complexType.getContentModel() == null ? null : complexType.getContentModel().getContent();
    return switch (content) {
      case null -> new Derivation(null, complexType.getAttributes(), false);
      case XmlSchemaComplexContentExtension extension ->
          new Derivation(extension.getBaseTypeName(), extension.getAttributes(), false);
      case XmlSchemaComplexContentRestriction restriction ->
          new Derivation(restriction.getBaseTypeName(), restriction.getAttributes(), true);
      case XmlSchemaSimpleContentExtension extension ->
          new Derivation(extension.getBaseTypeName(), extension.getAttributes(), false);
      default -> {
        XmlSchemaSimpleContentRestriction restriction = (XmlSchemaSimpleContentRestriction) content;
        yield new Derivation(restriction.getBaseTypeName(), restriction.getAttributes(), true);
      }
    };
  }

  /**
   * The attribute fields of a complex type, by step in output order. A derived type has its base's
   * first, a simple type's none (XSD 1.1 Part 1, 3.4.2): an extension adds its own after them; a
   * restriction's own declaration of one replaces it where it stands, and its {@code
   * use="prohibited"} drops it. A prohibited attribute is no field in any type, and in an extension
   * it drops nothing.
   */
  private Map<FieldPath.Step, Field> attributes(XmlSchemaComplexType complexType) {
    Derivation derivation = derivation(complexType);
    XmlSchemaComplexType complexBase =
        derivation.base() == null ? null : complex(derivation.base());
    Map<FieldPath.Step, Field> attributes =
        complexBase == null ? new LinkedHashMap<>() : attributes(complexBase);
    // the subset check allows no attribute reference or group
    for (XmlSchemaAttributeOrGroupRef member : derivation.attributes()) {
      XmlSchemaAttribute attribute = (XmlSchemaAttribute) member;
      FieldPath.Step step = step(FieldKind.ATTRIBUTE, attribute.getWireName());
      if (attribute.getUse() != XmlSchemaUse.PROHIBITED) {
        boolean required = attribute.getUse() == XmlSchemaUse.REQUIRED;
        attributes.put(
            step,
            new Field(
                step,
                new Occurrence(required ? 1 : 0, 1),
                Optional.of(valueType(attribute.getSchemaTypeName())),
                false,
                Optional.empty()));
      } else if (derivation.restriction()) {
        attributes.remove(step);
      }
    }
    return attributes;
  }

  /**
   * The element fields of a complex type, whose own particles {@code declared} holds in document
   * order. An extension of complex content gives its base's, read with the base's own particles,
   * and then its own; a restriction gives its own particles (ADR-0008); simple content gives none.
   * The element fields of the base are new fields of {@code owner}, whose anonymous types are
   * {@code owner}'s.
   */
  private Content content(String owner, XmlSchemaComplexType complexType, Declared declared) {
    Content content = new Content(new ArrayList<>(), new ArrayList<>());
    XmlSchemaParticle particle;
    if (complexType.getContentModel() instanceof XmlSchemaComplexContent complexContent) {
      if (complexContent.getContent() instanceof XmlSchemaComplexContentExtension extension) {
        QName base = extension.getBaseTypeName();
        // the bundle check has made sure the base is a complex type with element content that
        // does not derive from itself
        content = content(owner, complex(base), complexTypeParticles.get(base));
        particle = extension.getParticle();
      } else {
        particle = ((XmlSchemaComplexContentRestriction) complexContent.getContent()).getParticle();
      }
    } else if (complexType.getContentModel() instanceof XmlSchemaSimpleContent) {
      particle = null;
    } else {
      particle = complexType.getParticle();
    }
    XmlSchemaSequence sequence = (XmlSchemaSequence) particle;
    List<XmlSchemaSequenceMember> items = sequence == null ? List.of() : sequence.getItems();
    int next = 0;
    for (XmlSchemaSequenceMember member : items) {
      // an xs:any has no effect (ADR-0008), and the subset check records no particle for it
      if (member instanceof XmlSchemaElement element) {
        Particle at = declared.particles().get(next++);
        List<Field> fields =
            element.isRef()
                ? referenced(element)
                : List.of(localField(owner, element, declared.file(), at));
        for (Field field : fields) {
          content.elements().add(field);
          content.starts().add(new Start(declared.file(), at.at()));
        }
      }
    }
    return content;
  }

  /**
   * {@code elements}, in output order, with each one whose step occurs twice or more refused with
   * ambiguous-field-path at that step's second declaration (ADR-0008 Shape (#92)), which replaces
   * an abstract-target-element refusal: a field carries at most one, and this one holds in a source
   * too. {@code starts} holds where each element's declaration ends its start tag; the branches of
   * a substitution group share their reference's. Attributes are not looked at: two of one name in
   * one complex type make the schema invalid (XSD 1.1 Part 1, ct-props-correct.4).
   */
  private static List<Field> refused(List<Field> elements, List<Start> starts) {
    Set<FieldPath.Step> seen = new HashSet<>();
    Map<FieldPath.Step, Start> second = new HashMap<>();
    for (int i = 0; i < elements.size(); i++) {
      FieldPath.Step step = elements.get(i).step();
      if (!seen.add(step)) {
        second.putIfAbsent(step, starts.get(i));
      }
    }
    List<Field> fields = new ArrayList<>();
    for (Field field : elements) {
      Start at = second.get(field.step());
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
                          Refusal.Reason.AMBIGUOUS_FIELD_PATH,
                          at.file(),
                          at.at().line(),
                          at.at().column()))));
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
