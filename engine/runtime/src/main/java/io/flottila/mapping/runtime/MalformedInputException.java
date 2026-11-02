package io.flottila.mapping.runtime;

import java.io.Serial;

/**
 * An input message that is no well-formed XML document, or one with a DOCTYPE, which is refused
 * because no DTD is ever read. The parser's message names the position.
 */
public final class MalformedInputException extends Exception {

  @Serial private static final long serialVersionUID = 1L;

  MalformedInputException(String message, Throwable cause) {
    super(message, cause);
  }
}
