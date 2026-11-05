package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.Refusal;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.StructureType;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.importer.StructureImportDiagnostics;
import io.flottila.mapping.structure.importer.StructureLoadException;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

  public static Structure read(String file, byte[] content, QName root)
      throws StructureLoadException {
    XsdSubsetCheck.Positions positions = XsdSubsetCheck.check(file, content);
    XsdSubsetCheck.Position schemaTag = positions.schema();
    XmlSchema schema =
        new XmlSchemaCollection().read(new InputSource(new ByteArrayInputStream(content)));
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
        type(
            file,
            FieldPath.of(rootStep),
            (XmlSchemaComplexType) rootElement.getSchemaType(),
            positions.localElements().get(root.getLocalPart()).iterator(),
            types);
    Field rootField =
        new Field(rootStep, new Occurrence(1, 1), Optional.empty(), false, Optional.of(typeId));
    return new Structure(rootField, types);
  }

  /**
   * Adds the type of the structure field at {@code path}, and the types of the structure fields
   * below it, to {@code types}. Its local elements, and those below them, take their declarations'
   * positions from {@code declarations} in document order, a field before the fields below it.
   *
   * @return the type's id: the field's path, with {@code #2}, {@code #3} … for each further sibling
   *     structure field with the same step (ADR-0007 refuses those only when a mapping uses them,
   *     so they load as refused fields, #92)
   */
  private static String type(
      String file,
      FieldPath path,
      XmlSchemaComplexType complexType,
      Iterator<XsdSubsetCheck.Position> declarations,
      Map<String, StructureType> types) {
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
    List<Field> elements = new ArrayList<>();
    List<XsdSubsetCheck.Position> starts = new ArrayList<>();
    for (XmlSchemaSequenceMember member : members) {
      XmlSchemaElement element = (XmlSchemaElement) member;
      // this walk meets the local elements in the subset check's document order
      starts.add(declarations.next());
      // getWireName() applies the form: elementFormDefault="qualified" gives the namespace
      FieldPath.Step step = step(FieldKind.ELEMENT, element.getWireName());
      // the subset has no sequence occurrence, so the effective occurrence is the element's own;
      // XmlSchema reads maxOccurs="unbounded" as Long.MAX_VALUE, which is Occurrence.UNBOUNDED
      Occurrence occurrence = new Occurrence(element.getMinOccurs(), element.getMaxOccurs());
      // a leaf names a built-in type; a structure field has an anonymous complex type instead
      elements.add(
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
                          file,
                          path.child(step),
                          (XmlSchemaComplexType) element.getSchemaType(),
                          declarations,
                          types))));
    }
    fields.addAll(refused(file, elements, starts));
    String id = path.toString();
    for (int n = 2; types.containsKey(id); n++) {
      id = path + "#" + n;
    }
    types.put(id, new StructureType(id, fields));
    return id;
  }

  /**
   * {@code elements}, in output order, with each one whose step occurs twice or more refused with
   * ambiguous-field-path at that step's second declaration (ADR-0008 Shape (#92)); {@code starts}
   * holds where each element's declaration ends its start tag. Attributes are not looked at: the
   * subset puts them on a global element's type only, and two of one name there make the schema
   * invalid (XSD 1.1 Part 1, ct-props-correct.4).
   */
  private static List<Field> refused(
      String file, List<Field> elements, List<XsdSubsetCheck.Position> starts) {
    Set<FieldPath.Step> seen = new HashSet<>();
    Map<FieldPath.Step, XsdSubsetCheck.Position> second = new HashMap<>();
    for (int i = 0; i < elements.size(); i++) {
      FieldPath.Step step = elements.get(i).step();
      if (!seen.add(step)) {
        second.putIfAbsent(step, starts.get(i));
      }
    }
    List<Field> fields = new ArrayList<>();
    for (Field field : elements) {
      XsdSubsetCheck.Position at = second.get(field.step());
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

  /** The subset check has made sure that the type is a built-in simple type. */
  private static ValueType valueType(QName type) {
    return BuiltInTypes.valueType(type.getLocalPart()).orElseThrow();
  }

  private static FieldPath.Step step(FieldKind kind, QName name) {
    return new FieldPath.Step(kind, name.getNamespaceURI(), name.getLocalPart());
  }
}
