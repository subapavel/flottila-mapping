package io.flottila.mapping.structure;

import java.util.Optional;

/**
 * A field of a structure type (ADR-0008). A leaf field has a value type. A structure field names
 * the type that holds its child fields.
 *
 * @param step the field's kind and name, the last step of its field path
 * @param occurrence the field's effective occurrence
 * @param valueType the value type of a leaf field
 * @param nillable whether the field may carry {@code xsi:nil}
 * @param type the id of the {@link StructureType} with the child fields of a structure field
 */
public record Field(
    FieldPath.Step step,
    Occurrence occurrence,
    Optional<ValueType> valueType,
    boolean nillable,
    Optional<String> type,
    Optional<Refusal> refusal /* stub: #92 test-author */) {

  // stub: #92 test-author. The 5-arg constructor the design keeps for the existing calls.
  public Field(
      FieldPath.Step step,
      Occurrence occurrence,
      Optional<ValueType> valueType,
      boolean nillable,
      Optional<String> type) {
    this(step, occurrence, valueType, nillable, type, Optional.empty());
  }
}
