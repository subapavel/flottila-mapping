package io.flottila.mapping.mapping;

import com.github.erosb.jsonsKema.IJsonArray;
import com.github.erosb.jsonsKema.IJsonObject;
import com.github.erosb.jsonsKema.IJsonString;
import com.github.erosb.jsonsKema.IJsonValue;
import io.flottila.mapping.mapping.internal.StrictJsonReader;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The engine-internal function catalogue (ADR-0025): {@code function-catalogue.json}, a resource of
 * this package, read once. Only lowering reads it, and only what lowering needs: the names of a
 * function's inputs, in order. No function in it has a param yet; the first one that has (#55) adds
 * the params to what is read.
 */
final class FunctionCatalogue {

  private static final Map<String, List<String>> INPUTS = read();

  private FunctionCatalogue() {}

  /** The input names of function {@code name}, or empty when the catalogue has no such one. */
  static Optional<List<String>> inputs(String name) {
    return Optional.ofNullable(INPUTS.get(name));
  }

  private static Map<String, List<String>> read() {
    IJsonObject functions;
    try (InputStream in = FunctionCatalogue.class.getResourceAsStream("function-catalogue.json")) {
      functions = (IJsonObject) StrictJsonReader.read(in.readAllBytes());
    } catch (IOException | MalformedJsonException e) {
      throw new IllegalStateException("the packed function catalogue cannot be read", e);
    }
    Map<String, List<String>> inputs = new HashMap<>();
    functions
        .getProperties()
        .forEach((name, entry) -> inputs.put(name.getValue(), names((IJsonObject) entry)));
    return Map.copyOf(inputs);
  }

  /** The {@code name} of each of {@code entry}'s {@code inputs}, in order. */
  private static List<String> names(IJsonObject entry) {
    List<String> names = new ArrayList<>();
    for (IJsonValue input : ((IJsonArray) entry.get("inputs")).getElements()) {
      names.add(((IJsonString) ((IJsonObject) input).get("name")).getValue());
    }
    return List.copyOf(names);
  }
}
