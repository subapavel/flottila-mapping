package io.flottila.mapping.structure.importer.internal;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.xml.namespace.QName;

/**
 * What {@link XsdSubsetCheck} reads from one schema, or {@link WsdlCheck} from the WSDL parts of a
 * WSDL file, for the checks across the bundle: its target namespace, its references to other files,
 * the global names it declares and the names it uses, each with its position. A WSDL file is one
 * WSDL part and one schema per inline schema, all with the file's name.
 */
final class SchemaFile {

  /** A position in the file: just after a start tag, where SAX reports it. */
  record Position(int line, int column) {}

  /**
   * An {@code xs:import} or {@code xs:include}, or a {@code wsdl:import} or {@code wsdl:include}.
   *
   * @param namespace the namespace an import names, {@code ""} for none; null for an include
   * @param location the location as written, or null
   * @param element the element as messages name it, {@code xs:import}
   * @param attribute the attribute that holds the location, {@code schemaLocation}
   */
  record FileReference(
      String namespace, String location, Position at, String element, String attribute) {}

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

  /**
   * Whether it is the WSDL part of a WSDL file: its target namespace is a WSDL one, which an {@code
   * xs:import} never falls back to.
   */
  final boolean wsdl;

  /**
   * Its target namespace, {@code ""} for none; null until its {@code xs:schema} is read, and for a
   * file the host's resolver did not read.
   */
  String targetNamespace;

  /** Its {@code xs:schema}, or its WSDL document element, start tag; null until it is read. */
  Position schemaTag;

  /** Whether it stopped being well-formed: what it declares after that is unknown. */
  boolean stopped;

  /** Global names whose declarations are refused: declared, but not read. */
  final Set<QName> refused = new HashSet<>();

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

  /** WSDL 1.1 messages. */
  final Set<QName> messages = new HashSet<>();

  /** WSDL 1.1 message references of operations. */
  final List<NameUse> messageRefs = new ArrayList<>();

  SchemaFile(String name) {
    this(name, false);
  }

  SchemaFile(String name, boolean wsdl) {
    this.name = name;
    this.wsdl = wsdl;
  }
}
