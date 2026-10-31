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

  /** The flat shape of {@code corpus/structures/skeleton/order.xsd}, shortened to four fields. */
  static Structure order() {
    return structure(
        SKELETON,
        "Order",
        attribute("channel", 0, 1),
        leaf("", "OrderId", 1, 1, ValueType.STRING),
        leaf("", "Quantity", 0, 1, ValueType.INTEGER),
        leaf("", "Note", 0, Occurrence.UNBOUNDED, ValueType.STRING));
  }

  /**
   * A target whose leaves use three namespaces besides none: {@code Number} and {@code Other} in
   * {@code urn:u}, {@code Ref} in {@code urn:v}, {@code Same} in the root's {@code urn:t}.
   */
  static Structure invoice() {
    return structure(
        "urn:t",
        "Invoice",
        leaf("urn:u", "Number", 1, 1, ValueType.STRING),
        leaf("", "Plain", 0, 1, ValueType.STRING),
        leaf("urn:v", "Ref", 0, 1, ValueType.STRING),
        leaf("urn:t", "Same", 0, 1, ValueType.STRING),
        leaf("urn:u", "Other", 0, 1, ValueType.STRING));
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

  private static Structure structure(String namespace, String root, Field... fields) {
    FieldPath.Step step = new FieldPath.Step(FieldKind.ELEMENT, namespace, root);
    String type = FieldPath.of(step).toString();
    return new Structure(
        new Field(step, new Occurrence(1, 1), Optional.empty(), false, Optional.of(type)),
        Map.of(type, new StructureType(type, List.of(fields))));
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
