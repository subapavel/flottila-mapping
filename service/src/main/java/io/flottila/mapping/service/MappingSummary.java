package io.flottila.mapping.service;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A mapping of the workspace (ADR-0014).
 *
 * @param id the path of its file in the workspace without {@code .mapping.json}
 * @param name the last segment of the id
 */
public record MappingSummary(
    @Schema(required = true) String id, @Schema(required = true) String name) {

  static MappingSummary of(String id) {
    return new MappingSummary(id, id.substring(id.lastIndexOf('/') + 1));
  }
}
