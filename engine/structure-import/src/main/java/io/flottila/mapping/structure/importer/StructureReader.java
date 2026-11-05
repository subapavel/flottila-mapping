package io.flottila.mapping.structure.importer;

import io.flottila.mapping.structure.ElementRoot;
import io.flottila.mapping.structure.JsonRoot;
import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.Structure;
import io.flottila.mapping.structure.WsdlOperation;
import io.flottila.mapping.structure.WsdlRoot;
import io.flottila.mapping.structure.importer.internal.WsdlReader;
import io.flottila.mapping.structure.importer.internal.XsdReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.xml.namespace.QName;

/**
 * Reads a schema bundle into a structure (ADR-0008). It reads XSD bundles of one or more files,
 * linked by {@code xs:import} and {@code xs:include}, with global elements, element references and
 * named types (#93), and WSDL 1.1 and 2.0 bundles under an operation's message (#96); model groups
 * beyond a sequence, derivation and JSON Schema are later tickets of spec 4. It reads every file
 * the bundle lists through the host's {@link ReferenceResolver}, and no other file, and opens no
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
   * unchanged, at once.
   *
   * @throws StructureLoadException with every load error of the bundle ({@link
   *     StructureLoadException#errors}): a file that cannot be read or is not well-formed, a
   *     construct the reader does not read, a reference outside the bundle, a name no bundle file
   *     declares, or no such root
   */
  public Structure read(SchemaBundle bundle, RootSelector root) throws StructureLoadException {
    List<String> files = bundle.files().stream().distinct().toList();
    if (files.isEmpty()) {
      throw new StructureLoadException(
          StructureImportDiagnostics.SCHEMA_CONSTRUCT_UNSUPPORTED,
          "",
          1,
          1,
          "a schema bundle lists at least one file");
    }
    Read read =
        switch (root) {
          case ElementRoot(String name) ->
              (contents, errors) -> XsdReader.read(files, contents, errors, eqName(name));
          case WsdlRoot(WsdlOperation operation) ->
              (contents, errors) ->
                  WsdlReader.read(
                      files, contents, errors, eqName(operation.interfaceName()), operation);
          case JsonRoot json -> throw unsupportedRoot(files.getFirst(), "the JSON root");
        };
    // each file the bundle lists is read once, in bundle order, and no other file (ADR-0008)
    List<StructureLoadException> errors = new ArrayList<>();
    Map<String, byte[]> contents = new LinkedHashMap<>();
    for (String file : files) {
      try {
        // a load error inside the file names the reference asked for, whatever the host names it
        contents.put(file, resolver.resolve(file).content());
      } catch (UnresolvedReferenceException e) {
        // the engine's code and message, at the reference as the bundle spells it
        String code =
            switch (e.reason()) {
              case UNREADABLE -> StructureImportDiagnostics.SCHEMA_UNREADABLE;
              case PACKAGE_REFERENCE_UNSUPPORTED ->
                  StructureImportDiagnostics.PACKAGE_REFERENCE_UNSUPPORTED;
            };
        errors.add(
            new StructureLoadException(
                code, file, 1, 1, UnresolvedReferenceException.message(e.reason(), file)));
      }
    }
    return read.read(contents, errors);
  }

  /** The reader of the root selector's kind, over the bytes the resolver read. */
  private interface Read {
    Structure read(Map<String, byte[]> contents, List<StructureLoadException> errors)
        throws StructureLoadException;
  }

  private static StructureLoadException unsupportedRoot(String file, String what) {
    return new StructureLoadException(
        StructureImportDiagnostics.ROOT_SELECTOR_UNSUPPORTED,
        file,
        1,
        1,
        "the root selector names "
            + what
            + "; milestone 1 reads XSD root elements and WSDL operations only");
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
