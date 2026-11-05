package io.flottila.mapping.structure.importer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.Field;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.ValueType;
import io.flottila.mapping.structure.WsdlDirection;
import io.flottila.mapping.structure.WsdlOperation;
import io.flottila.mapping.structure.WsdlRoot;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
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
    return new StructureReader(DirectoryResolver.over(SKELETON))
        .read(new SchemaBundle(List.of(file)), ORDER);
  }

  /** The observation kit's structures (ADR-0018), which #50 maps (#62, F-14). */
  private static final Path OBSERVATIONS =
      Path.of(System.getProperty("flottila.corpus"), "structures", "observations");

  private static Structure readObservation(String file, String root) throws StructureLoadException {
    return new StructureReader(DirectoryResolver.over(OBSERVATIONS))
        .read(new SchemaBundle(List.of(file)), new ElementRoot(root));
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
    // a nested complex type without xs:sequence (#62): refused at its xs:element
    "nested-complex-type,        schema-construct-unsupported,  9, 33",
    "type-unknown-built-in,      schema-construct-unsupported,  9, 51",
    "type-unbound-prefix,        schema-construct-unsupported,  9, 53",
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
   * The nested subset (#62, F-14) grows the flat one by anonymous complex types at any depth, and
   * nothing else: each construct still outside it is refused where it stands.
   */
  @ParameterizedTest(name = "{0} is refused with {1} at {2}:{3}")
  @CsvSource({
    "element-form-default-invalid,   schema-construct-unsupported,  4, 87",
    "nested-choice,                  schema-construct-unsupported, 10, 38",
    "nested-all,                     schema-construct-unsupported, 10, 35",
    "nested-mixed,                   schema-construct-unsupported, 10, 40",
    "nested-two-sequences,           schema-construct-unsupported, 10, 55",
    "nested-two-complex-types,       schema-construct-unsupported, 10, 75",
    "nested-type-and-complex-type,   schema-construct-unsupported, 10, 27",
    "nested-nillable,                schema-construct-unsupported,  9, 71",
    "nested-simple-type,             schema-construct-unsupported, 10, 26",
    "nested-without-name,            schema-construct-unsupported,  9, 43",
    "nested-structure-min-above-max, schema-invalid,                9, 61",
  })
  void a_construct_outside_the_nested_subset_is_refused_where_it_stands(
      String fixture, String code, int line, int column) {
    a_construct_outside_the_flat_subset_is_refused_where_it_stands(fixture, code, line, column);
  }

  /**
   * #93 reads imports, includes, element references and named types, so these fixtures of the
   * subsets above are refused at the same position for another reason: the one-file bundle lists no
   * {@code other.xsd}, and the bundle declares no {@code tns:Money} and no global {@code Order} in
   * no namespace.
   */
  @ParameterizedTest(name = "{0} is refused with {1} at {2}:{3}")
  @CsvSource({
    "import,             schema-reference-outside-bundle,  5, 80",
    "include,            schema-reference-outside-bundle,  5, 43",
    "type-not-built-in,  schema-invalid,                  10, 53",
    "nested-element-ref, schema-invalid,                  10, 65",
  })
  void a_fixture_of_the_subsets_names_what_the_bundle_lacks(
      String fixture, String code, int line, int column) {
    a_construct_outside_the_flat_subset_is_refused_where_it_stands(fixture, code, line, column);
  }

  /**
   * #93 reads named complex types, attributes at any depth, and annotations and default values with
   * no effect (ADR-0008), so these fixtures of the subsets above load.
   */
  @ParameterizedTest(name = "{0} loads")
  @CsvSource(
      delimiter = '|',
      value = {
        "annotation              | /OrderId 1..1 xs:string; /Note 1..1 xs:string",
        "attribute-not-in-subset | /OrderId 1..1 xs:string; /Note 1..1 xs:string",
        "named-complex-type      | ''",
        "nested-attribute        | /OrderId 1..1 xs:string; /Line 1..unbounded structure;"
            + " /Line/@id 0..1 xs:string",
      })
  void a_fixture_the_subsets_refused_loads(String fixture, String fields) throws Exception {
    Structure structure = readSkeleton("test-fixtures/" + fixture + ".xsd");

    List<String> expected = new ArrayList<>(List.of(ORDER_PATH + " 1..1 structure"));
    for (String field : fields.isEmpty() ? new String[0] : fields.split("; ")) {
      expected.add(ORDER_PATH + field);
    }
    assertThat(tree(structure).entrySet())
        .extracting(e -> e.getKey() + " " + e.getValue())
        .containsExactlyElementsOf(expected);
  }

  @Test
  void the_observation_kit_source_loads_with_its_nested_fields() throws Exception {
    Structure structure = readObservation("src-orders.xsd", "Orders");

    // elementFormDefault="unqualified" and no target namespace: every step is a bare name
    assertThat(tree(structure))
        .containsExactly(
            entry("/Orders", "1..1 structure"),
            entry("/Orders/Order", "0..unbounded structure"),
            entry("/Orders/Order/Id", "0..1 xs:string"),
            entry("/Orders/Order/Tag", "0..unbounded xs:string"),
            entry("/Orders/Order/Line", "0..unbounded structure"),
            entry("/Orders/Order/Line/Sku", "0..1 xs:string"),
            entry("/Orders/Order/Line/Qty", "0..1 xs:string"),
            entry("/Orders/Order/Memo", "0..1 structure"),
            entry("/Orders/Order/Memo/Text", "0..1 xs:string"));
  }

  @Test
  void the_observation_kit_target_loads_with_its_nested_fields() throws Exception {
    Structure structure = readObservation("tgt-list.xsd", "Out");

    assertThat(tree(structure))
        .containsExactly(
            entry("/Out", "1..1 structure"),
            entry("/Out/Item", "0..unbounded structure"),
            entry("/Out/Item/V", "0..unbounded xs:string"),
            entry("/Out/Item/W", "0..unbounded xs:string"),
            entry("/Out/All", "0..unbounded xs:string"));
  }

  @ParameterizedTest(name = "{0} under {1}")
  @CsvSource({"src-orders.xsd, Orders", "tgt-list.xsd, Out"})
  void a_nested_structure_has_one_fingerprint_across_two_loads(String file, String root)
      throws Exception {
    String first = readObservation(file, root).fingerprint();
    String second = readObservation(file, root).fingerprint();

    assertThat(first).matches("sha256:[0-9a-f]{64}");
    assertThat(second).isEqualTo(first);
  }

  @Test
  void element_form_default_qualified_puts_local_elements_at_any_depth_in_the_namespace()
      throws Exception {
    Structure structure = readSkeleton("test-fixtures/nested-qualified.xsd");
    String line = ORDER_PATH + "/Q{urn:flottila:corpus:skeleton}Line";

    // an attribute keeps no namespace: attributeFormDefault is unqualified when absent
    assertThat(tree(structure))
        .containsExactly(
            entry(ORDER_PATH, "1..1 structure"),
            entry(ORDER_PATH + "/@channel", "0..1 xs:string"),
            entry(line, "1..unbounded structure"),
            entry(line + "/Q{urn:flottila:corpus:skeleton}Sku", "1..1 xs:string"));
  }

  @Test
  void sibling_structure_fields_with_one_step_load_each_with_a_type_of_its_own() throws Exception {
    Structure structure = readSkeleton("test-fixtures/nested-same-name-siblings.xsd");
    List<Field> parts = structure.types().get(structure.root().type().orElseThrow()).fields();

    // ADR-0007: the two have no unique path, refused only when a mapping uses them
    assertThat(parts).extracting(f -> f.step().localName()).containsExactly("Part", "Part");
    List<String> children = new ArrayList<>();
    for (Field part : parts) {
      Field child = structure.types().get(part.type().orElseThrow()).fields().getFirst();
      children.add(child.step().localName() + " " + child.valueType().orElseThrow().typeName());
    }
    assertThat(children).containsExactly("A xs:string", "B xs:integer");
    assertThat(structure.types()).hasSize(3);
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
                new StructureReader(DirectoryResolver.over(SKELETON))
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
    for (RootSelector root : List.of(wsdl)) {
      assertThatThrownBy(
              () ->
                  new StructureReader(DirectoryResolver.over(SKELETON))
                      .read(new SchemaBundle(List.of("order.xsd")), root))
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

  /**
   * #93 reads bundles of several files, so the second file is read and, missing, is unreadable; an
   * empty bundle is still refused.
   */
  @Test
  void a_bundle_of_two_files_reads_both_and_an_empty_one_is_refused() {
    assertThatThrownBy(
            () ->
                new StructureReader(DirectoryResolver.over(SKELETON))
                    .read(new SchemaBundle(List.of("order.xsd", "extra.xsd")), ORDER))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-unreadable");
              assertThat(e.file()).isEqualTo("extra.xsd");
              assertThat(e.line()).isEqualTo(1);
              assertThat(e.column()).isEqualTo(1);
            });
    assertThatThrownBy(
            () ->
                new StructureReader(DirectoryResolver.over(SKELETON))
                    .read(new SchemaBundle(List.of()), ORDER))
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

  /**
   * #90 (ADR-0014 "Reference resolver shape"): a reference the host's resolver refuses is a load
   * error about the whole file, at the reference as the bundle spells it, with the engine's code
   * and message for the resolver's reason. A host that spells the refused reference its own way, an
   * absolute path for one, shows nowhere in it.
   */
  @ParameterizedTest(name = "{0} is {1}, the host spelling {3}")
  @CsvSource(
      delimiter = '|',
      value = {
        "UNREADABLE                    | schema-unreadable             | ../xsd/missing.xsd"
            + " | ../xsd/missing.xsd"
            + " | cannot read the schema file \"../xsd/missing.xsd\"",
        "PACKAGE_REFERENCE_UNSUPPORTED | package-reference-unsupported | shared@1.2.0:/xsd/o.xsd"
            + " | shared@1.2.0:/xsd/o.xsd"
            + " | package references need a host resolver: \"shared@1.2.0:/xsd/o.xsd\"",
        "UNREADABLE                    | schema-unreadable             | missing.xsd"
            + " | /srv/host/workspace/missing.xsd"
            + " | cannot read the schema file \"missing.xsd\"",
        "PACKAGE_REFERENCE_UNSUPPORTED | package-reference-unsupported | shared@1.2.0:/xsd/o.xsd"
            + " | /srv/host/packages/shared/1.2.0/xsd/o.xsd"
            + " | package references need a host resolver: \"shared@1.2.0:/xsd/o.xsd\""
      })
  void a_reference_the_resolver_refuses_is_a_load_error_with_the_engines_message(
      UnresolvedReferenceException.Reason reason,
      String code,
      String reference,
      String hostSpelling,
      String message) {
    ReferenceResolver refusing =
        asked -> {
          throw new UnresolvedReferenceException(reason, hostSpelling);
        };

    assertThatThrownBy(
            () -> new StructureReader(refusing).read(new SchemaBundle(List.of(reference)), ORDER))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo(code);
              assertThat(e.file()).isEqualTo(reference);
              assertThat(e.line()).isEqualTo(1);
              assertThat(e.column()).isEqualTo(1);
              assertThat(e.getMessage()).isEqualTo(message);
            });
  }

  /**
   * #90: the name a host gives a file it returns is not the engine's. A load error inside the file
   * sits at the reference the engine asked for, as the bundle spells it, and the host's name, here
   * an absolute path, shows nowhere in it.
   */
  @Test
  void a_load_error_inside_a_resolved_file_names_the_asked_reference_never_the_hosts_name() {
    String hostName = "/srv/host/workspace/xsd/order.xsd";
    ReferenceResolver renaming =
        asked -> new ResolvedFile(hostName, "<xs:schema\n  <".getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(
            () ->
                new StructureReader(renaming)
                    .read(new SchemaBundle(List.of("../xsd/order.xsd")), new ElementRoot("Order")))
        .isInstanceOfSatisfying(
            StructureLoadException.class,
            e -> {
              assertThat(e.code()).isEqualTo("schema-not-well-formed");
              // the attribute list of <xs:schema breaks at the "<" on line 2 (StructuresTest)
              assertThat(e.file()).isEqualTo("../xsd/order.xsd");
              assertThat(e.line()).isEqualTo(2);
              assertThat(e.column()).isEqualTo(3);
              assertThat(e.getMessage()).doesNotContain(hostName).doesNotContain("/srv/");
            });
  }

  /** Every field of {@code structure}, depth first in child order, by field path. */
  private static Map<String, String> tree(Structure structure) {
    Map<String, String> fields = new LinkedHashMap<>();
    addTree(structure, structure.rootPath(), fields);
    return fields;
  }

  private static void addTree(Structure structure, FieldPath path, Map<String, String> fields) {
    fields.put(path.toString(), describe(structure, path));
    for (FieldPath child : structure.children(path)) {
      addTree(structure, child, fields);
    }
  }

  private static String describe(Structure structure, FieldPath path) {
    Field field = structure.field(path).orElseThrow();
    String kind = field.valueType().map(ValueType::typeName).orElse("structure");
    return field.occurrence() + " " + kind + (field.nillable() ? " nillable" : "");
  }
}
