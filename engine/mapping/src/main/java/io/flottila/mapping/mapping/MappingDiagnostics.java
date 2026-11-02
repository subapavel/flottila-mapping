package io.flottila.mapping.mapping;

/**
 * The diagnostic codes of the mapping-model front end: this module's part of the diagnostic
 * catalogue (ADR-0018 as amended by F-9). Renaming a code is a contract change (ADR-0011).
 */
public final class MappingDiagnostics {

  // stage 1, the schema (ADR-0011, "Stage 1 and 2 codes")

  /** A {@code formatVersion} newer than this engine reads, at {@code /formatVersion}. */
  public static final String FORMAT_VERSION_UNSUPPORTED = "format-version-unsupported";

  /** A member the format does not have here ({@code additionalProperties: false}). */
  public static final String UNKNOWN_MEMBER = "unknown-member";

  /** A required member is absent. */
  public static final String MISSING_MEMBER = "missing-member";

  /** A value of the wrong JSON type. */
  public static final String WRONG_TYPE = "wrong-type";

  /** A string that does not match its pattern. */
  public static final String PATTERN_MISMATCH = "pattern-mismatch";

  /** A value outside its {@code enum}, {@code const}, minimum or uniqueness. */
  public static final String INVALID_VALUE = "invalid-value";

  /** Any other schema keyword failed: stage 1 fails closed. */
  public static final String SCHEMA_VIOLATION = "schema-violation";

  /** A box whose {@code kind} names no box kind, at its {@code kind}. */
  public static final String UNKNOWN_BOX_KIND = "unknown-box-kind";

  // stage 2, the model check

  /** An authoring id used more than once; target field mappings and boxes share one id space. */
  public static final String DUPLICATE_AUTHORING_ID = "duplicate-authoring-id";

  /** A reference to no box of the target field mapping. */
  public static final String UNKNOWN_BOX_REFERENCE = "unknown-box-reference";

  /** A reference to a box of another target field mapping. */
  public static final String CROSS_TARGET_FIELD_REFERENCE = "cross-target-field-reference";

  /** Boxes that form a cycle, at the smallest id of the cycle. */
  public static final String BOX_CYCLE = "box-cycle";

  /** A source-field box whose context is no proper ancestor of its field. */
  public static final String CONTEXT_NOT_ANCESTOR = "context-not-ancestor";

  /** A UDF box whose UDF is not declared in {@code udfs}. */
  public static final String UNDECLARED_UDF = "undeclared-udf";

  // stage 3, compile (#26)

  /** A box of a kind spec 1 does not compile that {@code result} reaches, at the box. */
  public static final String UNSUPPORTED_BOX_KIND = "unsupported-box-kind";

  /** An unresolved function box that {@code result} reaches, at the box. */
  public static final String UNRESOLVED_FUNCTION = "unresolved-function";

  /**
   * A field that is no leaf element under the root, such as an attribute, at the source-field box
   * or the target field mapping.
   */
  public static final String UNSUPPORTED_FIELD = "unsupported-field";

  /**
   * A field path the structure does not have, at the source-field box or the target field mapping.
   */
  public static final String ORPHANED_REFERENCE = "orphaned-reference";

  /** A target field mapping whose {@code result} is {@code null} (F-2). */
  public static final String UNCONNECTED_TARGET_FIELD = "unconnected-target-field";

  private MappingDiagnostics() {}
}
