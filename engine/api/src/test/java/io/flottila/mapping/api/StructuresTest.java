package io.flottila.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.entry;

import io.flottila.mapping.mapping.AtFilePosition;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.Severity;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.FieldPath;
import io.flottila.mapping.structure.Occurrence;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The engine facade delegates structure loading to the reader (spec #21, seam 1). The reader's
 * behaviour is tested in {@code engine/structure-import}.
 */
class StructuresTest {

  @Test
  void a_flat_XSD_loads_through_the_facade(@TempDir Path base) throws Exception {
    Files.writeString(
        base.resolve("order.xsd"),
        """
        <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:a">
          <xs:element name="Order">
            <xs:complexType><xs:attribute name="id" type="xs:string"/></xs:complexType>
          </xs:element>
        </xs:schema>
        """);

    StructureResult result =
        Structures.load(
            base, new SchemaBundle(List.of("order.xsd")), new ElementRoot("Q{urn:a}Order"));

    assertThat(result).isInstanceOf(StructureResult.Loaded.class);
    StructureResult.Loaded loaded = (StructureResult.Loaded) result;
    assertThat(loaded.structure().rootPath()).hasToString("/Q{urn:a}Order");
  }

  /** #62: the observation kit's nested structures, which #50 maps, load through the facade. */
  @Test
  void the_observation_kit_structures_load_through_the_facade_with_one_fingerprint() {
    Path observations = CorpusStructures.directory("observations");
    Map<String, String> roots = new LinkedHashMap<>();
    roots.put("src-orders.xsd", "Orders");
    roots.put("tgt-list.xsd", "Out");
    Map<String, List<String>> repeatingChildren = new LinkedHashMap<>();

    for (Map.Entry<String, String> file : roots.entrySet()) {
      SchemaBundle bundle = new SchemaBundle(List.of(file.getKey()));
      ElementRoot root = new ElementRoot(file.getValue());
      Structure first = loaded(Structures.load(observations, bundle, root));
      Structure second = loaded(Structures.load(observations, bundle, root));

      assertThat(second.fingerprint()).as(file.getKey()).isEqualTo(first.fingerprint());
      // the first repeating structure field below the root, and its children
      FieldPath repeating = first.children(first.rootPath()).getFirst();
      assertThat(first.field(repeating).orElseThrow().occurrence())
          .isEqualTo(new Occurrence(0, Occurrence.UNBOUNDED));
      repeatingChildren.put(
          repeating.toString(),
          first.children(repeating).stream().map(FieldPath::toString).toList());
    }

    assertThat(repeatingChildren)
        .containsExactly(
            entry(
                "/Orders/Order",
                List.of(
                    "/Orders/Order/Id",
                    "/Orders/Order/Tag",
                    "/Orders/Order/Line",
                    "/Orders/Order/Memo")),
            entry("/Out/Item", List.of("/Out/Item/V", "/Out/Item/W")));
  }

  private static Structure loaded(StructureResult result) {
    if (result instanceof StructureResult.Loaded(Structure structure)) {
      return structure;
    }
    throw new AssertionError("expected Loaded, got " + result);
  }

  @Test
  void a_load_error_is_a_result_with_its_file_position(@TempDir Path base) throws Exception {
    Files.writeString(base.resolve("broken.xsd"), "<xs:schema\n  <");

    StructureResult result =
        Structures.load(base, new SchemaBundle(List.of("broken.xsd")), new ElementRoot("Order"));

    if (!(result instanceof StructureResult.Refused(Diagnostic diagnostic))) {
      throw new AssertionError("expected Refused, got " + result);
    }
    assertThat(diagnostic.severity()).isEqualTo(Severity.ERROR);
    assertThat(diagnostic.code()).isEqualTo("schema-not-well-formed");
    assertThat(diagnostic.message()).isNotBlank();
    // the attribute list of <xs:schema breaks at the "<" on line 2
    assertThat(diagnostic.location()).isEqualTo(new AtFilePosition("broken.xsd", 2, 3));
  }
}
