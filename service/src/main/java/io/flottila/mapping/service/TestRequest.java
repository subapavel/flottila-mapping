package io.flottila.mapping.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A test run of the editor's working copy (ADR-0015).
 *
 * @param model the working copy, unsaved
 * @param input the input message
 */
public record TestRequest(
    @Schema(required = true, ref = MappingsResource.MODEL) JsonNode model,
    @Schema(required = true) String input) {}
