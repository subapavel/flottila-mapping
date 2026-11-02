package io.flottila.mapping.mapping;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldKind;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.StructureType;
import io.flottila.mapping.structure.ValueType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Structures for lowering, built from the structure records as the reader gives them (ADR-0008):
 * one type per structure field, keyed by its field path, attributes first.
 */
final class TestStructures {

  static final String SKELETON = "urn:flottila:corpus:skeleton";
  static final String ORDER = "/Q{" + SKELETON + "}Order";

  private TestStructures() {}

  /** The structure field under the root that {@link #order()} adds to the skeleton's shape. */
  static final String ADDRESS = ORDER + "/Address";

  /**
   * The flat shape of {@code corpus/structures/skeleton/order.xsd}, shortened to four fields, and
   * one structure field the skeleton lacks: {@code Address}, last, which holds the leaf {@code
   * Street}.
   */
  static Structure order() {
    return structure(
        SKELETON,
        "Order",
        Map.of(
            ADDRESS,
            new StructureType(ADDRESS, List.of(leaf("", "Street", 0, 1, ValueType.STRING)))),
        attribute("channel", 0, 1),
        leaf("", "OrderId", 1, 1, ValueType.STRING),
        leaf("", "Quantity", 0, 1, ValueType.INTEGER),
        leaf("", "Note", 0, Occurrence.UNBOUNDED, ValueType.STRING),
        structureField("Address", 0, 1, ADDRESS));
  }

  /**
   * A target whose leaves use three namespaces besides none: {@code Number} and {@code Other} in
   * {@code urn:u}, {@code Ref} in {@code urn:v}, {@code Same} in the root's {@code urn:t}.
   */
  static Structure invoice() {
    return structure(
        "urn:t",
        "Invoice",
        Map.of(),
        leaf("urn:u", "Number", 1, 1, ValueType.STRING),
        leaf("", "Plain", 0, 1, ValueType.STRING),
        leaf("urn:v", "Ref", 0, 1, ValueType.STRING),
        leaf("urn:t", "Same", 0, 1, ValueType.STRING),
        leaf("urn:u", "Other", 0, 1, ValueType.STRING));
  }

  /**
   * A target whose root {@code Invoice} has no namespace and whose leaves meet {@code urn:v} before
   * {@code urn:u}, against the order of their names: {@code Plain} in none, {@code Ref} and {@code
   * Other} in {@code urn:v}, {@code Number} in {@code urn:u}.
   */
  static Structure invoiceWithoutNamespace() {
    return structure(
        "",
        "Invoice",
        Map.of(),
        leaf("", "Plain", 0, 1, ValueType.STRING),
        leaf("urn:v", "Ref", 0, 1, ValueType.STRING),
        leaf("urn:u", "Number", 1, 1, ValueType.STRING),
        leaf("urn:v", "Other", 0, 1, ValueType.STRING));
  }

  static StructureRef ref(Structure structure) {
    FieldPath.Step root = structure.root().step();
    String element =
        root.namespace().isEmpty()
            ? root.localName()
            : "Q{" + root.namespace() + "}" + root.localName();
    return new StructureRef(
        new SchemaBundle(List.of("structure.xsd")),
        new ElementRoot(element),
        structure.fingerprint());
  }

  /**
   * A structure whose root holds {@code fields}; {@code types} holds the type of each structure
   * field among them, by its field path.
   */
  private static Structure structure(
      String namespace, String root, Map<String, StructureType> types, Field... fields) {
    FieldPath.Step step = new FieldPath.Step(FieldKind.ELEMENT, namespace, root);
    String type = FieldPath.of(step).toString();
    Map<String, StructureType> all = new HashMap<>(types);
    all.put(type, new StructureType(type, List.of(fields)));
    return new Structure(
        new Field(step, new Occurrence(1, 1), Optional.empty(), false, Optional.of(type)), all);
  }

  /** A structure field without a namespace: no value type, its child fields in {@code type}. */
  private static Field structureField(String name, long min, long max, String type) {
    return new Field(
        new FieldPath.Step(FieldKind.ELEMENT, "", name),
        new Occurrence(min, max),
        Optional.empty(),
        false,
        Optional.of(type));
  }

  private static Field leaf(
      String namespace, String name, long min, long max, ValueType valueType) {
    return new Field(
        new FieldPath.Step(FieldKind.ELEMENT, namespace, name),
        new Occurrence(min, max),
        Optional.of(valueType),
        false,
        Optional.empty());
  }

  private static Field attribute(String name, long min, long max) {
    return new Field(
        new FieldPath.Step(FieldKind.ATTRIBUTE, "", name),
        new Occurrence(min, max),
        Optional.of(ValueType.STRING),
        false,
        Optional.empty());
  }
}
