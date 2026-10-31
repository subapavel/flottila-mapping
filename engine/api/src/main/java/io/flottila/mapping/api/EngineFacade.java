package io.flottila.mapping.api;

import io.flottila.mapping.mapping.LoadResult;
import io.flottila.mapping.mapping.MalformedJsonException;
import io.flottila.mapping.mapping.MappingModel;
import io.flottila.mapping.mapping.MappingModelFormat;

/**
 * The engine facade the service calls (ADR-0016). It carries no compatibility promise and is not
 * the embedding API for Flottila.
 */
public final class EngineFacade {

  /** A facade; it holds no state. */
  public EngineFacade() {}

  /**
   * Loads a mapping model through validation stages 1 and 2 (ADR-0011).
   *
   * @param json the document's bytes
   * @return the model, or the diagnostics that refuse it
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  public LoadResult load(byte[] json) throws MalformedJsonException {
    return MappingModelFormat.load(json);
  }

  /** The canonical form of {@code model} (ADR-0010). */
  public byte[] save(MappingModel model) {
    return MappingModelFormat.save(model);
  }
}
