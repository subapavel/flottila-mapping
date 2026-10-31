package io.flottila.mapping.api;

import io.flottila.mapping.structure.Structure;

/** The result of loading a structure: the structure, or the load error that refused it. */
public sealed interface StructureResult {

  record Loaded(Structure structure) implements StructureResult {}

  /**
   * A load error at a position in a schema file (ADR-0015 location {@code {file, line, column}}).
   * It becomes a {@code Diagnostic} once the diagnostic type of #24 exists.
   */
  record Refused(String code, String message, String file, int line, int column)
      implements StructureResult {}
}
