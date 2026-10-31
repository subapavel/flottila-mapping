package io.flottila.mapping.structure.importer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.JsonRoot;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.WsdlDirection;
import io.flottila.mapping.structure.WsdlOperation;
import io.flottila.mapping.structure.WsdlRoot;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** The flat XSD structure import (spec #21, ticket #25) at the reader's exported API. */
class StructureReaderTest {

  private static final Path SKELETON =
      Path.of(System.getProperty("flottila.corpus"), "structures", "skeleton");
  private static final String ORDER_PATH = "/Q{urn:flottila:corpus:skeleton}Order";
  private static final RootSelector ORDER = new ElementRoot("Q{urn:flottila:corpus:skeleton}Order");

  private static Structure readSkeleton(String file) throws StructureLoadException {
    return new StructureReader(SKELETON).read(new SchemaBundle(List.of(file)), ORDER);
  }

  @Test
  void the_skeleton_structure_has_ADR_0007_field_paths_attributes_first() throws Exception {
    Structure structure = readSkeleton("order.xsd");

    assertThat(structure.rootPath()).hasToString(ORDER_PATH);
    assertThat(structure.children(structure.rootPath()))
        .extracting(FieldPath::toString)
        .containsExactly(
            ORDER_PATH + "/@channel",
            ORDER_PATH + "/OrderId",
            ORDER_PATH + "/Quantity",
            ORDER_PATH + "/Amount",
            ORDER_PATH + "/Urgent",
            ORDER_PATH + "/DeliveryDate",
            ORDER_PATH + "/PickupTime",
            ORDER_PATH + "/CreatedAt",
            ORDER_PATH + "/Note");
  }

  @Test
  void effective_occurrences_and_value_types_match_the_skeleton_XSD() throws Exception {
    Structure structure = readSkeleton("order.xsd");
    Map<String, String> fields = new LinkedHashMap<>();
    fields.put(ORDER_PATH, describe(structure, structure.rootPath()));
    for (FieldPath child : structure.children(structure.rootPath())) {
      fields.put(child.toString(), describe(structure, child));
    }

    // root 1..1; OrderId the one required leaf; every other field optional (spec #21, Structures)
    assertThat(fields)
        .containsExactly(
            entry(ORDER_PATH, "1..1 structure"),
            entry(ORDER_PATH + "/@channel", "0..1 xs:string"),
            entry(ORDER_PATH + "/OrderId", "1..1 xs:string"),
            entry(ORDER_PATH + "/Quantity", "0..1 xs:integer"),
            entry(ORDER_PATH + "/Amount", "0..1 xs:decimal nillable"),
            entry(ORDER_PATH + "/Urgent", "0..1 xs:boolean"),
            entry(ORDER_PATH + "/DeliveryDate", "0..1 xs:date"),
            entry(ORDER_PATH + "/PickupTime", "0..1 xs:time"),
            entry(ORDER_PATH + "/CreatedAt", "0..1 xs:dateTime"),
            entry(ORDER_PATH + "/Note", "0..unbounded xs:string"));
  }

  @Test
  void the_skeleton_XSD_loads_as_source_and_as_target_with_one_fingerprint() throws Exception {
    Structure source = readSkeleton("order.xsd");
    Structure target = readSkeleton("order.xsd");

    assertThat(source).isEqualTo(target);
    assertThat(source.fingerprint()).matches("sha256:[0-9a-f]{64}");
    assertThat(target.fingerprint()).isEqualTo(source.fingerprint());
  }

  @Test
  void a_changed_occurrence_gives_a_different_fingerprint() throws Exception {
    String original = readSkeleton("order.xsd").fingerprint();
    String changed = readSkeleton("test-fixtures/order-quantity-repeats.xsd").fingerprint();

    assertThat(changed).matches("sha256:[0-9a-f]{64}").isNotEqualTo(original);
  }

  @Test
  void another_prefix_and_whitespace_give_the_same_fingerprint() throws Exception {
    String original = readSkeleton("order.xsd").fingerprint();
    String respelled = readSkeleton("test-fixtures/order-other-prefix.xsd").fingerprint();

    assertThat(respelled).isEqualTo(original);
  }

  @Test
  void a_malformed_XSD_is_refused_at_the_line_and_column_of_the_error() {
    String file = "test-fixtures/malformed.xsd";

    assertThatThrownBy(() -> readSkeleton(file))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-not-well-formed");
              assertThat(e.file()).isEqualTo(file);
              // the mismatched end tag </xs:complexType> starts at line 7, column 5; the parser
              // points at its name, column 7
              assertThat(e.line()).isEqualTo(7);
              assertThat(e.column()).isEqualTo(7);
            });
  }

  /** A refused construct points at the end of its start tag, where SAX reports an element. */
  @ParameterizedTest(name = "{0} is refused with {1} at {2}:{3}")
  @CsvSource({
    "choice,                     schema-construct-unsupported,  9, 20",
    // a nested structure field: its xs:element has no type, so it is refused at that element
    "nested-complex-type,        schema-construct-unsupported,  9, 33",
    "annotation,                 schema-construct-unsupported,  9, 66",
    "type-not-built-in,          schema-construct-unsupported, 10, 53",
    "type-unknown-built-in,      schema-construct-unsupported,  9, 51",
    "type-unbound-prefix,        schema-construct-unsupported,  9, 53",
    "attribute-not-in-subset,    schema-construct-unsupported,  9, 66",
    "missing-type,               schema-construct-unsupported,  9, 34",
    "nillable-not-true-or-false, schema-construct-unsupported,  9, 64",
    "attribute-prohibited,       schema-construct-unsupported, 10, 71",
    "foreign-element,            schema-construct-unsupported,  9, 56",
    "redefine,                   schema-construct-unsupported,  5, 44",
    "not-a-schema,               schema-construct-unsupported,  3, 71",
    "root-simple-type,           schema-construct-unsupported,  6, 20",
    "root-without-complex-type,  schema-construct-unsupported,  5, 29",
    "root-two-complex-types,     schema-construct-unsupported,  7, 22",
    "complex-type-all,           schema-construct-unsupported,  7, 15",
    "sequence-after-attribute,   schema-construct-unsupported,  8, 21",
    "foreign-attribute,          schema-construct-unsupported,  9, 100",
    "min-occurs-invalid,         schema-invalid,                9, 68",
    "max-occurs-invalid,         schema-invalid,                9, 66",
    "min-above-max,              schema-invalid,                9, 79",
    "max-occurs-too-large,       schema-invalid,                9, 83",
    // text is reported at its end: just before </xs:sequence> on line 10
    "text-content,               schema-construct-unsupported, 10,  7",
    // a DOCTYPE is refused, so no entity or external DTD is ever read
    "doctype,                    schema-not-well-formed,        3, 10",
  })
  void a_construct_outside_the_flat_subset_is_refused_where_it_stands(
      String fixture, String code, int line, int column) {
    String file = "test-fixtures/" + fixture + ".xsd";

    assertThatThrownBy(() -> readSkeleton(file))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo(code);
              assertThat(e.file()).isEqualTo(file);
              assertThat(e.line()).isEqualTo(line);
              assertThat(e.column()).isEqualTo(column);
              assertThat(e.getMessage()).isNotBlank();
            });
  }

  /**
   * ADR-0008: the nearest of the seven atomic types by built-in ancestry (XSD 1.1 Part 2, the
   * built-in datatype hierarchy), otherwise xs:string. Each leaf is named after its type.
   */
  @Test
  void every_built_in_simple_type_gets_the_value_type_of_its_ancestry() throws Exception {
    Structure structure = readSkeleton("test-fixtures/built-in-types.xsd");
    Map<String, String> valueTypes = new LinkedHashMap<>();
    for (FieldPath child : structure.children(structure.rootPath())) {
      valueTypes.put(
          child.steps().getLast().localName(),
          structure.field(child).orElseThrow().valueType().orElseThrow().typeName());
    }

    Map<String, String> expected = new LinkedHashMap<>();
    for (String notAtomicOfTheSeven :
        List.of(
            "anySimpleType",
            "anyAtomicType",
            "string",
            "normalizedString",
            "token",
            "language",
            "Name",
            "NCName",
            "NMTOKEN",
            "NMTOKENS",
            "ID",
            "IDREF",
            "IDREFS",
            "ENTITY",
            "ENTITIES",
            "anyURI",
            "QName",
            "NOTATION",
            "base64Binary",
            "hexBinary",
            "float",
            "double",
            "duration",
            "dayTimeDuration",
            "yearMonthDuration",
            "gYear",
            "gYearMonth",
            "gMonth",
            "gMonthDay",
            "gDay")) {
      expected.put(notAtomicOfTheSeven, "xs:string");
    }
    expected.put("boolean", "xs:boolean");
    expected.put("decimal", "xs:decimal");
    for (String derivedFromInteger :
        List.of(
            "integer",
            "nonPositiveInteger",
            "negativeInteger",
            "long",
            "int",
            "short",
            "byte",
            "nonNegativeInteger",
            "unsignedLong",
            "unsignedInt",
            "unsignedShort",
            "unsignedByte",
            "positiveInteger")) {
      expected.put(derivedFromInteger, "xs:integer");
    }
    expected.put("date", "xs:date");
    expected.put("time", "xs:time");
    expected.put("dateTime", "xs:dateTime");
    expected.put("dateTimeStamp", "xs:dateTime");

    assertThat(valueTypes).containsExactlyEntriesOf(expected);
  }

  @Test
  void a_root_with_attributes_and_no_sequence_is_in_the_flat_subset() throws Exception {
    Structure structure = readSkeleton("test-fixtures/attributes-only.xsd");

    assertThat(structure.children(structure.rootPath()))
        .extracting(FieldPath::toString)
        .containsExactly(ORDER_PATH + "/@id");
    assertThat(describe(structure, structure.children(structure.rootPath()).getFirst()))
        .isEqualTo("1..1 xs:integer");
  }

  @ParameterizedTest(name = "root {0} is not found")
  @ValueSource(strings = {"Q{urn:flottila:corpus:skeleton}Invoice", "Order", "Q{unclosed"})
  void a_root_the_schema_does_not_declare_is_refused_at_the_schema_element(String root) {
    assertThatThrownBy(
            () ->
                new StructureReader(SKELETON)
                    .read(new SchemaBundle(List.of("order.xsd")), new ElementRoot(root)))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-root-not-found");
              assertThat(e.file()).isEqualTo("order.xsd");
              // <xs:schema …> spans lines 5 and 6 and ends at column 58 of line 6
              assertThat(e.line()).isEqualTo(6);
              assertThat(e.column()).isEqualTo(59);
            });
  }

  @Test
  void WSDL_and_JSON_roots_are_refused_until_their_readers_exist() {
    RootSelector wsdl =
        new WsdlRoot(
            new WsdlOperation("OrderService", "submit", WsdlDirection.INPUT, Optional.empty()));
    for (RootSelector root : List.of(wsdl, new JsonRoot())) {
      assertThatThrownBy(
              () ->
                  new StructureReader(SKELETON).read(new SchemaBundle(List.of("order.xsd")), root))
          .isInstanceOfSatisfying(
              StructureLoadException.class,
              e -> {
                assertThat(e.code()).isEqualTo("root-selector-unsupported");
                assertThat(e.file()).isEqualTo("order.xsd");
                assertThat(e.line()).isEqualTo(1);
                assertThat(e.column()).isEqualTo(1);
              });
    }
  }

  @Test
  void a_bundle_of_other_than_one_file_is_outside_the_flat_subset() {
    assertThatThrownBy(
            () ->
                new StructureReader(SKELETON)
                    .read(new SchemaBundle(List.of("order.xsd", "extra.xsd")), ORDER))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-construct-unsupported");
              assertThat(e.file()).isEqualTo("extra.xsd");
              assertThat(e.line()).isEqualTo(1);
              assertThat(e.column()).isEqualTo(1);
            });
    assertThatThrownBy(() -> new StructureReader(SKELETON).read(new SchemaBundle(List.of()), ORDER))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-construct-unsupported");
              assertThat(e.file()).isEmpty();
            });
  }

  @Test
  void a_missing_schema_file_is_refused_as_unreadable() {
    assertThatThrownBy(() -> readSkeleton("no-such-file.xsd"))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-unreadable");
              assertThat(e.file()).isEqualTo("no-such-file.xsd");
              assertThat(e.line()).isEqualTo(1);
              assertThat(e.column()).isEqualTo(1);
            });
  }

  private static String describe(Structure structure, FieldPath path) {
    Field field = structure.field(path).orElseThrow();
    String kind = field.valueType().map(ValueType::typeName).orElse("structure");
    return field.occurrence() + " " + kind + (field.nillable() ? " nillable" : "");
  }
}
