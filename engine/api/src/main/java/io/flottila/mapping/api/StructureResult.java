package io.flottila.mapping.api;

import io.flottila.mapping.mapping.Diagnostic;
import io.flottila.mapping.structure.Structure;

/** The result of loading a structure: the structure, or the load error that refused it. */
public sealed interface StructureResult {

  record Loaded(Structure structure) implements StructureResult {}

  /**
   * A load error, as a diagnostic at its position in a schema file ({@code AtFilePosition}).
   *
   * @param diagnostic the error, with a code of {@code StructureImportDiagnostics}
   */
  record Refused(Diagnostic diagnostic) implements StructureResult {}
}
