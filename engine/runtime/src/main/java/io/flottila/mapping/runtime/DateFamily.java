package io.flottila.mapping.runtime;

import io.flottila.mapping.ir.AuthoringId;
import io.flottila.mapping.xdm.DatePattern;
import io.flottila.mapping.xdm.FormatDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.function.IntFunction;

/**
 * The function family {@code date} (ADR-0025 "Families", F-15) of #80, over the formatting core
 * (ADR-0003). All are single-value functions whose date patterns are SimpleDateFormat patterns, box
 * params that lowering has checked (ADR-0026) and that are compiled to an XPath picture per value.
 * A date is read strictly in its pattern ({@link FormatDate#parse}), in the run's offset when the
 * pattern has none; a date the pattern does not read is {@code err:FORG0001} at the function box. A
 * date is written in the run's offset, as a SimpleDateFormat writes in its zone, and dates are
 * compared as instants. The binders are methods, not lambdas of the maps, so that PIT mutates them.
 */
final class DateFamily {

  /** The family's queue functions: it has none. */
  static final Map<String, QueueLibrary.Binder> QUEUE = Map.of();

  /** The family's single-value functions. */
  static final Map<String, SingleValueLibrary.Binder> VALUE =
      Map.ofEntries(
          Map.entry("compareDates", DateFamily::compareDates),
          Map.entry("dateAfter", DateFamily::dateAfter),
          Map.entry("dateBefore", DateFamily::dateBefore),
          Map.entry("dateTrans", DateFamily::dateTrans));

  private DateFamily() {}

  /**
   * {@code dateTrans(date, sourceFormat, targetFormat)}: the date read in {@code sourceFormat},
   * written in {@code targetFormat} in the run's offset.
   */
  static Node.OfString dateTrans(AuthoringId box, List<Node.OfString> args) {
    Node.OfString date = args.get(0);
    Node.OfString source = args.get(1);
    Node.OfString target = args.get(2);
    return frame -> {
      ZoneOffset zone = frame.now.getOffset();
      OffsetDateTime read = date("dateTrans", box, date.eval(frame), source.eval(frame), zone);
      return FormatDate.format(
          read.withOffsetSameInstant(zone), DatePattern.picture(target.eval(frame)));
    };
  }

  /** {@code dateBefore(date1, date2, format1, format2)}: whether date1 is before date2. */
  static Node.OfString dateBefore(AuthoringId box, List<Node.OfString> args) {
    return comparison("dateBefore", box, args, order -> Boolean.toString(order < 0));
  }

  /** {@code dateAfter(date1, date2, format1, format2)}: whether date1 is after date2. */
  static Node.OfString dateAfter(AuthoringId box, List<Node.OfString> args) {
    return comparison("dateAfter", box, args, order -> Boolean.toString(order > 0));
  }

  /**
   * {@code compareDates(date1, date2, format1, format2)}: -1, 0 or 1 as date1 is before, at or
   * after.
   */
  static Node.OfString compareDates(AuthoringId box, List<Node.OfString> args) {
    return comparison("compareDates", box, args, order -> Integer.toString(Integer.signum(order)));
  }

  /**
   * The node of {@code function} over {@code date1, date2, format1, format2}: {@code result} of the
   * order of the two instants, each date read in its own format.
   */
  private static Node.OfString comparison(
      String function, AuthoringId box, List<Node.OfString> args, IntFunction<String> result) {
    Node.OfString first = args.get(0);
    Node.OfString second = args.get(1);
    Node.OfString firstFormat = args.get(2);
    Node.OfString secondFormat = args.get(3);
    return frame -> {
      ZoneOffset zone = frame.now.getOffset();
      OffsetDateTime a = date(function, box, first.eval(frame), firstFormat.eval(frame), zone);
      OffsetDateTime b = date(function, box, second.eval(frame), secondFormat.eval(frame), zone);
      return result.apply(a.toInstant().compareTo(b.toInstant()));
    };
  }

  /**
   * The date {@code text} writes in {@code pattern}, in {@code zone} when the pattern has no
   * offset, or {@code err:FORG0001} at {@code box} when it writes none.
   */
  private static OffsetDateTime date(
      String function, AuthoringId box, String text, String pattern, ZoneOffset zone) {
    return FormatDate.parse(text, DatePattern.picture(pattern), zone)
        .orElseThrow(
            () ->
                MappingRunException.dataError(
                    RuntimeErrors.FORG0001,
                    box,
                    function + ": '" + text + "' is no date in the pattern " + pattern,
                    null));
  }
}
