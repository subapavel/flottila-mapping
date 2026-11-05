package io.flottila.mapping.structure.importer;

/**
 * A file a {@link ReferenceResolver} has read (ADR-0014 "Reference resolver shape").
 *
 * @param name the file as the schema bundle spells it; load errors inside the file name it so
 * @param content the file's bytes
 */
public record ResolvedFile(String name, byte[] content) {}
