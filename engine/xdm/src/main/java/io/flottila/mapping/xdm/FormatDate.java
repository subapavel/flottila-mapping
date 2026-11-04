package io.flottila.mapping.xdm;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The engine's one date formatting core (ADR-0003): F&amp;O 3.1 {@code format-dateTime} over the
 * pictures a date pattern compiles to ({@link DatePattern}), as Saxon-HE 12.5 formats them, and the
 * one internal parsing function that mirrors that picture syntax, as F&amp;O has none. The helper
 * module's {@code po:parse-date} parses as {@link #parse} does. Such a picture is literal text,
 * with {@code [[} and {@code ]]} for the square brackets, and the components {@code [Y0001]},
 * {@code [M1]}, {@code [M01]}, {@code [D1]}, {@code [D01]}, {@code [H1]}, {@code [H01]}, {@code
 * [m1]}, {@code [m01]}, {@code [s1]}, {@code [s01]}, {@code [f001]}, {@code [Z0000]} and {@code
 * [Z01:01t]}.
 */
public final class FormatDate {

  /** A picture's tokens: an escaped bracket, a component (group 1), or literal text. */
  private static final Pattern TOKEN =
      Pattern.compile("\\[\\[|\\]\\]|\\[([^\\[\\]]*)\\]|[^\\[\\]]+");

  /** The digits a parse reads for each component. */
  private static final Map<String, String> DIGITS =
      Map.ofEntries(
          Map.entry("Y0001", "[0-9]{4}"),
          Map.entry("M1", "[0-9]{1,2}"),
          Map.entry("M01", "[0-9]{2}"),
          Map.entry("D1", "[0-9]{1,2}"),
          Map.entry("D01", "[0-9]{2}"),
          Map.entry("H1", "[0-9]{1,2}"),
          Map.entry("H01", "[0-9]{2}"),
          Map.entry("m1", "[0-9]{1,2}"),
          Map.entry("m01", "[0-9]{2}"),
          Map.entry("s1", "[0-9]{1,2}"),
          Map.entry("s01", "[0-9]{2}"),
          Map.entry("f001", "[0-9]{3}"),
          Map.entry("Z0000", "[+-][0-9]{4}"),
          Map.entry("Z01:01t", "Z|[+-][0-9]{2}:[0-9]{2}"));

  /** The greatest offset an xs:dateTime has, in minutes: 14 hours. */
  private static final int MAX_OFFSET = 14 * 60;

  private FormatDate() {}

  /**
   * {@code value} written with {@code picture}, in its own offset.
   *
   * @throws IllegalArgumentException when {@code picture} is none that a date pattern compiles to
   */
  public static String format(OffsetDateTime value, String picture) {
    StringBuilder out = new StringBuilder();
    for (Token token : tokens(picture)) {
      out.append(
          switch (token) {
            case Literal literal -> literal.text();
            case Component c -> component(value, c.name(), picture);
          });
    }
    return out.toString();
  }

  /**
   * The date {@code text} writes in {@code picture}: the whole text matches the picture, and its
   * fields make a date and a time of day; a field the picture lacks is that of {@code
   * 1970-01-01T00:00:00.000}, and the offset, when the picture has none, is {@code implicit}.
   *
   * @return the date, or empty when {@code text} writes none
   * @throws IllegalArgumentException when {@code picture} is none that a date pattern compiles to
   */
  public static Optional<OffsetDateTime> parse(String text, String picture, ZoneOffset implicit) {
    StringBuilder regex = new StringBuilder();
    List<String> components = new ArrayList<>();
    for (Token token : tokens(picture)) {
      switch (token) {
        case Literal literal -> regex.append(Pattern.quote(literal.text()));
        case Component c -> {
          String digits = DIGITS.get(c.name());
          if (digits == null) {
            throw unknown(picture);
          }
          regex.append('(').append(digits).append(')');
          components.add(c.name());
        }
      }
    }
    Matcher m = Pattern.compile(regex.toString()).matcher(text);
    if (!m.matches()) {
      return Optional.empty();
    }
    int[] fields = {1970, 1, 1, 0, 0, 0, 0};
    ZoneOffset offset = implicit;
    for (int k = 0; k < components.size(); k++) {
      String name = components.get(k);
      String value = m.group(k + 1);
      switch (name.charAt(0)) {
        case 'Z' -> {
          Optional<ZoneOffset> parsed = offset(value);
          if (parsed.isEmpty()) {
            return Optional.empty();
          }
          offset = parsed.get();
        }
        default -> fields["YMDHmsf".indexOf(name.charAt(0))] = Integer.parseInt(value);
      }
    }
    if (fields[0] == 0) {
      // xs:dateTime has a year 0000 (XSD 1.1), SimpleDateFormat refuses it
      return Optional.empty();
    }
    try {
      return Optional.of(
          OffsetDateTime.of(
              LocalDate.of(fields[0], fields[1], fields[2]),
              LocalTime.of(fields[3], fields[4], fields[5], fields[6] * 1_000_000),
              offset));
    } catch (DateTimeException noDate) {
      return Optional.empty();
    }
  }

