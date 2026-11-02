package io.flottila.mapping.ir;

/**
 * The occurrences of one target field (ADR-0006): {@code body} once per slot of context {@code p}
 * of {@code queue}, where {@code p} is the parent's slot number, with the slot's value bound to
 * {@code valueVar}. Creation stops after {@code max} occurrences. Spec 1 carries {@code min} but
 * does not enforce it; {@code po:MINOCCURS} is spec 2.
 *
 * @param queue the target field's queue
 * @param parentSlot the parent's slot number, an {@code INTEGER}
 * @param min the effective minimum occurrence
 * @param max the effective maximum occurrence; {@link Long#MAX_VALUE} is unbounded
 * @param valueVar the {@code STRING} variable that holds the slot's value inside {@code body}
 * @param body the content created per slot
 * @param origin the target field mapping
 */
public record TargetSlots(
    Expr queue, Expr parentSlot, long min, long max, String valueVar, Expr body, AuthoringId origin)
    implements Expr {}
