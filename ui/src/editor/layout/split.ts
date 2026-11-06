/** The pane before a splitter (top or left) or the one after it (bottom or right). */
export type Pane = 'start' | 'end';

/** A splitter's state: the start pane's share of the space, and the pane collapsed fully, if any (ADR-0012). */
export interface Split {
  /** The start pane's share while no pane is collapsed, kept while one is so that restoring returns to it. */
  ratio: number;
  collapsed: Pane | null;
}

export interface SplitRules {
  /** The ratio a splitter starts with, and returns to on a double-click. */
  initial: number;
  /** The panes that collapse fully; Enter collapses the first. */
  collapsible: readonly [Pane, ...Pane[]];
}

/** A pane that does not collapse keeps at least this share; a collapsible one collapses below it. */
const MIN_SHARE = 0.1;
const MAX_SHARE = 1 - MIN_SHARE;
const STEP = 0.05;

/** The start pane's share on screen: the ratio, 0 with the start pane collapsed and 1 with the end pane collapsed. */
export function shown(split: Split): number {
  if (split.collapsed === 'start') return 0;
  if (split.collapsed === 'end') return 1;
  return split.ratio;
}

/**
 * The split with the splitter dragged to `fraction` of the space, rounded to a percent. Below the smallest share a
 * collapsible pane collapses and the ratio is kept for its restore; a pane that cannot collapse keeps the smallest share.
 */
export function dragged(split: Split, fraction: number, rules: SplitRules): Split {
  const share = Math.round(fraction * 100) / 100;
  const squeezed: Pane | null = share < MIN_SHARE ? 'start' : share > MAX_SHARE ? 'end' : null;
  if (squeezed === null) return { ratio: share, collapsed: null };
  if (rules.collapsible.includes(squeezed)) return { ratio: split.ratio, collapsed: squeezed };
  return { ratio: squeezed === 'start' ? MIN_SHARE : MAX_SHARE, collapsed: null };
}

/**
 * The split after a key on the splitter, or `undefined` for a key it leaves to the page (the WAI-ARIA window splitter):
 * the arrows along its axis move it by 5 %, Home and End move it to the start and the end edge, and Enter collapses its
 * first collapsible pane, or restores the collapsed one. An arrow away from a collapsed pane opens it at the smallest
 * share.
 */
export function keyed(split: Split, key: string, rules: SplitRules, orientation: 'horizontal' | 'vertical'): Split | undefined {
  if (key === 'Enter') return { ratio: split.ratio, collapsed: split.collapsed === null ? rules.collapsible[0] : null };
  if (key === 'Home') return dragged(split, 0, rules);
  if (key === 'End') return dragged(split, 1, rules);
  const [back, forth] = orientation === 'horizontal' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  const step = key === forth ? STEP : key === back ? -STEP : 0;
  if (step === 0) return undefined;
  if (split.collapsed === 'start' && step > 0) return { ratio: MIN_SHARE, collapsed: null };
  if (split.collapsed === 'end' && step < 0) return { ratio: MAX_SHARE, collapsed: null };
  return dragged(split, shown(split) + step, rules);
}

/** A split kept in the browser, or the initial one when it is missing, malformed or out of range (ADR-0013). */
export function readSplit(kept: unknown, rules: SplitRules): Split {
  if (typeof kept === 'object' && kept !== null && 'ratio' in kept && 'collapsed' in kept) {
    const { ratio, collapsed } = kept;
    const inRange = typeof ratio === 'number' && ratio >= MIN_SHARE && ratio <= MAX_SHARE;
    const known = collapsed === null || rules.collapsible.some((pane) => pane === collapsed);
    if (inRange && known) return { ratio, collapsed: collapsed as Pane | null };
  }
  return { ratio: rules.initial, collapsed: null };
}
