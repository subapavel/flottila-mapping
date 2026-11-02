package io.flottila.mapping.structure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** The structure model (ADR-0007, ADR-0008, ADR-0009) at its exported API. */
class StructureTest {

  private static final FieldPath.Step ORDER = element("urn:a", "Order");
  private static final FieldPath.Step ITEM = element("", "Item");
  private static final FieldPath.Step ID = new FieldPath.Step(FieldKind.ATTRIBUTE, "", "id");
  private static final FieldPath.Step NAME = element("", "Name");

  private static FieldPath.Step element(String namespace, String localName) {
    return new FieldPath.Step(FieldKind.ELEMENT, namespace, localName);
  }

  private static Field leaf(FieldPath.Step step, ValueType type) {
    return new Field(step, new Occurrence(0, 1), Optional.of(type), false, Optional.empty());
  }

  /** {@code /Q{urn:a}Order/Item/@id} and {@code /Q{urn:a}Order/Item/Name}, the ADR-0007 example. */
  private static Structure order(List<Field> itemFields) {
    Field root = new Field(ORDER, new Occurrence(1, 1), Optional.empty(), false, Optional.of("O"));
    Field item =
        new Field(
            ITEM,
            new Occurrence(0, Occurrence.UNBOUNDED),
            Optional.empty(),
            false,
            Optional.of("I"));
    return new Structure(
        root,
        Map.of(
            "O", new StructureType("O", List.of(item)), "I", new StructureType("I", itemFields)));
  }

  private static final Structure ORDER_STRUCTURE =
      order(List.of(leaf(ID, ValueType.INTEGER), leaf(NAME, ValueType.STRING)));

  @Test
  void a_field_path_is_EQNames_with_at_for_attributes_and_bare_names_without_a_namespace() {
    FieldPath id = FieldPath.of(ORDER).child(ITEM).child(ID);

    assertThat(id).hasToString("/Q{urn:a}Order/Item/@id");
    assertThat(new FieldPath.Step(FieldKind.ATTRIBUTE, "urn:b", "lang"))
        .hasToString("@Q{urn:b}lang");
  }

  @Test
  void fields_resolve_by_field_path_through_the_type_graph() {
    FieldPath item = ORDER_STRUCTURE.rootPath().child(ITEM);

    assertThat(ORDER_STRUCTURE.children(item))
        .extracting(FieldPath::toString)
        .containsExactly("/Q{urn:a}Order/Item/@id", "/Q{urn:a}Order/Item/Name");
    assertThat(ORDER_STRUCTURE.field(item.child(NAME)).orElseThrow().valueType())
        .contains(ValueType.STRING);
    assertThat(ORDER_STRUCTURE.field(item).orElseThrow().occurrence()).hasToString("0..unbounded");
    assertThat(ORDER_STRUCTURE.children(item.child(NAME))).isEmpty();
  }

  @Test
  void a_path_the_structure_does_not_have_resolves_to_no_field() {
    FieldPath item = ORDER_STRUCTURE.rootPath().child(ITEM);

    assertThat(ORDER_STRUCTURE.field(FieldPath.of(element("urn:b", "Order")))).isEmpty();
    assertThat(ORDER_STRUCTURE.field(item.child(element("", "Price")))).isEmpty();
    assertThat(ORDER_STRUCTURE.field(item.child(NAME).child(NAME))).isEmpty();
    assertThatThrownBy(() -> ORDER_STRUCTURE.children(item.child(element("", "Price"))))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("/Q{urn:a}Order/Item/Price");
  }

  @Test
  void the_fingerprint_follows_what_the_compiler_reads() {
    Structure same = order(List.of(leaf(ID, ValueType.INTEGER), leaf(NAME, ValueType.STRING)));
    Structure otherValueType =
        order(List.of(leaf(ID, ValueType.STRING), leaf(NAME, ValueType.STRING)));
    Structure otherOrder =
        order(List.of(leaf(NAME, ValueType.STRING), leaf(ID, ValueType.INTEGER)));

    assertThat(ORDER_STRUCTURE.fingerprint()).matches("sha256:[0-9a-f]{64}");
    assertThat(same.fingerprint()).isEqualTo(ORDER_STRUCTURE.fingerprint());
    assertThat(otherValueType.fingerprint()).isNotEqualTo(ORDER_STRUCTURE.fingerprint());
    assertThat(otherOrder.fingerprint()).isNotEqualTo(ORDER_STRUCTURE.fingerprint());
  }
}
