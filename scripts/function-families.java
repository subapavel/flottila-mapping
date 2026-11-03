// The function families' generator (ADR-0025 "Families", F-15). Single-file program, JDK only. The build
// runs it, one mode per module, and it writes into target/ only:
//
//   java scripts/function-families.java catalogue <function-catalogue.json> <input>...   engine/mapping
//   java scripts/function-families.java helper <po-runtime.xsl> <input>...               engine/xslt-export
//   java scripts/function-families.java index <FamilyIndex.java> <input>...              engine/runtime
//
// An input is a directory, whose files it lists (without walking into subdirectories), or one file. A
// mode reads the files of its kind and ignores the others:
//   catalogue  <family>.json: a family file, keyed by function name, in canonical form (ADR-0010).
//              Output: one catalogue in canonical form, each entry given its "family", the file's stem.
//   helper     core.xsl and <family>.xsl: each holds core's root start tag and its line end, byte for
//              byte, and ends with the root end tag and a LF. Output: core.xsl up to its root end tag,
//              then what each family module's root holds, the families by id, then the root end tag.
//   index      <Family>Family.java: the family <family> of io.flottila.mapping.runtime, holding the
//              maps QUEUE and VALUE. Output: FamilyIndex, those maps by family id.
// The order in which the files are listed or given never shows in an output. A name in two family
// files, a family file not in canonical form and a module with another root start tag exit 1, the
// message naming the name or the file, and no output is written.
import static java.nio.charset.StandardCharsets.UTF_8;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public final class FamilyGenerator {

  /** A refusal: the build fails with its message. */
  private static final class Refusal extends RuntimeException {
    Refusal(String message) {
      super(message);
    }
  }

  private FamilyGenerator() {}

  public static void main(String[] args) throws IOException {
    try {
      List<Path> files = files(Arrays.asList(args).subList(2, args.length));
      String output =
          switch (args[0]) {
            case "catalogue" -> catalogue(families(files, ".json", UnaryOperator.identity()));
            case "helper" -> helper(families(files, ".xsl", UnaryOperator.identity()));
            case "index" -> index(families(files, "Family.java", FamilyGenerator::decapitalize));
            default ->
                throw new Refusal(
                    "usage: java scripts/function-families.java catalogue|helper|index <output>"
                        + " <input>...");
          };
      Path out = Path.of(args[1]).toAbsolutePath();
      Files.createDirectories(out.getParent());
      Files.writeString(out, output, UTF_8);
    } catch (Refusal refusal) {
      System.err.println("function-families: " + refusal.getMessage());
      System.exit(1);
    }
  }

  /** The files of {@code inputs}: the files a directory lists, or the input itself. */
  private static List<Path> files(List<String> inputs) throws IOException {
    List<Path> files = new ArrayList<>();
    for (String input : inputs) {
      Path path = Path.of(input);
      if (Files.isDirectory(path)) {
        try (Stream<Path> listing = Files.list(path)) {
          listing.forEach(files::add);
        }
      } else {
        files.add(path);
      }
    }
    return files;
  }

  /** The files named {@code <stem><suffix>}, by family id, {@code id} of the stem, in id order. */
  private static SortedMap<String, Path> families(
      List<Path> files, String suffix, UnaryOperator<String> id) {
    SortedMap<String, Path> families = new TreeMap<>();
    for (Path file : files) {
      String name = file.getFileName().toString();
      if (name.endsWith(suffix)) {
        families.put(id.apply(name.substring(0, name.length() - suffix.length())), file);
      }
    }
    return families;
  }

  private static String decapitalize(String type) {
    return Character.toLowerCase(type.charAt(0)) + type.substring(1);
  }

  // --- catalogue

  private static String catalogue(SortedMap<String, Path> families) throws IOException {
    Map<String, Object> merged = new TreeMap<>();
    Map<String, String> familyOf = new HashMap<>();
    for (Map.Entry<String, Path> family : families.entrySet()) {
      Path file = family.getValue();
      byte[] bytes = Files.readAllBytes(file);
      Object tree = new Json(new String(bytes, UTF_8), file).document();
      // a malformed UTF-8 byte, a BOM, CR and every other deviation make the bytes differ
      if (!Arrays.equals(bytes, (canonical(tree, "") + "\n").getBytes(UTF_8))) {
        throw new Refusal(
            file
                + " is not in canonical form (ADR-0010): keys sorted by UTF-16 code unit,"
                + " JSON.stringify's two-space indent, no empty array or object but a table"
                + " default, LF line ends and a final LF, UTF-8 without a BOM");
      }
      for (Map.Entry<String, Object> function : object(tree, file.toString()).entrySet()) {
        String name = function.getKey();
        String other = familyOf.putIfAbsent(name, family.getKey());
        if (other != null) {
          throw new Refusal(
              "the function "
                  + name
                  + " is in two families: "
                  + other
                  + " ("
                  + families.get(other)
                  + ") and "
                  + family.getKey()
                  + " ("
                  + file
                  + ")");
        }
        Map<String, Object> entry =
            new TreeMap<>(object(function.getValue(), file + ": the entry " + name));
        entry.put("family", family.getKey());
        merged.put(name, entry);
      }
    }
    return canonical(merged, "") + "\n";
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> object(Object value, String what) {
    if (!(value instanceof Map<?, ?> members)) {
      throw new Refusal(what + " is no JSON object");
    }
    return (Map<String, Object>) members;
  }

  /**
   * {@code value} in canonical form (ADR-0010): {@code JSON.stringify(value, null, 2)} with the keys
   * sorted by UTF-16 code unit (a TreeMap's order), and every member whose value is an empty array
   * or object left out, but a {@code default}, which may be an empty table.
   */
  private static String canonical(Object value, String indent) {
    String inner = indent + "  ";
    return switch (value) {
      case Map<?, ?> members -> {
        List<String> kept = new ArrayList<>();
        members.forEach(
            (key, member) -> {
              if (key.equals("default") || !empty(member)) {
                kept.add(inner + quote((String) key) + ": " + canonical(member, inner));
              }
            });
        yield kept.isEmpty()
            ? "{}"
            : kept.stream().collect(Collectors.joining(",\n", "{\n", "\n" + indent + "}"));
      }
      case List<?> items ->
          items.stream()
              .map(item -> inner + canonical(item, inner))
              .collect(Collectors.joining(",\n", "[\n", "\n" + indent + "]"));
      case String text -> quote(text);
      case null, default -> String.valueOf(value);
    };
  }

  private static boolean empty(Object value) {
    return value instanceof Map<?, ?> members && members.isEmpty()
        || value instanceof List<?> items && items.isEmpty();
  }

  /**
   * ECMA-262 QuoteJSONString: short escapes, {@code \}{@code u00xx} below U+0020. A lone surrogate,
   * which no catalogue string holds, is written as it is, so its file is refused.
   */
  private static String quote(String text) {
    StringBuilder out = new StringBuilder("\"");
    for (char c : text.toCharArray()) {
      int escape = "\b\t\n\f\r\"\\".indexOf(c);
      if (escape >= 0) {
        out.append('\\').append("btnfr\"\\".charAt(escape));
      } else if (c < 0x20) {
        out.append(String.format("\\u%04x", (int) c));
      } else {
        out.append(c);
      }
    }
    return out.append('"').toString();
  }

  /**
   * A strict reader of the JSON that the canonical form holds (RFC 8259; values are strings, so a
   * number is refused): objects as TreeMaps, arrays as lists, strings, booleans and null.
   */
  private static final class Json {

    private static final Pattern STRING =
        Pattern.compile(
            "\"((?:[^\"\\\\\\x00-\\x1f]++|\\\\[\"\\\\/bfnrt]|\\\\u[0-9a-fA-F]{4})*+)\"");

    private final String text;
    private final Path file;
    private int at;

    Json(String text, Path file) {
      this.text = text;
      this.file = file;
    }

    Object document() {
      Object value = value();
      space();
      expect(at == text.length(), "the end of the document");
      return value;
    }

    private Object value() {
      space();
      if (take("{")) {
        return object();
      }
      if (take("[")) {
        return array();
      }
      if (text.startsWith("\"", at)) {
        return string();
      }
      for (Object literal : new Object[] {true, false, null}) {
        if (take(String.valueOf(literal))) {
          return literal;
        }
      }
      throw new Refusal(file + " is no JSON: a value expected at offset " + at);
    }

    private Map<String, Object> object() {
      Map<String, Object> members = new TreeMap<>();
      space();
      if (take("}")) {
        return members;
      }
      do {
        space();
        expect(text.startsWith("\"", at), "a member name");
        String key = string();
        space();
        expect(take(":"), "':'");
        members.put(key, value());
        space();
      } while (take(","));
      expect(take("}"), "',' or '}'");
      return members;
    }

    private List<Object> array() {
      List<Object> items = new ArrayList<>();
      space();
      if (take("]")) {
        return items;
      }
      do {
        items.add(value());
        space();
      } while (take(","));
      expect(take("]"), "',' or ']'");
      return items;
    }

    private String string() {
      Matcher token = STRING.matcher(text).region(at, text.length());
      expect(token.lookingAt(), "a string");
      at = token.end();
      String raw = token.group(1);
      StringBuilder out = new StringBuilder();
      for (int i = 0; i < raw.length(); i++) {
        char c = raw.charAt(i);
        if (c != '\\') {
          out.append(c);
        } else if (raw.charAt(i + 1) == 'u') {
          out.append((char) Integer.parseInt(raw.substring(i + 2, i + 6), 16));
          i += 5;
        } else {
          out.append("\"\\/\b\f\n\r\t".charAt("\"\\/bfnrt".indexOf(raw.charAt(i + 1))));
          i++;
        }
      }
      return out.toString();
    }

    private void space() {
      while (at < text.length() && " \t\n\r".indexOf(text.charAt(at)) >= 0) {
        at++;
      }
    }

    private boolean take(String token) {
      if (text.startsWith(token, at)) {
        at += token.length();
        return true;
      }
      return false;
    }

    /** Refuses the file unless {@code found}, which is {@code expected} at the offset. */
    private void expect(boolean found, String expected) {
      if (!found) {
        throw new Refusal(file + " is no JSON: " + expected + " expected at offset " + at);
      }
    }
  }

  // --- helper

  private static String helper(SortedMap<String, Path> modules) throws IOException {
    Path core = modules.remove("core");
    if (core == null) {
      throw new Refusal("no core.xsl among the inputs");
    }
    String coreText = Files.readString(core, UTF_8);
    int start = coreText.indexOf("<xsl:stylesheet");
    // core's root start tag and the line end after it
    String rootTag = coreText.substring(start, coreText.indexOf('>', start) + 2);
    Pattern module =
        Pattern.compile("(?s)(.*?" + Pattern.quote(rootTag) + ")(.*)</xsl:stylesheet>\n");
    List<Path> order = new ArrayList<>(List.of(core));
    order.addAll(modules.values());
    StringBuilder out = new StringBuilder();
    for (Path file : order) {
      Matcher parts = module.matcher(Files.readString(file, UTF_8));
      if (!parts.matches()) {
        throw new Refusal(
            file
                + " does not hold core.xsl's root start tag and its line end, byte for byte, or"
                + " does not end with </xsl:stylesheet> and a LF");
      }
      if (out.isEmpty()) {
        // core's prolog and root start tag begin the helper module
        out.append(parts.group(1));
      }
      out.append(parts.group(2));
    }
    return out.append("</xsl:stylesheet>\n").toString();
  }

  // --- index

  private static String index(SortedMap<String, Path> families) {
    return """
        // Generated by scripts/function-families.java from the <Family>Family.java files of
        // engine/runtime (ADR-0025 "Families", F-15): the build writes it into target/.
        package io.flottila.mapping.runtime;

        import java.util.Map;

        /** The runtime's family index: each function family's binders, by family id. */
        final class FamilyIndex {

          /** Each family's queue functions: a catalogue name to its binder. */
          static final Map<String, Map<String, QueueLibrary.Binder>> QUEUE =
              Map.ofEntries(%s);

          /** Each family's single-value functions: a catalogue name to its binder. */
          static final Map<String, Map<String, SingleValueLibrary.Binder>> VALUE =
              Map.ofEntries(%s);

          private FamilyIndex() {}
        }
        """
        .formatted(entries(families, "QUEUE"), entries(families, "VALUE"));
  }

  /** {@code Map.entry(id, <Family>Family.<map>)} per family, one per line. */
  private static String entries(SortedMap<String, Path> families, String map) {
    return families.keySet().stream()
        .map(
            id ->
                "\n          Map.entry(\""
                    + id
                    + "\", "
                    + Character.toUpperCase(id.charAt(0))
                    + id.substring(1)
                    + "Family."
                    + map
                    + ")")
        .collect(Collectors.joining(","));
  }
}
