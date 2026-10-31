package io.flottila.mapping.mapping;

import io.flottila.mapping.ir.AuthoringId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * A call of a standard function of the function catalogue ({@code kind: function}). A constant is
 * {@code fn: "constant"} with {@code params.value}.
 *
 * @param fn the catalogue's function name
 * @param inputs the input slots in the catalogue's input order; empty for an unconnected input
 * @param params the box parameters, keyed by the catalogue's parameter name
 */
public record StandardFunctionBox(
    String fn, List<Optional<AuthoringId>> inputs, Map<String, ParamValue> params) implements Box {

  public StandardFunctionBox {
    inputs = List.copyOf(inputs);
    params = Map.copyOf(params);
  }
}
