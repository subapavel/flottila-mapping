package io.flottila.mapping.mapping;

import static org.assertj.core.api.Assertions.assertThat;

import io.flottila.mapping.mapping.JsonTree.Arr;
import io.flottila.mapping.mapping.JsonTree.Bool;
import io.flottila.mapping.mapping.JsonTree.Null;
import io.flottila.mapping.mapping.JsonTree.Num;
import io.flottila.mapping.mapping.JsonTree.Obj;
import io.flottila.mapping.mapping.JsonTree.Str;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The engine-internal function catalogue (ADR-0025): {@code function-catalogue.json}, a resource of
 * {@code engine/mapping}, data that only lowering reads. It is read here as the file the module
 * packs, with the tests' own strict reader, never through the code under test. Where the resource
 * lies inside the module is the implementation's choice; that there is exactly one is not.
 */
class FunctionCatalogueTest {

  static final String FILE = "function-catalogue.json";

  /** The one {@value #FILE} among the classes and resources this module packs. */
  static byte[] catalogue() throws Exception {
    Path classes =
        Path.of(Lowering.class.getProtectionDomain().getCodeSource().getLocation().toURI());
    assertThat(classes).as("engine/mapping's classes").isDirectory();
    List<Path> found;
    try (Stream<Path> files = Files.walk(classes)) {
      found = files.filter(p -> p.getFileName().toString().equals(FILE)).toList();
    }
    assertThat(found).as("%s under %s", FILE, classes).hasSize(1);
    return Files.readAllBytes(found.getFirst());
  }

  // --- canonical form (ADR-0010, as ADR-0011 applies it to the catalogue)

  /**
   * ECMA-262 {@code JSON.stringify(value, null, 2)} with every object's keys sorted by UTF-16 code
   * unit, which is {@code String.compareTo}.
   */
  static String stringify(JsonTree value, String indent) {
    String inner = indent + "  ";
    return switch (value) {
      case Obj(Map<String, JsonTree> members) when members.isEmpty() -> "{}";
      case Obj(Map<String, JsonTree> members) ->
          members.keySet().stream()
              .sorted()
              .map(key -> inner + quote(key) + ": " + stringify(members.get(key), inner))
              .collect(Collectors.joining(",\n", "{\n", "\n" + indent + "}"));
      case Arr(List<JsonTree> items) when items.isEmpty() -> "[]";
      case Arr(List<JsonTree> items) ->
          items.stream()
              .map(item -> inner + stringify(item, inner))
              .collect(Collectors.joining(",\n", "[\n", "\n" + indent + "]"));
      case Str(String text) -> quote(text);
      case Num(String text) -> {
        // JSON.stringify writes an integer as its digits; the catalogue needs no other number
        assertThat(text).as("a number in the catalogue").matches("-?(0|[1-9][0-9]*)");
        yield text;
      }
      case Bool(boolean b) -> Boolean.toString(b);
      case Null() -> "null";
    };
  }

