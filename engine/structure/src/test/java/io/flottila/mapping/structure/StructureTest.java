package io.flottila.mapping.structure;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.TreeMap;
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

  // --- a refused field in the fingerprint (ADR-0009 as refined by #92): its canonical line ends
  // in its reason; the refusal's file, line and column never enter

  /**
   * A structure of 1 to 4 types {@code T0} … whose first field of each type but the last is the
   * structure field of the next type; every other field is a leaf. Each type has 2 to 4 fields.
   */
  private static Structure randomStructure(Random random) {
    int typeCount = 1 + random.nextInt(4);
    Map<String, StructureType> types = new HashMap<>();
    for (int t = 0; t < typeCount; t++) {
      List<Field> fields = new ArrayList<>();
      int fieldCount = 2 + random.nextInt(3);
      for (int f = 0; f < fieldCount; f++) {
        Occurrence occurrence =
            new Occurrence(random.nextInt(2), random.nextBoolean() ? 1 : Occurrence.UNBOUNDED);
        String name = "f" + random.nextInt(3);
        String namespace = random.nextBoolean() ? "" : "urn:x";
        if (f == 0 && t + 1 < typeCount) {
          fields.add(
              new Field(
                  element(namespace, name),
                  occurrence,
                  Optional.empty(),
                  false,
                  Optional.of("T" + (t + 1))));
        } else {
          FieldKind kind = random.nextBoolean() ? FieldKind.ELEMENT : FieldKind.ATTRIBUTE;
          ValueType valueType = ValueType.values()[random.nextInt(ValueType.values().length)];
          fields.add(
              new Field(
                  new FieldPath.Step(kind, namespace, name),
                  occurrence,
                  Optional.of(valueType),
                  random.nextBoolean(),
                  Optional.empty()));
        }
      }
      types.put("T" + t, new StructureType("T" + t, fields));
    }
    Field root = new Field(ORDER, new Occurrence(1, 1), Optional.empty(), false, Optional.of("T0"));
    return new Structure(root, types);
  }

  /** {@code structure} with field {@code index} of type {@code typeId} carrying {@code refusal}. */
  private static Structure refusing(
      Structure structure, String typeId, int index, Refusal refusal) {
    List<Field> fields = new ArrayList<>(structure.types().get(typeId).fields());
    Field field = fields.get(index);
    fields.set(
        index,
        new Field(
            field.step(),
            field.occurrence(),
            field.valueType(),
            field.nillable(),
            field.type(),
            Optional.of(refusal)));
    Map<String, StructureType> types = new HashMap<>(structure.types());
    types.put(typeId, new StructureType(typeId, fields));
    return new Structure(structure.root(), types);
  }

  /** Every field of {@code structure} as {@code {typeId, index}}, types in id order. */
  private static List<Map.Entry<String, Integer>> fieldsOf(Structure structure) {
    List<Map.Entry<String, Integer>> all = new ArrayList<>();
    for (StructureType type : new TreeMap<>(structure.types()).values()) {
      for (int i = 0; i < type.fields().size(); i++) {
        all.add(Map.entry(type.id(), i));
      }
    }
    return all;
  }

  /**
   * Seeded structures (ADR-0018: seeded loops, no jqwik): refusing one field changes the
   * fingerprint; refusing it at another file, line and column gives the same fingerprint; refusing
   * another field of the same structure gives another one, because the reason sits on the refused
   * field's own line.
   */
  @Test
  void a_refusal_enters_the_fingerprint_and_its_position_does_not() {
    for (long seed = 1; seed <= 200; seed++) {
      Random random = new Random(seed);
      Structure plain = randomStructure(random);
      List<Map.Entry<String, Integer>> fields = fieldsOf(plain);
      Map.Entry<String, Integer> refused = fields.get(random.nextInt(fields.size()));
      List<Map.Entry<String, Integer>> others = new ArrayList<>(fields);
      others.remove(refused);
      Map.Entry<String, Integer> other = others.get(random.nextInt(others.size()));
      int line = 1 + random.nextInt(500);
      int column = 1 + random.nextInt(120);
      Refusal here =
          new Refusal(Refusal.Reason.AMBIGUOUS_FIELD_PATH, "same-step.xsd", line, column);
      Refusal moved =
          new Refusal(
              Refusal.Reason.AMBIGUOUS_FIELD_PATH,
              "moved/other.xsd",
              line + 1 + random.nextInt(500),
              column + 1 + random.nextInt(120));

      String withRefusal =
          refusing(plain, refused.getKey(), refused.getValue(), here).fingerprint();

      assertThat(withRefusal)
          .as("seed %d: %s refused", seed, refused)
          .matches("sha256:[0-9a-f]{64}")
          .isNotEqualTo(plain.fingerprint());
      assertThat(refusing(plain, refused.getKey(), refused.getValue(), moved).fingerprint())
          .as("seed %d: %s refused at another file, line and column", seed, refused)
          .isEqualTo(withRefusal);
      assertThat(refusing(plain, other.getKey(), other.getValue(), here).fingerprint())
          .as("seed %d: %s refused instead of %s", seed, other, refused)
          .isNotEqualTo(withRefusal);
    }
  }
}
