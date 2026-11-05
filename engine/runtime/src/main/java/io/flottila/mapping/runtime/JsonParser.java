package io.flottila.mapping.runtime;

import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The runtime's own small JSON pull parser (ADR-0008 "JSON as a source at run time", #98; FOUNDING
 * §8: no new dependency). It reads one JSON text by RFC 8259 and gives it as a sequence of events,
 * with no tree: {@link #next()} returns the next one, and {@link #text()} the key, string or number
 * of the last. A number keeps its input spelling, a string and a key are what they escape. Anything
 * else is malformed input: a text that RFC 8259 refuses, content after the value, or an object
 * with one key twice, which compares keys as the strings they escape. Its state is a stack of the
 * open containers, so deep nesting needs no call stack.
 */
final class JsonParser {

  static final int START_OBJECT = 0;
  static final int END_OBJECT = 1;
  static final int START_ARRAY = 2;
  static final int END_ARRAY = 3;

  /** A member's key; its value follows. */
  static final int KEY = 4;

  static final int STRING = 5;
  static final int NUMBER = 6;
  static final int TRUE = 7;
  static final int FALSE = 8;
  static final int NULL = 9;

  /** The end of the input, after the one value. */
  static final int END = 10;

  /** Expects a value: the input's, a member's after its key, or an array's after a comma. */
  private static final int VALUE = 0;

  /** After {@code [}: a value or {@code ]}. */
  private static final int FIRST_ITEM = 1;

  /** After <code>{</code>: a key or <code>}</code>. */
  private static final int FIRST_KEY = 2;

  /** After a comma in an object: a key. */
  private static final int NEXT_KEY = 3;

  /** After a value: a comma or the end of its container, or the end of the input at the top. */
  private static final int AFTER_VALUE = 4;

  private final Reader in;
  private final char[] buffer = new char[8192];
  private int position;
  private int limit;

  /** The characters read before {@link #buffer}'s first, for the position a message names. */
  private long before;

  /** Per open container, outermost first: whether it is an array. */
  private boolean[] arrays = new boolean[16];

  private int depth;

  /** Per open container's depth, an object's keys so far; reused by the next at that depth. */
  private final List<Set<String>> keys = new ArrayList<>();

  private int state = VALUE;

  /** Whether the value the last event started is an item of an array. */
  private boolean item;

  /** The key, string or number of the last event. */
  private final StringBuilder text = new StringBuilder();

  JsonParser(Reader in) {
    this.in = in;
  }

  /**
   * The next event.
   *
   * @throws MalformedInputException when the input is no JSON text, or an object has a key twice
   * @throws IOException when the input cannot be read, or is no UTF-8
   */
  int next() throws MalformedInputException, IOException {
    int c = skipWhitespace();
    return switch (state) {
      case VALUE -> value(c);
      case FIRST_ITEM -> c == ']' ? close() : value(c);
      case FIRST_KEY -> c == '}' ? close() : key(c);
      case NEXT_KEY -> key(c);
      default -> afterValue(c);
    };
  }

  /** The key, string or number of the last event, a number as the input spells it. */
  String text() {
    return text.toString();
  }

  /** Whether the value the last event started, an object, an array or a scalar, is an item. */
  boolean item() {
    return item;
  }

  private int afterValue(int c) throws MalformedInputException, IOException {
    if (depth == 0) {
      if (c != -1) {
        throw malformed("content after the JSON value");
      }
      return END;
    }
    boolean array = arrays[depth - 1];
    if (c == ',') {
      position++;
      int next = skipWhitespace();
      return array ? value(next) : key(next);
    }
    if (c != (array ? ']' : '}')) {
      throw malformed(array ? "expected , or ] in an array" : "expected , or } in an object");
    }
    return close();
  }

  /** Ends the innermost container at its closing bracket. */
  private int close() {
    position++;
    depth--;
    state = AFTER_VALUE;
    return arrays[depth] ? END_ARRAY : END_OBJECT;
  }

  private int key(int c) throws MalformedInputException, IOException {
    if (c != '"') {
      throw malformed("expected a key");
    }
    string();
    String key = text();
    if (!keys.get(depth - 1).add(key)) {
      throw malformed("duplicate key \"" + key + "\" in an object");
    }
    if (skipWhitespace() != ':') {
      throw malformed("expected : after a key");
    }
    position++;
    state = VALUE;
    return KEY;
  }

  private int value(int c) throws MalformedInputException, IOException {
    item = depth > 0 && arrays[depth - 1];
    state = AFTER_VALUE;
    return switch (c) {
      case '{' -> open(false, FIRST_KEY, START_OBJECT);
      case '[' -> open(true, FIRST_ITEM, START_ARRAY);
      case '"' -> {
        string();
        yield STRING;
      }
      case 't' -> literal("true", TRUE);
      case 'f' -> literal("false", FALSE);
      case 'n' -> literal("null", NULL);
      case -1 -> throw malformed("expected a value, not the end of the input");
      default -> number(c);
    };
  }

  /** Starts a container at its opening bracket. */
  private int open(boolean array, int next, int event) {
    position++;
    if (depth == arrays.length) {
      arrays = java.util.Arrays.copyOf(arrays, depth * 2);
    }
    arrays[depth++] = array;
    // a set per depth, an array's unused, so that an object's is at its depth
    if (keys.size() < depth) {
      keys.add(new HashSet<>());
    }
    keys.get(depth - 1).clear();
    state = next;
    return event;
  }

  private int literal(String word, int event) throws MalformedInputException, IOException {
    for (int i = 0; i < word.length(); i++) {
      if (peek() != word.charAt(i)) {
        throw malformed("expected " + word);
      }
      position++;
    }
    return event;
  }

  /**
   * The number at {@code c}, by RFC 8259 §6: an optional minus, an integer part without a leading
   * zero, then an optional fraction and exponent.
   */
  private int number(int c) throws MalformedInputException, IOException {
    text.setLength(0);
    if (c == '-') {
      take();
    }
    if (peek() == '0') {
      take();
    } else {
      digits("a digit");
    }
    if (peek() == '.') {
      take();
      digits("a digit after the decimal point");
    }
    if (peek() == 'e' || peek() == 'E') {
      take();
      if (peek() == '+' || peek() == '-') {
        take();
      }
      digits("a digit in the exponent");
    }
    return NUMBER;
  }

  /** One digit or more, taken into {@link #text}; {@code what} names a missing first. */
  private void digits(String what) throws MalformedInputException, IOException {
    if (!digit(peek())) {
      throw malformed("expected " + what);
    }
    while (digit(peek())) {
      take();
    }
  }

  private static boolean digit(int c) {
    return c >= '0' && c <= '9';
  }

  /** Takes the next character into {@link #text}. */
  private void take() {
    text.append(buffer[position++]);
  }

  /** The string at its opening quote, what it escapes taken into {@link #text}. */
  private void string() throws MalformedInputException, IOException {
    text.setLength(0);
    position++;
    while (true) {
      int c = peek();
      if (c == -1) {
        throw malformed("a string without its closing quote");
      }
      position++;
      if (c == '"') {
        return;
      }
      if (c < 0x20) {
        throw malformed("a control character in a string");
      }
      text.append(c == '\\' ? escape() : (char) c);
    }
  }

  /** The character the escape after a backslash stands for (RFC 8259 §7). */
  private char escape() throws MalformedInputException, IOException {
    int c = peek();
    position++;
    return switch (c) {
      case '"', '\\', '/' -> (char) c;
      case 'b' -> '\b';
      case 'f' -> '\f';
      case 'n' -> '\n';
      case 'r' -> '\r';
      case 't' -> '\t';
      case 'u' -> {
        int code = 0;
        for (int i = 0; i < 4; i++) {
          int digit = hex(peek());
          if (digit < 0) {
            throw malformed("expected four hex digits after \\u");
          }
          position++;
          code = code * 16 + digit;
        }
        yield (char) code;
      }
      default -> throw malformed("an escape that RFC 8259 does not define");
    };
  }

  /** The value of an ASCII hex digit, or -1: {@code Character.digit} takes other digits too. */
  private static int hex(int c) {
    if (c >= '0' && c <= '9') {
      return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
      return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F') {
      return c - 'A' + 10;
    }
    return -1;
  }

  /** The next character that is no white space (RFC 8259 §2), not taken, or -1 at the end. */
  private int skipWhitespace() throws IOException {
    int c = peek();
    while (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
      position++;
      c = peek();
    }
    return c;
  }

  /** The next character, not taken, or -1 at the end of the input. */
  private int peek() throws IOException {
    if (position == limit) {
      before += limit;
      position = 0;
      limit = Math.max(in.read(buffer, 0, buffer.length), 0);
      if (limit == 0) {
        return -1;
      }
    }
    return buffer[position];
  }

  private MalformedInputException malformed(String why) {
    return new MalformedInputException(
        why + " at character " + (before + position + 1) + " of the JSON input", null);
  }
}
