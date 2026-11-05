package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.StructureType;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.importer.StructureImportDiagnostics;
import io.flottila.mapping.structure.importer.StructureLoadException;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.xml.namespace.QName;
import org.apache.ws.commons.schema.XmlSchema;
import org.apache.ws.commons.schema.XmlSchemaAttribute;
import org.apache.ws.commons.schema.XmlSchemaAttributeOrGroupRef;
import org.apache.ws.commons.schema.XmlSchemaCollection;
import org.apache.ws.commons.schema.XmlSchemaComplexType;
import org.apache.ws.commons.schema.XmlSchemaElement;
import org.apache.ws.commons.schema.XmlSchemaSequence;
import org.apache.ws.commons.schema.XmlSchemaSequenceMember;
import org.apache.ws.commons.schema.XmlSchemaUse;
import org.xml.sax.InputSource;

/** Reads one XSD file of the nested subset into a structure, with Apache XmlSchema (ADR-0008). */
public final class XsdReader {

  private XsdReader() {}

  /**
   * @param file the file as the schema bundle spells it: load errors name it, and XmlSchema takes
   *     it as the file's system id
   */
  public static Structure read(String file, byte[] content, QName root)
      throws StructureLoadException {
    XsdSubsetCheck.Position schemaTag = XsdSubsetCheck.check(file, content);
    XmlSchemaCollection collection = new XmlSchemaCollection();
    // XmlSchema opens no file: its resolver declines every schemaLocation (ADR-0014 "Reference
    // resolver shape"); a declined one is looked up among the schemas already read
    collection.setSchemaResolver((namespace, schemaLocation, baseUri) -> null);
    InputSource source = new InputSource(new ByteArrayInputStream(content));
    source.setSystemId(file);
    XmlSchema schema = collection.read(source);
    XmlSchemaElement rootElement = schema.getElementByName(root);
    if (rootElement == null) {
      throw new StructureLoadException(
          StructureImportDiagnostics.SCHEMA_ROOT_NOT_FOUND,
          file,
          schemaTag.line(),
          schemaTag.column(),
          "the schema declares no global element Q{"
              + root.getNamespaceURI()
              + "}"
              + root.getLocalPart());
    }

    // a global element is always qualified; XmlSchema's getWireName() drops its namespace
    // (observed)
    FieldPath.Step rootStep = step(FieldKind.ELEMENT, rootElement.getQName());
    Map<String, StructureType> types = new HashMap<>();
    String typeId =
        type(FieldPath.of(rootStep), (XmlSchemaComplexType) rootElement.getSchemaType(), types);
    Field rootField =
        new Field(rootStep, new Occurrence(1, 1), Optional.empty(), false, Optional.of(typeId));
    return new Structure(rootField, types);
  }

  /**
   * Adds the type of the structure field at {@code path}, and the types of the structure fields
   * below it, to {@code types}.
   *
   * @return the type's id: the field's path, with {@code #2}, {@code #3} … for each further sibling
   *     structure field with the same step (ADR-0007 refuses those only when a mapping uses them,
   *     so they load)
   */
  private static String type(
      FieldPath path, XmlSchemaComplexType complexType, Map<String, StructureType> types) {
    List<Field> fields = new ArrayList<>();
    // the subset puts attributes on a global element's type only
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
    // the subset makes the particle an xs:sequence of local elements, optional at the root only
    XmlSchemaSequence sequence = (XmlSchemaSequence) complexType.getParticle();
    List<XmlSchemaSequenceMember> members = sequence == null ? List.of() : sequence.getItems();
    for (XmlSchemaSequenceMember member : members) {
      XmlSchemaElement element = (XmlSchemaElement) member;
      // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
      FieldPath.Step step = step(FieldKind.ELEMENT, element.getWireName());
      // the subset has no sequence occurrence, so the effective occurrence is the element's own;
      // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
      Occurrence occurrence = new Occurrence(element.getMinOccurs(), element.getMaxOccurs());
      // a leaf names a built-in type; a structure field has an anonymous complex type instead
      fields.add(
          element.getSchemaTypeName() != null
              ? new Field(
                  step,
                  occurrence,
                  Optional.of(valueType(element.getSchemaTypeName())),
                  element.isNillable(),
                  Optional.empty())
              : new Field(
                  step,
                  occurrence,
                  Optional.empty(),
                  false,
                  Optional.of(
                      type(
                          path.child(step),
                          (XmlSchemaComplexType) element.getSchemaType(),
                          types))));
    }
    String id = path.toString();
    for (int n = 2; types.containsKey(id); n++) {
      id = path + "#" + n;
    }
    types.put(id, new StructureType(id, fields));
    return id;
  }

  /** The subset check has made sure that the type is a built-in simple type. */
  private static ValueType valueType(QName type) {
    return BuiltInTypes.valueType(type.getLocalPart()).orElseThrow();
  }

  private static FieldPath.Step step(FieldKind kind, QName name) {
    return new FieldPath.Step(kind, name.getNamespaceURI(), name.getLocalPart());
  }
}
