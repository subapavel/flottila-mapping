package io.flottila.mapping.mapping;

/**
 * A design-time error or warning with a stable code and one location (ADR-0015). Tests and the
 * editor match on the code; the message is English text for a person.
 *
 * @param severity error or warning
 * @param code the stable kebab-case code (ADR-0011, "Stage 1 and 2 codes")
 * @param location where the diagnostic points
 * @param message what is wrong
 */
public record Diagnostic(Severity severity, String code, Location location, String message) {}
