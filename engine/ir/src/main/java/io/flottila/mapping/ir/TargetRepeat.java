package io.flottila.mapping.ir;

/**
 * A fixed number of occurrences of one target field per parent occurrence (ADR-0006 "Target
 * fields"; #63): {@code body} {@code copies} times, the j-th with the slot number {@code (p - 1) *
 * copies + j} bound to {@code slotVar}, where {@code p} is the parent's slot number. Its children
 * read their queues under that slot number, as under a {@link TargetSlots}' slot. It reads no queue
 * of its own, so it has no value and no min check. Since #63 it creates an unmapped structure field
 * whose effective occurrence is {@code n..n} with {@code n > 0}, {@code n} times.
 *
 * @param copies the occurrences per parent occurrence, at least 1
 * @param parentSlot the parent's slot number, an {@code INTEGER}
 * @param slotVar the {@code INTEGER} variable that holds the occurrence's slot number inside {@code
 *     body}, which its children read as their {@code parentSlot}
 * @param body the content created per occurrence
 * @param origin no authoring element creates an unmapped field, so its field path as the mapping
 *     model spells it, which no authoring id can be (ADR-0010 allows no {@code /} in one)
 */
public record TargetRepeat(
    long copies, Expr parentSlot, String slotVar, Expr body, AuthoringId origin)
    implements Expr {}
