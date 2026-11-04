package io.flottila.mapping.xdm;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Objects;
import java.util.concurrent.CancellationException;
import java.util.function.IntFunction;

/**
 * The context functions of the runtime library over queue blocks (ADR-0025): the algebra, where the
 * sharing rules of ADR-0004 hold. {@code engine/runtime} binds each by its catalogue name. A
 * function never changes its input; a block is immutable.
 */
public final class ContextFunctions {

  private ContextFunctions() {}

  /**
   * {@code collapseContexts}: the first value of each context of {@code queue}, and {@code ""} for
   * an empty context, all in one context (#2 §4). A first slot that is SUPPRESS gives {@code ""}
   * too, as SAP takes SUPPRESS there for an empty value (an assumed reading, #2 §7.4, obs ctx-6b),
   * so the result holds no SUPPRESS. It copies references only (ADR-0004). A queue with no context
   * at all gives one empty context, as {@link #removeContexts} does.
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock collapseContexts(QueueBlock queue) {
    String[] firsts = new String[queue.contexts()];
    for (int c = 0; c < firsts.length; c++) {
      checkInterrupt("collapseContexts");
      // an empty context and a SUPPRESS first slot both give the null that "" replaces
      String first = queue.end(c) > queue.start(c) ? queue.value(queue.start(c)) : null;
      firsts[c] = Objects.requireNonNullElse(first, "");
    }
    return QueueBlock.ofOneContext(firsts);
  }

  /**
   * {@code createIf}: per slot of {@code condition}, {@code ""} where it is {@code 1} or {@code
   * true} in any case, and SUPPRESS for anything else, {@code ""} and SUPPRESS included (#2 §4 and
   * §5; the assumed truth rule of ADR-0006 since #51). White space is part of a value. The result
   * keeps the slots and shares the context starts of {@code condition} (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock createIf(QueueBlock condition) {
    String[] values = new String[condition.slots()];
    for (int i = 0; i < values.length; i++) {
      // inline, as the block's own read of the values after this loop checks too (ADR-0021)
      if (Thread.currentThread().isInterrupted()) {
        throw new CancellationException("createIf was running when the thread was interrupted");
      }
      // a SUPPRESS slot's value is null, which neither call takes for true
      String value = condition.value(i);
      if ("1".equals(value) || "true".equalsIgnoreCase(value)) {
        values[i] = "";
      }
    }
    return condition.withValues(values);
  }

  /**
   * {@code exists}: per context of {@code queue}, one context holding {@code true} if the context
   * holds a value and {@code false} if it holds none (#2 §4, one value per context assumed, #2
   * §7.7). SUPPRESS is no value, so a context of SUPPRESS only gives {@code false}, as {@link
   * #mapWithDefault} takes it for empty (assumed, #57); {@code ""} is a value. A queue with no
   * context at all gives none.
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock exists(QueueBlock queue) {
    String[] values = new String[queue.contexts()];
    int[] starts = new int[values.length + 1];
    for (int c = 0; c < values.length; c++) {
      // one check per context: holdsValue reads its slots, bounded by their count
      checkInterrupt("exists");
      values[c] = String.valueOf(holdsValue(queue, c));
      starts[c + 1] = c + 1;
    }
    return QueueBlock.ofSlots(values, starts);
  }

  /**
   * Whether the context at index {@code context} of {@code queue} holds a slot that is no SUPPRESS.
   */
  private static boolean holdsValue(QueueBlock queue, int context) {
    for (int i = queue.start(context); i < queue.end(context); i++) {
      if (!queue.suppressed(i)) {
        return true;
      }
    }
    return false;
  }

  /**
   * {@code formatByExample(values, example)}: every slot of {@code values}, in order, split at the
   * context changes of {@code example}, empty contexts included (#2 §4). The contexts of {@code
   * values} play no part. It shares the values array and the SUPPRESS bitset of {@code values} and
   * the context starts of {@code example}, so it copies nothing (ADR-0004). A SUPPRESS of {@code
   * values} stays SUPPRESS at its slot, and a SUPPRESS of {@code example} counts as a value (an
   * assumed reading since #51).
   *
   * @throws QueueDataException unless both queues hold as many values: the SAP documentation
   *     requires equal counts, where empty contexts are not counted, and raises an exception
   *     otherwise (#2 §4)
   * @throws CancellationException when the thread is interrupted while the context starts are
   *     checked
   */
  public static QueueBlock formatByExample(QueueBlock values, QueueBlock example) {
    if (values.slots() != example.slots()) {
      throw new QueueDataException(
          "formatByExample needs as many values in its first input as in its second: the first"
              + " has "
              + values.slots()
              + " values, the second "
              + example.slots()
              + " values");
    }
    return values.withContextsOf(example);
  }