  /** ECMA-262 QuoteJSONString: short escapes, {@code \\u00xx} below U+0020 and lone surrogates. */
  static String quote(String s) {
    StringBuilder out = new StringBuilder("\"");
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '\b' -> out.append("\\b");
        case '\t' -> out.append("\\t");
        case '\n' -> out.append("\\n");
        case '\f' -> out.append("\\f");
        case '\r' -> out.append("\\r");
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        default -> {
          boolean lone =
              Character.isHighSurrogate(c)
                  ? i + 1 >= s.length() || !Character.isLowSurrogate(s.charAt(i + 1))
                  : Character.isLowSurrogate(c)
                      && (i == 0 || !Character.isHighSurrogate(s.charAt(i - 1)));
          if (c < 0x20 || lone) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    return out.append('"').toString();
  }

  /**
   * The pointers of the empty arrays and objects in {@code value}, which the canonical form leaves
   * out; an empty table is a value, so it may stand as a parameter's {@code default}.
   */
  static List<String> emptyCollections(JsonTree value, String pointer, String member) {
    List<String> empty = new ArrayList<>();
    switch (value) {
      case Obj(Map<String, JsonTree> members) -> {
        if (members.isEmpty() && !member.equals("default")) {
          empty.add(pointer);
        }
        members.forEach((k, v) -> empty.addAll(emptyCollections(v, pointer + "/" + k, k)));
      }
      case Arr(List<JsonTree> items) -> {
        if (items.isEmpty()) {
          empty.add(pointer);
        }
        for (int i = 0; i < items.size(); i++) {
          empty.addAll(emptyCollections(items.get(i), pointer + "/" + i, ""));
        }
      }
      case Str _, Num _, Bool _, Null _ -> {}
    }
    return empty;
  }

  @Test
  void theCatalogueIsCanonical() throws Exception {
    byte[] bytes = catalogue();
    // strict UTF-8; a BOM is no JSON whitespace, so the strict reader refuses it
    String text = Fixtures.strictUtf8(bytes);
    JsonTree tree = JsonTree.parse(text);

    // keyed by function name (ADR-0011), and not empty: removeContexts is in it
    assertThat(tree).isInstanceOfSatisfying(Obj.class, o -> assertThat(o.members()).isNotEmpty());
    assertThat(emptyCollections(tree, "", "")).as("empty arrays and objects").isEmpty();
    // sorted keys, JSON.stringify's two-space indent, LF line ends and a final LF, no BOM
    Fixtures.assertBytes(stringify(tree, "") + "\n", bytes);
  }

  // --- parameters (ADR-0025: every param has a default, so lowering makes the IR total)

  /**
   * What is wrong with the params of each function: a param without a {@code default}, a default of
   * another type than the param's, or one outside the param's {@code values}. A function without
   * params leaves {@code params} out, as the canonical form does with an empty array.
   */
  static List<String> defaultProblems(JsonTree catalogue) {
    List<String> problems = new ArrayList<>();
    if (!(catalogue instanceof Obj(Map<String, JsonTree> functions))) {
      return List.of("the catalogue is no object");
    }
    functions.forEach(
        (name, entry) -> {
          if (!(entry instanceof Obj(Map<String, JsonTree> members))) {
            problems.add(name + ": no object");
            return;
          }
          JsonTree params = members.get("params");
          if (params == null) {
            return;
          }
          if (!(params instanceof Arr(List<JsonTree> items))) {
            problems.add(name + ": params is no array");
            return;
          }
          for (int i = 0; i < items.size(); i++) {
            problems.addAll(paramProblems(name + " params[" + i + "]", items.get(i)));
          }
        });
    return problems;
  }

  private static List<String> paramProblems(String where, JsonTree param) {
    if (!(param instanceof Obj(Map<String, JsonTree> members))) {
      return List.of(where + ": no object");
    }
    JsonTree fallback = members.get("default");
    if (fallback == null) {
      return List.of(where + ": no default");
    }
    List<String> problems = new ArrayList<>();
    JsonTree type = members.get("type");
    if (type instanceof Str(String t) && t.equals("string")) {
      if (!(fallback instanceof Str)) {
        problems.add(where + ": the default of a string param is no string");
      }
    } else if (type instanceof Str(String t) && t.equals("table")) {
      if (!(fallback instanceof Obj(Map<String, JsonTree> rows)
          && rows.values().stream().allMatch(Str.class::isInstance))) {
        problems.add(where + ": the default of a table param is no table of strings");
      }
    } else {
      problems.add(where + ": the type is neither string nor table");
    }
    JsonTree values = members.get("values");
    if (values != null
        && !(values instanceof Arr(List<JsonTree> allowed) && allowed.contains(fallback))) {
      problems.add(where + ": the default is not one of its values");
    }
    return problems;
  }

  @Test
  void everyParamHasADefault() throws Exception {
    // witness: the check reports each defect in a catalogue that has them
    JsonTree broken =
        JsonTree.parse(
            """
            {"f": {"params": [{"name": "mode", "type": "string"},
                              {"name": "order", "type": "string", "default": "up",
                               "values": ["ascending", "descending"]},
                              {"name": "rows", "type": "table", "default": "x"},
                              {"name": "ok", "type": "string", "default": "b",
                               "values": ["a", "b"]}]},
             "g": {"params": [{"name": "value", "type": "string", "default": {}}]},
             "h": {"inputs": [{"name": "in"}]}}
            """);
    assertThat(defaultProblems(broken))
        .containsExactly(
            "f params[0]: no default",
            "f params[1]: the default is not one of its values",
            "f params[2]: the default of a table param is no table of strings",
            "g params[0]: the default of a string param is no string");

    JsonTree catalogue = JsonTree.parse(Fixtures.strictUtf8(catalogue()));

    assertThat(catalogue)
        .isInstanceOfSatisfying(Obj.class, o -> assertThat(o.members()).isNotEmpty());
    assertThat(defaultProblems(catalogue)).isEmpty();
  }
}
