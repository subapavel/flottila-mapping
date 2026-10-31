package io.flottila.mapping.structure;

/** What a field is in the message (ADR-0008). JSON properties arrive with the JSON reader. */
public enum FieldKind {
  ELEMENT,
  ATTRIBUTE
}
