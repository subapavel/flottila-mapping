package io.flottila.mapping.service;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

/**
 * A runtime error of a test run (ADR-0015), on the wire.
 *
 * @param code the error's QName, such as {@code flottila:TIMEOUT}
 * @param message what stopped the run, in English
 */
public record RuntimeErrorDto(
    @Schema(required = true) String code, @Schema(required = true) String message) {}
