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
 * function's inputs and its params, in order, with each param's default and values.
 *
 * <p>Every param of the catalogue is a string param with {@code values}: lowering makes each a
 * {@code Literal}, which holds a string. A table param, or a string param that takes any string,
 * adds what is read here when its function lands.
 */
final class FunctionCatalogue {

  /**
   * A string param of a function.
   *
   * @param name the param's name, the key a box gives it under
   * @param fallback the {@code default}, the value of a box that leaves the param out
   * @param values the strings the param takes
   */
  record Param(String name, String fallback, List<String> values) {}

  /**
   * A function's signature.
   *
   * @param inputs the input names, in order
   * @param params the params, in order
   */
  record Entry(List<String> inputs, List<Param> params) {

    /** The param {@code name}, or empty when the function has no such one. */
    Optional<Param> param(String name) {
      return params.stream().filter(p -> p.name().equals(name)).findFirst();
    }
  }

  private static final Map<String, Entry> ENTRIES = read();

  private FunctionCatalogue() {}

  /** The entry of function {@code name}, or empty when the catalogue has no such one. */
  static Optional<Entry> entry(String name) {
    return Optional.ofNullable(ENTRIES.get(name));
  }

  private static Map<String, Entry> read() {
    IJsonObject functions;
    try (InputStream in = FunctionCatalogue.class.getResourceAsStream("function-catalogue.json")) {
      functions = (IJsonObject) StrictJsonReader.read(in.readAllBytes());
    } catch (IOException | MalformedJsonException e) {
      throw new IllegalStateException("the packed function catalogue cannot be read", e);
    }
    Map<String, Entry> entries = new HashMap<>();
    functions
        .getProperties()
        .forEach((name, entry) -> entries.put(name.getValue(), entry((IJsonObject) entry)));
    return Map.copyOf(entries);
  }

  /** {@code entry}'s inputs and params; a function without params leaves {@code params} out. */
  private static Entry entry(IJsonObject entry) {
    List<String> inputs = new ArrayList<>();
    for (IJsonValue input : elements(entry, "inputs")) {
      inputs.add(string((IJsonObject) input, "name"));
    }
    List<Param> params = new ArrayList<>();
    if (entry.get("params") != null) {
      for (IJsonValue value : elements(entry, "params")) {
        IJsonObject param = (IJsonObject) value;
        List<String> values = new ArrayList<>();
        for (IJsonValue allowed : elements(param, "values")) {
          values.add(((IJsonString) allowed).getValue());
        }
        params.add(new Param(string(param, "name"), string(param, "default"), List.copyOf(values)));
      }
    }
    return new Entry(List.copyOf(inputs), List.copyOf(params));
  }

  private static List<? extends IJsonValue> elements(IJsonObject object, String member) {
    return ((IJsonArray) object.get(member)).getElements();
  }

  private static String string(IJsonObject object, String member) {
    return ((IJsonString) object.get(member)).getValue();
  }
}
