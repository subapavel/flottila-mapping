package io.flottila.mapping.api;

import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.mapping.AtFilePosition;
import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.mapping.Severity;
import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.SchemaBundle;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
