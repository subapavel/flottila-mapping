package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;

/**
 * A runtime error that stops a mapping run (ADR-0015 since #52): its code, one of {@link
 * RuntimeErrors}, and the authoring id it is raised at, the target field mapping for {@code
 * po:MINOCCURS} and the function box for a context function's data error. The output written so far
 * is undefined; a caller that needs all or nothing buffers it (ADR-0006).
 */
public final class MappingRunException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final String code;

  /** The authoring id's value: {@link AuthoringId} is not serializable. */
  private final String authoringId;

  MappingRunException(String code, AuthoringId authoringId, String message, Throwable cause) {
    super(message, cause);
    this.code = code;
    this.authoringId = authoringId.value();
  }

  /** The error's QName, such as {@code po:MINOCCURS}. */
  public String code() {
    return code;
  }

  /** The target field mapping or function box the error is raised at. */
  public AuthoringId authoringId() {
    return new AuthoringId(authoringId);
  }
}
