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

/** Reads one XSD file of the flat subset into a structure, with Apache XmlSchema (ADR-0008). */
public final class FlatXsdReader {

  private FlatXsdReader() {}

  public static Structure read(String file, byte[] content, QName root)
      throws StructureLoadException {
    FlatSubsetCheck.Position schemaTag = FlatSubsetCheck.check(file, content);
    XmlSchema schema =
        new XmlSchemaCollection().read(new InputSource(new ByteArrayInputStream(content)));
    XmlSchemaElement rootElement = schema.getElementByName(root);
    if (rootElement == null) {
      throw new StructureLoadException(
          "schema-root-not-found",
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
    String typeId = FieldPath.of(rootStep).toString();
    XmlSchemaComplexType complexType = (XmlSchemaComplexType) rootElement.getSchemaType();

    List<Field> fields = new ArrayList<>();
    for (XmlSchemaAttributeOrGroupRef member : complexType.getAttributes()) {
      XmlSchemaAttribute attribute = (XmlSchemaAttribute) member;
      boolean required = attribute.getUse() == XmlSchemaUse.REQUIRED;
      fields.add(
          new Field(
              step(FieldKind.ATTRIBUTE, attribute.getWireName()),
              new Occurrence(required ? 1 : 0, 1),
              valueType(attribute.getSchemaTypeName()),
              false,
              Optional.empty()));
    }
    // the flat subset makes the particle an optional xs:sequence of leaf elements
    XmlSchemaSequence sequence = (XmlSchemaSequence) complexType.getParticle();
    List<XmlSchemaSequenceMember> members = sequence == null ? List.of() : sequence.getItems();
    for (XmlSchemaSequenceMember member : members) {
      XmlSchemaElement element = (XmlSchemaElement) member;
      fields.add(
          new Field(
              step(FieldKind.ELEMENT, element.getWireName()),
              // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is
              // Occurrence.UNBOUNDED
              new Occurrence(element.getMinOccurs(), element.getMaxOccurs()),
              valueType(element.getSchemaTypeName()),
              element.isNillable(),
              Optional.empty()));
    }
    Field rootField =
        new Field(rootStep, new Occurrence(1, 1), Optional.empty(), false, Optional.of(typeId));
    return new Structure(rootField, Map.of(typeId, new StructureType(typeId, fields)));
  }

  /** The flat subset check has made sure that the type is a built-in simple type. */
  private static Optional<ValueType> valueType(QName type) {
    return Optional.of(BuiltInTypes.valueType(type.getLocalPart()).orElseThrow());
  }

  private static FieldPath.Step step(FieldKind kind, QName name) {
    return new FieldPath.Step(kind, name.getNamespaceURI(), name.getLocalPart());
  }
}
