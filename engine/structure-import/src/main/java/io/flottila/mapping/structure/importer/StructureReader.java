package io.flottila.mapping.structure.importer;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.JsonRoot;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.WsdlRoot;
import io.flottila.mapping.structure.importer.internal.XsdReader;
import javax.xml.namespace.QName;

/**
 * Reads a schema bundle into a structure (ADR-0008). Milestone 1 reads the nested XSD subset only:
 * spec #21's flat subset with structure fields at any depth (#62, F-14); full XSD, WSDL and JSON
 * Schema are spec 4. It reads every file through the host's {@link ReferenceResolver} and opens no
 * file itself (ADR-0014 "Reference resolver shape").
 */
public final class StructureReader {

  private final ReferenceResolver resolver;

  /**
   * @param resolver the host's resolver, bound to the base the bundle's references are relative to
   */
  public StructureReader(ReferenceResolver resolver) {
    this.resolver = resolver;
  }

  /**
   * Reads the structure under {@code root}. An unchecked exception from the resolver passes through
   * unchanged.
   *
   * @throws StructureLoadException when the bundle cannot be read, is not well-formed, uses a
   *     construct outside the nested subset, or has no such root
   */
  public Structure read(SchemaBundle bundle, RootSelector root) throws StructureLoadException {
    if (bundle.files().size() != 1) {
      String file = bundle.files().isEmpty() ? "" : bundle.files().get(1);
      throw new StructureLoadException(
          StructureImportDiagnostics.SCHEMA_CONSTRUCT_UNSUPPORTED,
          file,
          1,
          1,
          "the nested XSD subset reads a schema bundle of exactly one file");
    }
    String file = bundle.files().getFirst();
    QName element =
        switch (root) {
          case ElementRoot(String name) -> eqName(name);
          case WsdlRoot wsdl -> throw unsupportedRoot(file, "a WSDL operation");
          case JsonRoot json -> throw unsupportedRoot(file, "the JSON root");
        };
    ResolvedFile resolved;
    try {
      resolved = resolver.resolve(file);
    } catch (UnresolvedReferenceException e) {
      // the engine's code and message, at the reference as the bundle spells it
      String code =
          switch (e.reason()) {
            case UNREADABLE -> StructureImportDiagnostics.SCHEMA_UNREADABLE;
            case PACKAGE_REFERENCE_UNSUPPORTED ->
                StructureImportDiagnostics.PACKAGE_REFERENCE_UNSUPPORTED;
          };
      throw new StructureLoadException(
          code, file, 1, 1, UnresolvedReferenceException.message(e.reason(), file));
    }
    return XsdReader.read(resolved.name(), resolved.content(), element);
  }

  private static StructureLoadException unsupportedRoot(String file, String what) {
    return new StructureLoadException(
        StructureImportDiagnostics.ROOT_SELECTOR_UNSUPPORTED,
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