  /**
   * {@code mapWithDefault(queue, defaultValue)}: every context of {@code queue} that holds no value
   * replaced by one context holding {@code defaultValue}, every other context kept with its slots,
   * SUPPRESS included (#2 §4). A context of SUPPRESS only holds no value, so it is replaced too (an
   * assumed reading, #2 §7.6, obs ctx-2); {@code ""} is a value. A queue with no context at all
   * gives none, so only a context that is there is filled. It copies references only (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock mapWithDefault(QueueBlock queue, String defaultValue) {
    // a context keeps its slots or gets one, so the result has at most one slot per context more
    String[] values = new String[queue.slots() + queue.contexts()];
    int[] starts = new int[queue.contexts() + 1];
    int slots = 0;
    for (int c = 0; c < queue.contexts(); c++) {
      // one check per context: its slots are read below, bounded by their count
      checkInterrupt("mapWithDefault");
      starts[c] = slots;
      if (holdsValue(queue, c)) {
        for (int i = queue.start(c); i < queue.end(c); i++) {
          values[slots++] = queue.value(i);
        }
      } else {
        values[slots++] = defaultValue;
      }
    }
    starts[queue.contexts()] = slots;
    return QueueBlock.ofSlots(Arrays.copyOf(values, slots), starts);
  }

  /**
   * {@code removeContexts}: every slot of {@code queue}, in order, in one context, each SUPPRESS at
   * its own slot. It shares the values array and the SUPPRESS bitset and builds only the context
   * starts {@code {0, n}} (ADR-0004), so a queue with no context at all gives one empty context.
   */
  public static QueueBlock removeContexts(QueueBlock queue) {
    return queue.withContextStarts(new int[] {0, queue.slots()});
  }

  // sort and sortByKey (#59, owner decision Q4 of #48): each context on its own, a stable sort
  // (#2 §4), so equal keys keep their input order in either direction. The runtime binds the
  // comparison and the direction once per call site. A SUPPRESS key is the smallest key in every
  // comparison, so it comes first ascending and last descending, and a numeric sort does not parse
  // it; a SUPPRESS value moves with its key and stays SUPPRESS, as the result's bitset is read off
  // its values (assumed since #51, #61). A numeric sortByKey key must not be SUPPRESS (#2 §3,
  // documented): ADR-0006 since #51.

  /** How a sort compares two keys (owner decision Q4 of #48). */
  public enum Comparison {
    /** {@link String#compareTo}: by UTF-16 code unit, so U+1F600 comes before U+FF21. */
    LEXICOGRAPHIC,
    /** {@link String#compareToIgnoreCase}: by code point, each folded to lower of upper case. */
    CASE_INSENSITIVE,
    /**
     * By decimal value. Every key must be in the {@code xs:decimal} lexical form (ADR-0005), XML
     * whitespace around it allowed, as the export's cast collapses it; anything else stops the
     * sort.
     */
    NUMERIC
  }

  /**
   * {@code sort}: the values of each context of {@code queue} in the order of {@code comparison},
   * ascending or {@code descending}. The contexts stay as they are; the result copies references
   * only and shares the context starts (ADR-0004).
   *
   * @throws QueueDataException when {@code comparison} is numeric and a value is no decimal
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock sort(QueueBlock queue, Comparison comparison, boolean descending) {
    return sorted("sort", queue, queue, comparison, descending, true);
  }

  /**
   * {@code sortByKey}: the values of each context of {@code values} in the order of the keys at the
   * same slots of {@code keys} (#2 §4), by {@code comparison}, ascending or {@code descending}.
   * Only the keys are compared, so only they are parsed. The result copies references only and
   * shares the context starts of {@code values} (ADR-0004).
   *
   * @throws QueueDataException unless both queues have the same number of contexts and each context
   *     as many keys as values, or when {@code comparison} is numeric and a key is no decimal or is
   *     SUPPRESS (#2 §3: "numeric keys must not be equal to the constant ResultList.SUPPRESS")
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock sortByKey(
      QueueBlock keys, QueueBlock values, Comparison comparison, boolean descending) {
    if (keys.contexts() != values.contexts()) {
      throw new QueueDataException(
          "sortByKey needs one context of keys per context of values; contexts of keys: "
              + keys.contexts()
              + ", of values: "
              + values.contexts());
    }
    return sorted("sortByKey", keys, values, comparison, descending, false);
  }

  /**
   * The values of {@code values}, each context ordered by the keys at the same slots of {@code
   * keys}, which has as many contexts. A context with more or fewer keys than values stops it; the
   * contexts before it had as many, so the two queues' starts agree up to it. A numeric key may be
   * SUPPRESS only when {@code suppressKeys}.
   */
  private static QueueBlock sorted(
      String function,
      QueueBlock keys,
      QueueBlock values,
      Comparison comparison,
      boolean descending,
      boolean suppressKeys) {
    String[] sorted = new String[values.slots()];
    for (int c = 0; c < values.contexts(); c++) {
      // one check per context: a context's slots are read and sorted below, bounded by their count
      checkInterrupt(function);
      if (keys.end(c) != values.end(c)) {
        throw new QueueDataException(
            function
                + " needs as many keys as values in each context; in context "
                + (c + 1)
                + " keys: "
                + (keys.end(c) - keys.start(c))
                + ", values: "
                + (values.end(c) - values.start(c)));
      }
      int start = values.start(c);
      Integer[] slots = new Integer[values.end(c) - start];
      for (int k = 0; k < slots.length; k++) {
        slots[k] = start + k;
      }
      Comparator<Integer> order =
          order(function, keys, start, slots.length, comparison, suppressKeys);
      // Arrays.sort of objects is stable, and a reversed order keeps ties as they are
      Arrays.sort(slots, descending ? order.reversed() : order);
      for (int k = 0; k < slots.length; k++) {
        sorted[start + k] = values.value(slots[k]);
      }
    }
    return values.withValues(sorted);
  }

