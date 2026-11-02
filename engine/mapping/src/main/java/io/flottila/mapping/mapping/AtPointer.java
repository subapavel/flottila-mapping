package io.flottila.mapping.mapping;

/**
 * A place in the mapping model's document, as stage 1 reports it.
 *
 * @param pointer the RFC 6901 JSON pointer; {@code ""} is the document itself
 */
public record AtPointer(String pointer) implements Location {}
