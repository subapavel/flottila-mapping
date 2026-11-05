package io.flottila.mapping.service;

import java.io.Serial;

/**
 * A bundle reference the workspace's reference resolver refuses as no workspace path (ADR-0014
 * "Reference resolver shape", ADR-0024). It is unchecked so that it passes through the engine
 * unchanged, and it answers 400 {@code invalid-workspace-path} as its cause does.
 */
public final class WorkspaceEscapeException extends RuntimeException {

  @Serial private static final long serialVersionUID = 1L;

  /**
   * @param cause the refusal, which names the reference as the bundle spells it
   */
  public WorkspaceEscapeException(WorkspacePathException cause) {
    super(cause.getMessage(), cause);
  }
}