  /**
   * The order of the slots {@code start} to {@code start + size} of {@code keys}, by their keys. A
   * SUPPRESS key comes before every other key and is not parsed, except that in a numeric
   * comparison it stops the sort unless {@code suppressKeys} (ADR-0006 since #51).
   */
  private static Comparator<Integer> order(
      String function,
      QueueBlock keys,
      int start,
      int size,
      Comparison comparison,
      boolean suppressKeys) {
    return switch (comparison) {
      case LEXICOGRAPHIC -> suppressFirst(keys::value, String::compareTo);
      case CASE_INSENSITIVE -> suppressFirst(keys::value, String::compareToIgnoreCase);
      case NUMERIC -> {
        // every key is parsed, once, even alone in its context where nothing is compared
        BigDecimal[] numbers = new BigDecimal[size];
        for (int k = 0; k < size; k++) {
          // a SUPPRESS key's value is null, which stays null where it may stand
          String key = keys.value(start + k);
          if (key == null && !suppressKeys) {
            throw new QueueDataException(
                function
                    + " compares numerically, and a key is SUPPRESS, which a numeric key must not"
                    + " be (#2 §3)");
          }
          numbers[k] = key == null ? null : decimal(function, key);
        }
        yield suppressFirst(i -> numbers[i - start], BigDecimal::compareTo);
      }
    };
  }

  /** The slots in the order of their {@code key}s by {@code order}, a null key, SUPPRESS, first. */
  private static <K> Comparator<Integer> suppressFirst(IntFunction<K> key, Comparator<K> order) {
    Comparator<K> keys = Comparator.nullsFirst(order);
    return (i, j) -> keys.compare(key.apply(i), key.apply(j));
  }

  /** {@code value} as a decimal, read by {@link XsDecimal#parse} as the export reads it. */
  private static BigDecimal decimal(String function, String value) {
    return XsDecimal.parse(value)
        .orElseThrow(
            () ->
                new QueueDataException(
                    function
                        + " compares numerically, and \""
                        + value
                        + "\" is not in the xs:decimal lexical form (ADR-0005)"));
  }

  // splitByValue (#55): one function per mode, which the runtime binds once per call site. Each
  // splits every context of its input on its own, so the input's context boundaries stay, and an
  // empty context stays one empty context. A context gives at most one context more than it has
  // slots, which bounds the starts array by slots + contexts + 1, the end sentinel included. A
  // SUPPRESS slot stays a slot in every mode (an assumed reading since #51).

