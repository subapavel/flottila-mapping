package io.flottila.mapping.structure.importer;

/**
 * The codes of structure load errors: this module's part of the diagnostic catalogue (ADR-0018 as
 * amended by F-9). {@link StructureLoadException} names where each points.
 */
public final class StructureImportDiagnostics {

  /** A schema file the XML or JSON parser cannot read to its end, or that is not UTF-8 JSON. */
  public static final String SCHEMA_NOT_WELL_FORMED = "schema-not-well-formed";

  /**
   * A construct outside the nested XSD subset, a bundle of other than one XSD file, or a JSON
   * Schema construct ADR-0008 refuses at load.
   */
  public static final String SCHEMA_CONSTRUCT_UNSUPPORTED = "schema-construct-unsupported";

  /**
   * A value the XSD does not allow, such as {@code minOccurs} above {@code maxOccurs}, or a JSON
   * Schema that is not valid, such as a {@code $ref} to nothing.
   */
  public static final String SCHEMA_INVALID = "schema-invalid";

  /**
   * A reference inside a schema to a file the schema bundle does not list (ADR-0008, the closed
   * bundle): a JSON Schema {@code $ref} to another file (#97).
   */
  public static final String SCHEMA_REFERENCE_OUTSIDE_BUNDLE = "schema-reference-outside-bundle";

  /** A root selector that names no global element of the schema. */
  public static final String SCHEMA_ROOT_NOT_FOUND = "schema-root-not-found";

  /** A schema file that cannot be read at all. */
  public static final String SCHEMA_UNREADABLE = "schema-unreadable";

  /** A package reference ({@code name@version:/path}) that the host's resolver does not read. */
  public static final String PACKAGE_REFERENCE_UNSUPPORTED = "package-reference-unsupported";

  /** A root selector of a kind milestone 1 does not read yet: a WSDL operation. */
  public static final String ROOT_SELECTOR_UNSUPPORTED = "root-selector-unsupported";

  private StructureImportDiagnostics() {}
}
