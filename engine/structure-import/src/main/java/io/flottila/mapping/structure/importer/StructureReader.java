package io.flottila.mapping.structure.importer;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.JsonRoot;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.WsdlRoot;
import io.flottila.mapping.structure.importer.internal.FlatXsdReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.xml.namespace.QName;

/**
 * Reads a schema bundle into a structure (ADR-0008). Milestone 1 reads the flat XSD subset of spec
 * #21 only; full XSD, WSDL and JSON Schema are spec 4.
 */
public final class StructureReader {

  private final Path base;

  /**
   * @param base the directory the bundle's file references are relative to
   */
  public StructureReader(Path base) {
    this.base = base;
  }

  /**
   * Reads the structure under {@code root}.
   *
   * @throws StructureLoadException when the bundle cannot be read, is not well-formed, uses a
   *     construct outside the flat subset, or has no such root
   */
  public Structure read(SchemaBundle bundle, RootSelector root) throws StructureLoadException {
    if (bundle.files().size() != 1) {
      String file = bundle.files().isEmpty() ? "" : bundle.files().get(1);
      throw new StructureLoadException(
          "schema-construct-unsupported",
          file,
          1,
          1,
          "the flat XSD subset reads a schema bundle of exactly one file");
    }
    String file = bundle.files().getFirst();
    QName element =
        switch (root) {
          case ElementRoot(String name) -> eqName(name);
          case WsdlRoot wsdl -> throw unsupportedRoot(file, "a WSDL operation");
          case JsonRoot json -> throw unsupportedRoot(file, "the JSON root");
        };
    byte[] content;
    try {
      content = Files.readAllBytes(base.resolve(file));
    } catch (IOException e) {
      throw new StructureLoadException(
          "schema-unreadable", file, 1, 1, "cannot read the schema file: " + e);
    }
    return FlatXsdReader.read(file, content, element);
  }

  private static StructureLoadException unsupportedRoot(String file, String what) {
    return new StructureLoadException(
        "root-selector-unsupported",
        file,
        1,
        1,
        "the root selector names " + what + "; milestone 1 reads XSD root elements only");
  }

  /** {@code Q{ns}local} or a bare local name. Anything else is a name no schema declares. */
  private static QName eqName(String text) {
    int end = text.indexOf('}');
    if (text.startsWith("Q{") && end > 0) {
      return new QName(text.substring(2, end), text.substring(end + 1));
    }
    return new QName("", text);
  }
}
