package io.flottila.mapping.service;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A new mapping from {@code source} to {@code target} (ADR-0015).
 *
 * @param id the new mapping's id; its directory must exist
 * @param source the source structure
 * @param target the target structure
 */
public record CreateMappingRequest(
    @Schema(required = true) String id,
    @Schema(required = true) StructureChoice source,
    @Schema(required = true) StructureChoice target) {}
