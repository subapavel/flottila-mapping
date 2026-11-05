package io.flottila.mapping.structure.importer.internal;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.namespace.QName;

/**
 * What {@link XsdSubsetCheck} reads from one schema file for the checks across the bundle: its
 * target namespace, its references to other files, the global names it declares and the names it
 * uses, each with its position.
 */
final class SchemaFile {

  /** A position in the file: just after a start tag, where SAX reports it. */
  record Position(int line, int column) {}

  /**
   * An {@code xs:import} or {@code xs:include}.
   *
   * @param namespace the namespace an import names, {@code ""} for none; null for an include
   * @param location the {@code schemaLocation} as written, or null
   */
  record FileReference(String namespace, String location, Position at) {}

  /**
   * A global element.
   *
   * @param type its {@code type}, or null for an anonymous complex type
   */
  record GlobalElement(String file, QName type, Position at) {}

  /**
   * A named simple type.
   *
   * @param base the base of its restriction, or null for a list or a union
   * @param at its restriction's position, or the type's own for a list or a union
   */
  record SimpleType(QName base, Position at) {}

  /** A name the file uses, other than a built-in type. */
  record NameUse(QName name, Position at) {}

  /** The file as the schema bundle spells it. */
  final String name;

  /** Its target namespace, {@code ""} for none; null until its {@code xs:schema} is read. */
  String targetNamespace;

  /** Its {@code xs:schema} start tag; null until it is read. */
  Position schemaTag;

  final List<FileReference> references = new ArrayList<>();
  final Map<QName, GlobalElement> elements = new LinkedHashMap<>();
  final Set<QName> complexTypes = new HashSet<>();
  final Map<QName, SimpleType> simpleTypes = new LinkedHashMap<>();

  /** Element references. */
  final List<NameUse> elementRefs = new ArrayList<>();

  /** Types of elements: a complex or a simple type. */
  final List<NameUse> elementTypes = new ArrayList<>();

  /** Types of attributes and bases of restrictions: a simple type. */
  final List<NameUse> simpleTypeRefs = new ArrayList<>();

  SchemaFile(String name) {
    this.name = name;
  }
}
