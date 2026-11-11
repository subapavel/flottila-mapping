import { Label } from '@patternfly/react-core';
import type { AssumedFidelity, DeviationFidelity } from '../../../generated/function-catalogue';
import { fidelityWords } from './fidelity';

/** The glyph and the label colour of each fidelity with a mark: an assumed reading in plain grey, a deviation in orange. */
const MARKS = { assumed: { glyph: '?', color: 'grey' }, deviation: { glyph: '≠', color: 'orange' } } as const;

/**
 * The mark of a function whose fidelity is not exact (GLOSSARY: Fidelity): a compact label with one glyph, after the old
 * palette's badges; an exact function has none. With `named`, the mark is an image named by its words, which are also
 * its canvas hint; else it is hidden from assistive technology, and its host describes the function in the same words.
 */
export function FidelityMark({ fidelity, named = false }: { fidelity: AssumedFidelity | DeviationFidelity; named?: boolean }) {
  const { glyph, color } = MARKS[fidelity.level];
  const words = fidelityWords(fidelity);
  return (
    <span className="fidelity-mark" {...(named ? { role: 'img', 'aria-label': words, 'data-mapping-hint': words } : { 'aria-hidden': true })}>
      <Label isCompact color={color}>
        {glyph}
      </Label>
    </span>
  );
}
