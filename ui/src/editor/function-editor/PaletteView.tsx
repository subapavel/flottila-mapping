import { Label, SearchInput } from '@patternfly/react-core';
import { useState } from 'react';
import type { FunctionCatalogue } from '../../api/client';
import { FUNCTION_DRAG, paletteGroups, type Badge } from './palette';

/**
 * The palette (ADR-0012, GLOSSARY): the narrow list of the function catalogue by function family, with a search
 * field and the fidelity and portability badges. Dragging an entry onto the canvas inserts a function box.
 */
export function PaletteView({ catalogue }: { catalogue: FunctionCatalogue }) {
  const [search, setSearch] = useState('');
  return (
    <nav aria-label="Palette" style={{ width: '10rem', flex: 'none', maxHeight: '16rem', overflowY: 'auto' }}>
      <SearchInput aria-label="Search functions" placeholder="Search" value={search} onChange={(_event, value) => setSearch(value)} onClear={() => setSearch('')} />
      {paletteGroups(catalogue, search).map(({ family, entries }) => (
        <ul key={family} aria-label={family} style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0 }}>
          <li aria-hidden style={{ fontWeight: 'bold' }}>
            {family}
          </li>
          {entries.map(({ fn, badges }) => (
            <li
              key={fn}
              data-testid={`palette:${fn}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(FUNCTION_DRAG, fn);
                event.dataTransfer.effectAllowed = 'copy';
              }}
              style={{ cursor: 'grab' }}
            >
              {fn} {badges.map((badge) => <BadgeView key={badge.kind} badge={badge} />)}
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}

/** A deviation badge carries its text as the hover title. */
function BadgeView({ badge }: { badge: Badge }) {
  switch (badge.kind) {
    case 'assumed':
      return (
        <Label isCompact color="blue">
          assumed
        </Label>
      );
    case 'deviation':
      return (
        <span title={badge.text}>
          <Label isCompact color="orange">
            deviation
          </Label>
        </span>
      );
    case 'not-portable':
      return (
        <Label isCompact color="grey">
          not portable
        </Label>
      );
  }
}
