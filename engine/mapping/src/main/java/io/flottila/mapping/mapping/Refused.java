package io.flottila.mapping.mapping;

import java.util.List;

/**
 * A mapping model that a validation stage refused (ADR-0011).
 *
 * @param diagnostics the stage's diagnostics, sorted by location, then code
 */
public record Refused(List<Diagnostic> diagnostics) implements LoadResult {

  public Refused {
    diagnostics = List.copyOf(diagnostics);
  }
}