  /** The offset {@code text} writes, {@code Z} or a sign with hours and minutes, if in range. */
  private static Optional<ZoneOffset> offset(String text) {
    if (text.equals("Z")) {
      return Optional.of(ZoneOffset.UTC);
    }
    String digits = text.replace(":", "");
    int hours = Integer.parseInt(digits.substring(1, 3));
    int minutes = Integer.parseInt(digits.substring(3));
    if (minutes > 59 || hours * 60 + minutes > MAX_OFFSET) {
      return Optional.empty();
    }
    int sign = text.charAt(0) == '-' ? -1 : 1;
    return Optional.of(ZoneOffset.ofHoursMinutes(sign * hours, sign * minutes));
  }

  /** One token of a picture: {@link Literal} text or a {@link Component}. */
  private sealed interface Token permits Literal, Component {}

  /**
   * Literal text of a picture, an escaped bracket as the bracket itself.
   *
   * @param text the text the token writes
   */
  private record Literal(String text) implements Token {}

  /**
   * A component of a picture.
   *
   * @param name the component's name, such as {@code Y0001}
   */
  private record Component(String name) implements Token {}

  /** The tokens of {@code picture}, in order. */
  private static List<Token> tokens(String picture) {
    List<Token> tokens = new ArrayList<>();
    Matcher m = TOKEN.matcher(picture);
    int end = 0;
    while (m.find()) {
      if (m.start() != end) {
        throw unknown(picture);
      }
      String text = m.group();
      tokens.add(
          m.group(1) != null
              ? new Component(m.group(1))
              : new Literal(text.equals("[[") ? "[" : text.equals("]]") ? "]" : text));
      end = m.end();
    }
    if (end != picture.length()) {
      throw unknown(picture);
    }
    return tokens;
  }

  /** The component {@code name} of {@code value}. */
  private static String component(OffsetDateTime value, String name, String picture) {
    return switch (name) {
      case "Y0001" -> "%04d".formatted(value.getYear());
      case "M1" -> String.valueOf(value.getMonthValue());
      case "M01" -> "%02d".formatted(value.getMonthValue());
      case "D1" -> String.valueOf(value.getDayOfMonth());
      case "D01" -> "%02d".formatted(value.getDayOfMonth());
      case "H1" -> String.valueOf(value.getHour());
      case "H01" -> "%02d".formatted(value.getHour());
      case "m1" -> String.valueOf(value.getMinute());
      case "m01" -> "%02d".formatted(value.getMinute());
      case "s1" -> String.valueOf(value.getSecond());
      case "s01" -> "%02d".formatted(value.getSecond());
      case "f001" -> "%03d".formatted(value.getNano() / 1_000_000);
      case "Z0000" -> zone(value.getOffset(), "");
      case "Z01:01t" ->
          value.getOffset().getTotalSeconds() == 0 ? "Z" : zone(value.getOffset(), ":");
      default -> throw unknown(picture);
    };
  }

  /** {@code offset} as a sign, two digits of hours, {@code separator} and two of minutes. */
  private static String zone(ZoneOffset offset, String separator) {
    int minutes = offset.getTotalSeconds() / 60;
    return (minutes < 0 ? "-" : "+")
        + "%02d".formatted(Math.abs(minutes) / 60)
        + separator
        + "%02d".formatted(Math.abs(minutes) % 60);
  }

  private static IllegalArgumentException unknown(String picture) {
    return new IllegalArgumentException(
        "the picture \"" + picture + "\" is none that a date pattern compiles to (ADR-0003)");
  }
}
