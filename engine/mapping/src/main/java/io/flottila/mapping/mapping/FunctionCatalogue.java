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
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * The function catalogue (ADR-0025, ADR-0026): {@code function-catalogue.json}, a resource of this
 * package, read once and published as it is packed, through {@link #bytes()}. Only lowering reads
 * its entries, and only what lowering needs: a function's execution kind, the names of its inputs
 * and its params, in order, with each param's default and the values it takes; {@code family},
 * {@code portable} and {@code fidelity} are read past.
 *
 * <p>Every param of the catalogue is a string param, which lowering makes a {@code Literal}: one
 * with {@code values} takes only those, one without them any string. A table param adds what is
 * read here when its function lands.
 */
public final class FunctionCatalogue {

  /**
   * A string param of a function.
   *
   * @param name the param's name, the key a box gives it under
   * @param fallback the {@code default}, the value of a box that leaves the param out
   * @param values the strings the param takes, or empty when it takes any string
   */
  record Param(String name, String fallback, Optional<List<String>> values) {

    /** Whether the param takes the string {@code value}. */
    boolean takes(String value) {
      return values.map(allowed -> allowed.contains(value)).orElse(true);
    }
  }

  /**
   * A function's signature.
   *
   * @param executionKind what one call sees: one value, one context or the whole queue
   * @param inputs the input names, in order
   * @param params the params, in order
   */
  record Entry(ExecutionKind executionKind, List<String> inputs, List<Param> params) {

    /** The param {@code name}, or empty when the function has no such one. */
    Optional<Param> param(String name) {
      return params.stream().filter(p -> p.name().equals(name)).findFirst();
    }
  }

  /** The packed catalogue's bytes, never handed out: {@link #bytes()} copies them. */
  private static final byte[] PACKED;

  private static final Map<String, Entry> ENTRIES;

  static {
    try (InputStream in = FunctionCatalogue.class.getResourceAsStream("function-catalogue.json")) {
      PACKED = in.readAllBytes();
      ENTRIES = read(PACKED);
    } catch (IOException | MalformedJsonException e) {
      throw new IllegalStateException("the packed function catalogue cannot be read", e);
    }
  }

  private FunctionCatalogue() {}

  /**
   * The packed catalogue as it is published (ADR-0026): its bytes in canonical form, an instance of
   * {@code contract/function-catalogue.schema.json}. Each call gives a copy of its own.
   */
  public static byte[] bytes() {
    return PACKED.clone();
  }

  /** The entry of function {@code name}, or empty when the catalogue has no such one. */
  static Optional<Entry> entry(String name) {
    return Optional.ofNullable(ENTRIES.get(name));
  }

  /**
   * The entries of {@code catalogue}, a function catalogue's bytes, by function name.
   *
   * @throws MalformedJsonException if the bytes are no JSON document
   */
  static Map<String, Entry> read(byte[] catalogue) throws MalformedJsonException {
    IJsonObject functions = (IJsonObject) StrictJsonReader.read(catalogue);
    Map<String, Entry> entries = new HashMap<>();
    functions
        .getProperties()
        .forEach((name, entry) -> entries.put(name.getValue(), entry((IJsonObject) entry)));
    return Map.copyOf(entries);
  }

  /**
   * {@code entry}'s execution kind, inputs and params; a function without inputs, as {@code
   * constant}, or without params leaves the member out, and a param that takes any string leaves
   * {@code values} out.
   */
  private static Entry entry(IJsonObject entry) {
    ExecutionKind kind =
        ExecutionKind.valueOf(string(entry, "executionKind").toUpperCase(Locale.ROOT));
    List<String> inputs = new ArrayList<>();
    if (entry.get("inputs") != null) {
      for (IJsonValue input : elements(entry, "inputs")) {
        inputs.add(string((IJsonObject) input, "name"));
      }
    }
    List<Param> params = new ArrayList<>();
    if (entry.get("params") != null) {
      for (IJsonValue value : elements(entry, "params")) {
        IJsonObject param = (IJsonObject) value;
        params.add(new Param(string(param, "name"), string(param, "default"), values(param)));
      }
    }
    return new Entry(kind, List.copyOf(inputs), List.copyOf(params));
  }

  /** The {@code values} of {@code param}, or empty when it has none and takes any string. */
  private static Optional<List<String>> values(IJsonObject param) {
    if (param.get("values") == null) {
      return Optional.empty();
    }
    List<String> values = new ArrayList<>();
    for (IJsonValue allowed : elements(param, "values")) {
      values.add(((IJsonString) allowed).getValue());
    }
    return Optional.of(List.copyOf(values));
  }

  private static List<? extends IJsonValue> elements(IJsonObject object, String member) {
    return ((IJsonArray) object.get(member)).getElements();
  }

  private static String string(IJsonObject object, String member) {
    return ((IJsonString) object.get(member)).getValue();
  }
}
