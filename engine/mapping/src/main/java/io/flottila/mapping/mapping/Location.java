package io.flottila.mapping.mapping;

/** Where a diagnostic of loading points (ADR-0015). */
public sealed interface Location permits AtPointer, AtAuthoringId {}
