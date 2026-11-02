package io.flottila.mapping.service;

import java.io.Serial;

/** A request body that is JSON but not of its shape, where Jackson cannot tell (ADR-0024). */
final class InvalidRequestException extends Exception {

  @Serial private static final long serialVersionUID = 1L;

  InvalidRequestException(String detail) {
    super(detail);
  }
}
