import { SearchInput } from '@patternfly/react-core';
import { useId, useState, type KeyboardEvent } from 'react';
import type { FunctionCatalogue } from '../../api/client';
import { FUNCTION_DRAG, paletteGroups, type Badge } from './palette';

export interface PaletteViewProps {
  catalogue: FunctionCatalogue;
  /** Enter on an entry: inserts a box of its function, as quick insert does. */
  onInsert: (fn: string) => void;
}

/**
 * The palette (ADR-0012, GLOSSARY): the narrow list of the function catalogue by function family, with a search
 * field and the fidelity and portability badges. Dragging an entry onto the canvas inserts a function box.
 *
 * By keyboard the entries are one tab stop (a roving tabindex): Tab reaches the entry last moved to, or the first entry
 * when the search has left that one out; the arrow keys move along the entries across families and stop at either
 * end; Enter inserts the focused entry's function. An entry is named by its function and described by its badges, a
 * deviation with its text.
 */
export function PaletteView({ catalogue, onInsert }: PaletteViewProps) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const groups = paletteGroups(catalogue, search);
  const entries = groups.flatMap((group) => group.entries.map((entry) => entry.fn));
  const tabStop = current !== null && entries.includes(current) ? current : entries[0];
  const entryId = (fn: string) => `${id}-${fn}`;
  const badgeId = (fn: string, badge: Badge) => `${entryId(fn)}-${badge.kind}`;

  const onKeyDown = (event: KeyboardEvent, fn: string) => {
    if (event.key === 'Enter') onInsert(fn);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const at = entries.indexOf(fn);
      const next = entries[event.key === 'ArrowDown' ? Math.min(at + 1, entries.length - 1) : Math.max(at - 1, 0)]!;
      setCurrent(next);
      document.getElementById(entryId(next))!.focus();
    } else return;
    event.preventDefault();
  };

  return (
    <nav aria-label="Palette" className="fm-palette">
      <SearchInput aria-label="Search functions" placeholder="Search" value={search} onChange={(_event, value) => setSearch(value)} onClear={() => setSearch('')} />
      {groups.map(({ family, entries: listed }) => (
        <ul key={family} aria-label={family} className="fm-palette__family">
          <li aria-hidden className="fm-palette__family-name">
            {family}
          </li>
          {listed.map(({ fn, badges }) => (
            <li
              key={fn}
              id={entryId(fn)}
              data-testid={`palette:${fn}`}
              tabIndex={fn === tabStop ? 0 : -1}
              aria-label={fn}
              aria-describedby={badges.map((badge) => badgeId(fn, badge)).join(' ')}
              onKeyDown={(event) => onKeyDown(event, fn)}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(FUNCTION_DRAG, fn);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              className="fm-palette__entry"
            >
              {fn}{' '}
              {/* the badges and the execution kind at the entry's right, as in the prototype's .gc__pitem */}
              <span className="fm-palette__marks">
                {badges.map((badge) => (
                  <BadgeView key={badge.kind} id={badgeId(fn, badge)} badge={badge} />
                ))}
                {catalogue[fn]!.executionKind !== 'single' && <span className="fm-palette__kind">{catalogue[fn]!.executionKind}</span>}
              </span>
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}

/**
 * A badge as one glyph square, after the prototype's .gc__pitem .fid: `?` for an assumed reading, `≠` for a deviation;
 * the prototype has no not-portable badge, so it gets `⊘`. Its words, a deviation's with its text, are its hover title
 * and its name, under `id` for the entry's description.
 */
function BadgeView({ id, badge }: { id: string; badge: Badge }) {
  const words = badge.kind === 'deviation' ? `deviation: ${badge.text}` : BADGE_WORDS[badge.kind];
  return (
    <span id={id} role="img" aria-label={words} title={words} className={`fm-fid fm-fid--${badge.kind}`}>
      {GLYPH[badge.kind]}
    </span>
  );
}

const BADGE_WORDS = { assumed: 'assumed', 'not-portable': 'not portable' } as const;
const GLYPH = { assumed: '?', deviation: '≠', 'not-portable': '⊘' } as const;
