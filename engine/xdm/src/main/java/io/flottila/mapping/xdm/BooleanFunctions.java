package io.flottila.mapping.xdm;

import java.util.concurrent.CancellationException;

/**
 * The queue algebra of the function family boolean (ADR-0025 "Families", #78): {@code
 * ifWithoutElse}, a context function because it makes SUPPRESS (ADR-0006). Only the exact text
 * {@code true} is true, as in the family's single-value functions (#77). A function never changes
 * its input; a block is immutable.
 */
public final class BooleanFunctions {

  private BooleanFunctions() {}

  /**
   * {@code ifWithoutElse(condition, then; keepSuppressValues)}, its inputs paired as a Lift pairs
   * them (ADR-0006):
   *
   * <ul>
   *   <li>context i of the result pairs context i of both inputs, and the result has as many
   *       contexts as the input with the most;
   *   <li>if either input's context i is empty or missing, result context i is empty;
   *   <li>otherwise the longer input sets the slot count, and the shorter reuses its last value
   *       inside the context;
   *   <li>SUPPRESS in either input at a slot gives SUPPRESS there, whatever the parameter;
   *   <li>otherwise a condition {@code true} gives the {@code then} value, and any other condition
   *       gives SUPPRESS when {@code keepSuppressValues} and no slot at all when not.
   * </ul>
   *
   * The parameter and its default, false, are an assumed reading of SAP's empty-string and SUPPRESS
   * else values (#2 §3, #78; obs-ifwithoutelse).
   *
   * @throws CancellationException when the thread is interrupted
   */
  public static QueueBlock ifWithoutElse(
      QueueBlock condition, QueueBlock then, boolean keepSuppressValues) {
    int contexts = Math.max(condition.contexts(), then.contexts());
    QueueBlock.Builder result = new QueueBlock.Builder();
    for (int c = 0; c < contexts; c++) {
      // one check per context: its slots are read below, bounded by the longer input's count
      if (Thread.currentThread().isInterrupted()) {
        throw new CancellationException(
            "ifWithoutElse was running when the thread was interrupted");
      }
      result.newContext();
      int count = count(condition, then, c);
      for (int j = 0; j < count; j++) {
        int test = Math.min(condition.start(c) + j, condition.end(c) - 1);
        int value = Math.min(then.start(c) + j, then.end(c) - 1);
        if (condition.suppressed(test) || then.suppressed(value)) {
          result.appendSuppress();
        } else if (condition.value(test).equals("true")) {
          result.append(then.value(value));
        } else if (keepSuppressValues) {
          result.appendSuppress();
        }
      }
    }
    return result.build();
  }

  /**
   * The slot count of result context {@code c}: none when the context {@code c} of {@code
   * condition} or of {@code then} is empty or missing, else that of the longer.
   */
  private static int count(QueueBlock condition, QueueBlock then, int c) {
    int conditions = c < condition.contexts() ? condition.end(c) - condition.start(c) : 0;
    int values = c < then.contexts() ? then.end(c) - then.start(c) : 0;
    return conditions == 0 || values == 0 ? 0 : Math.max(conditions, values);
  }
}
