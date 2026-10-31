package io.flottila.mapping.api;

import io.flottila.mapping.structure.RootSelector;
import io.flottila.mapping.structure.SchemaBundle;
import io.flottila.mapping.structure.importer.StructureLoadException;
import io.flottila.mapping.structure.importer.StructureReader;
import java.nio.file.Path;

/** The engine facade's entry point for loading a structure from a schema bundle (ADR-0008). */
public final class Structures {

  private Structures() {}

  /**
   * Loads the structure under {@code root}. A load error is a result, never an exception.
   *
   * @param base the directory the bundle's file references are relative to
   */
  public static StructureResult load(Path base, SchemaBundle bundle, RootSelector root) {
    try {
      return new StructureResult.Loaded(new StructureReader(base).read(bundle, root));
    } catch (StructureLoadException e) {
      return new StructureResult.Refused(e.code(), e.getMessage(), e.file(), e.line(), e.column());
    }
  }
}
