package io.flottila.mapping.structure.importer.internal;

import io.flottila.mapping.structure.importer.StructureImportDiagnostics;
import io.flottila.mapping.structure.importer.StructureLoadException;
import io.flottila.mapping.structure.importer.internal.SchemaFile.FileReference;
import io.flottila.mapping.structure.importer.internal.SchemaFile.GlobalElement;
import io.flottila.mapping.structure.importer.internal.SchemaFile.NameUse;
import io.flottila.mapping.structure.importer.internal.SchemaFile.Position;
import io.flottila.mapping.structure.importer.internal.SchemaFile.SimpleType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.namespace.QName;

/**
 * The checks across the files of a schema bundle (ADR-0008 as amended 2026-11-05), over what {@link
 * XsdSubsetCheck} read from each.
 *
 * <ul>
 *   <li>The bundle is a closed set. An {@code xs:import}'s or {@code xs:include}'s {@code
 *       schemaLocation} is mapped to a bundle file by text, relative to the importing file's bundle
 *       name, with no file-system call (ADR-0014 "Reference resolver shape (#90)"). An import whose
 *       location names no bundle file, an absolute path or a URL among them, or that has no
 *       location, falls back to a bundle file with its namespace. Otherwise the reference is {@code
 *       schema-reference-outside-bundle}.
 *   <li>Names are checked only once every file has read without a load error, because a refused or
 *       broken file's declarations are unknown: every name a file uses must be declared by a bundle
 *       file, a simple type must not derive from itself, and the root must be a global element of a
 *       complex type.
 * </ul>
 */
final class BundleCheck {

  private BundleCheck() {}

  static void check(
      List<String> bundle,
      List<SchemaFile> files,
      QName root,
      List<StructureLoadException> errors) {
    // a file not read as far as its xs:schema adds null, which no import names
    Set<String> namespaces = new HashSet<>();
    for (SchemaFile file : files) {
      namespaces.add(file.targetNamespace);
    }
    for (SchemaFile file : files) {
      for (FileReference reference : file.references) {
        boolean listed =
            reference.location() != null
                && bundle.contains(located(file.name, reference.location()));
        // an include has no namespace to fall back to
        if (!listed
            && (reference.namespace() == null || !namespaces.contains(reference.namespace()))) {
          errors.add(outside(file.name, reference));
        }
      }
    }
    if (errors.isEmpty()) {
      names(files, root, errors);
    }
  }

  /**
   * The bundle name {@code location} stands for, written in the file {@code file}, by text: its
   * segments appended to the directory of {@code file}, {@code .} dropped and {@code ..} taking off
   * the segment before it, if there is one that is not {@code ..} itself. An absolute path keeps an
   * empty segment and a URL its scheme, so neither is ever a bundle name (ADR-0024).
   */
  static String located(String file, String location) {
    List<String> segments = new ArrayList<>(List.of(file.split("/", -1)));
    segments.removeLast();
    for (String segment : location.split("/", -1)) {
      if (segment.equals("..") && !segments.isEmpty() && !segments.getLast().equals("..")) {
        segments.removeLast();
      } else if (!segment.equals(".")) {
        segments.add(segment);
      }
    }
    return String.join("/", segments);
  }

  private static StructureLoadException outside(String file, FileReference reference) {
    String message;
    if (reference.location() == null) {
      message =
          "no file of the schema bundle has the namespace \""
              + reference.namespace()
              + "\" this xs:import names";
    } else if (reference.namespace() == null) {
      message =
          "the schemaLocation \""
              + reference.location()
              + "\" of this xs:include names no file of the schema bundle";
    } else {
      message =
          "the schemaLocation \""
              + reference.location()
              + "\" of this xs:import names no file of the schema bundle, and no bundle file has"
              + " its namespace \""
              + reference.namespace()
              + "\"";
    }
    return error(
        StructureImportDiagnostics.SCHEMA_REFERENCE_OUTSIDE_BUNDLE, file, reference.at(), message);
  }

  private static void names(
      List<SchemaFile> files, QName root, List<StructureLoadException> errors) {
    Map<QName, GlobalElement> elements = new HashMap<>();
    Set<QName> complexTypes = new HashSet<>();
    Map<QName, SimpleType> simpleTypes = new HashMap<>();
    for (SchemaFile file : files) {
      elements.putAll(file.elements);
      complexTypes.addAll(file.complexTypes);
      simpleTypes.putAll(file.simpleTypes);
    }
    for (SchemaFile file : files) {
      for (NameUse use : file.elementRefs) {
        if (!elements.containsKey(use.name())) {
          errors.add(invalid(file, use, "the element " + eqName(use.name()) + " is declared"));
        }
      }
      for (NameUse use : file.elementTypes) {
        if (!complexTypes.contains(use.name()) && !simpleTypes.containsKey(use.name())) {
          errors.add(invalid(file, use, "the type " + eqName(use.name()) + " is declared"));
        }
      }
      for (NameUse use : file.simpleTypeRefs) {
        if (!simpleTypes.containsKey(use.name())) {
          errors.add(
              complexTypes.contains(use.name())
                  ? error(
                      StructureImportDiagnostics.SCHEMA_INVALID,
                      file.name,
                      use.at(),
                      "the type "
                          + eqName(use.name())
                          + " is a complex type, where a simple type is needed")
                  : invalid(file, use, "the simple type " + eqName(use.name()) + " is declared"));
        }
      }
      for (Map.Entry<QName, SimpleType> type : file.simpleTypes.entrySet()) {
        Set<QName> seen = new HashSet<>();
        QName base = type.getValue().base();
        while (simpleTypes.containsKey(base) && seen.add(base)) {
          base = simpleTypes.get(base).base();
        }
        if (seen.contains(type.getKey())) {
          errors.add(
              error(
                  StructureImportDiagnostics.SCHEMA_INVALID,
                  file.name,
                  type.getValue().at(),
                  "the simple type " + eqName(type.getKey()) + " derives from itself"));
        }
      }
    }
    GlobalElement rootElement = elements.get(root);
    if (rootElement == null) {
      SchemaFile first = files.getFirst();
      errors.add(
          error(
              StructureImportDiagnostics.SCHEMA_ROOT_NOT_FOUND,
              first.name,
              first.schemaTag,
              "the schema bundle declares no global element " + eqName(root)));
    } else if (rootElement.type() != null
        && (XMLConstants.W3C_XML_SCHEMA_NS_URI.equals(rootElement.type().getNamespaceURI())
            || simpleTypes.containsKey(rootElement.type()))) {
      errors.add(
          error(
              StructureImportDiagnostics.SCHEMA_CONSTRUCT_UNSUPPORTED,
              rootElement.file(),
              rootElement.at(),
              "the root element "
                  + eqName(root)
                  + " has a simple type; a root element has a complex type"));
    }
  }

  private static StructureLoadException invalid(SchemaFile file, NameUse use, String what) {
    return error(
        StructureImportDiagnostics.SCHEMA_INVALID,
        file.name,
        use.at(),
        what + " in no file of the schema bundle");
  }

  private static StructureLoadException error(
      String code, String file, Position at, String message) {
    return new StructureLoadException(code, file, at.line(), at.column(), message);
  }

  /** {@code Q{ns}local}, the EQName of field paths (ADR-0007). */
  static String eqName(QName name) {
    return "Q{" + name.getNamespaceURI() + "}" + name.getLocalPart();
  }
}