  /**
   * {@code splitByValue} in mode {@code eachValue}: every value, and every SUPPRESS, in a context
   * of its own. It shares the values array and the SUPPRESS bitset and builds only the context
   * starts (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock splitByEachValue(QueueBlock queue) {
    return split(queue, true);
  }

  /**
   * {@code splitByValue} in mode {@code valueChange}: a new context at every value that is not
   * equal to the value before it in its context, as {@link String#equals} compares. SUPPRESS equals
   * SUPPRESS and no value, as SAP's SUPPRESS string would compare (an assumed reading since #51).
   * It shares the values array and the SUPPRESS bitset and builds only the context starts
   * (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock splitByValueChange(QueueBlock queue) {
    return split(queue, false);
  }

  /**
   * The context starts of {@code queue} plus one at each slot that starts a context: every slot
   * when {@code eachValue}, otherwise each slot whose value differs from the slot before it.
   */
  private static QueueBlock split(QueueBlock queue, boolean eachValue) {
    int[] starts = new int[queue.slots() + queue.contexts() + 1];
    int count = 0;
    for (int c = 0; c < queue.contexts(); c++) {
      // one check per context: its slots are read below, bounded by their count (ADR-0021)
      checkInterrupt("splitByValue");
      starts[count++] = queue.start(c);
      for (int i = queue.start(c) + 1; i < queue.end(c); i++) {
        // a SUPPRESS slot's value is null, which equals only another SUPPRESS slot's
        if (eachValue || !Objects.equals(queue.value(i), queue.value(i - 1))) {
          starts[count++] = i;
        }
      }
    }
    starts[count++] = queue.slots();
    // the block checks the starts it is given, and for interruption on the way, too
    return queue.withContextStarts(Arrays.copyOf(starts, count));
  }

  /**
   * {@code splitByValue} in mode {@code emptyValue}: every {@code ""} ends its context there and
   * starts a new one, and is itself dropped, so a {@code ""} first or last in a context leaves an
   * empty context there. SUPPRESS is no {@code ""}, so it stays a slot (an assumed reading since
   * #51). Dropping values needs a values array of its own, which holds the input's value objects:
   * no characters are copied (ADR-0004).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock splitByEmptyValue(QueueBlock queue) {
    String[] values = new String[queue.slots()];
    int[] starts = new int[queue.slots() + queue.contexts() + 1];
    int slots = 0;
    int count = 0;
    for (int c = 0; c < queue.contexts(); c++) {
      // one check per context: its slots are read below, bounded by their count (ADR-0021)
      checkInterrupt("splitByValue");
      starts[count++] = slots;
      for (int i = queue.start(c); i < queue.end(c); i++) {
        // a SUPPRESS slot's value is null, which is no ""
        String value = queue.value(i);
        if ("".equals(value)) {
          starts[count++] = slots;
        } else {
          values[slots++] = value;
        }
      }
    }
    starts[count++] = slots;
    return QueueBlock.ofSlots(Arrays.copyOf(values, slots), Arrays.copyOf(starts, count));
  }

  /**
   * {@code useOneAsMany(value, occurrences, contexts)}: the value at slot index k of {@code value}
   * once per slot of context k of {@code occurrences}, in order, split at the context starts of
   * {@code contexts}, which it shares (#2 §4). It copies references only (ADR-0004). The contexts
   * of {@code value} play no part: its values meet the contexts of {@code occurrences} in order. A
   * SUPPRESS value is repeated as SUPPRESS, a SUPPRESS slot of {@code occurrences} is an occurrence
   * like any other, and the slots of {@code contexts} give only their boundaries (assumed readings
   * since #51).
   *
   * @throws QueueDataException unless {@code value} has one slot per context of {@code occurrences}
   *     and {@code contexts} as many slots as {@code occurrences}: the assumed reading of the error
   *     conditions (#2 §7.10)
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock useOneAsMany(
      QueueBlock value, QueueBlock occurrences, QueueBlock contexts) {
    if (value.slots() != occurrences.contexts()) {
      throw new QueueDataException(
          "useOneAsMany needs one value of its first input per context of its second: the first"
              + " has "
              + value.slots()
              + " values, the second "
              + occurrences.contexts()
              + " contexts");
    }
    if (contexts.slots() != occurrences.slots()) {
      throw new QueueDataException(
          "useOneAsMany needs as many slots in its third input as in its second: the third has "
              + contexts.slots()
              + " slots, the second "
              + occurrences.slots());
    }
    // the slots of occurrences, counted across its contexts, are the slots of the result; a
    // SUPPRESS value is a null, repeated as one
    String[] repeated = new String[occurrences.slots()];
    for (int k = 0; k < occurrences.contexts(); k++) {
      // one check per context: its slots are filled in one call, without a loop of this class
      checkInterrupt("useOneAsMany");
      Arrays.fill(repeated, occurrences.start(k), occurrences.end(k), value.value(k));
    }
    return contexts.withValues(repeated);
  }

  /** Every loop over slots or contexts checks for interruption (ADR-0021). */
  private static void checkInterrupt(String function) {
    if (Thread.currentThread().isInterrupted()) {
      throw new CancellationException(function + " was running when the thread was interrupted");
    }
  }
}
