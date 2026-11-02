package io.flottila.mapping.api;

import io.flottila.mapping.runtime.ExecutableMapping;

/**
 * A compiled mapping, opaque to the facade's callers: only {@link EngineFacade#run} uses it. It is
 * immutable and may run any number of messages.
 */
public final class CompiledMapping {

  private final ExecutableMapping executable;

  CompiledMapping(ExecutableMapping executable) {
    this.executable = executable;
  }

  ExecutableMapping executable() {
    return executable;
  }
}
