package io.flottila.mapping.service;

import java.io.Serial;

// stub for red (#28)
/** An id, base or bundle reference that is no workspace path (ADR-0024): never a read. */
public final class WorkspacePathException extends Exception {

  @Serial private static final long serialVersionUID = 1L;
}
