import { useId, useState, type KeyboardEvent } from 'react';
import type { FunctionCatalogue } from '../../api/client';
import { paletteGroups } from './palette';

export interface QuickInsertProps {
  catalogue: FunctionCatalogue;
  /** What was typed on the canvas to open it: the search it starts with. */
  initial: string;
  onInsert: (fn: string) => void;
  /** Escape. */
  onCancel: () => void;
  /** The focus left the search field for another element. */
  onLeave: () => void;
}

/**
 * Quick insert (GLOSSARY): a search field over the function catalogue, by name and by function family as the palette
 * searches, with the matches grouped by family. The arrow keys move the active match, Enter or a click inserts it,
 * Escape cancels.
 */
export function QuickInsert({ catalogue, initial, onInsert, onCancel, onLeave }: QuickInsertProps) {
  const id = useId();
  const [search, setSearch] = useState(initial);
  const [active, setActive] = useState(0);
  const groups = paletteGroups(catalogue, search);
  const matches = groups.flatMap((group) => group.entries.map((entry) => entry.fn));
  const optionId = (fn: string) => `${id}-${fn}`;

  const onKeyDown = (event: KeyboardEvent) => {
    // a new search starts at the first match
    if (event.key === 'ArrowDown') setActive(Math.min(active + 1, matches.length - 1));
    else if (event.key === 'ArrowUp') setActive(Math.max(active - 1, 0));
    else if (event.key === 'Enter' && matches.length > 0) onInsert(matches[active]!);
    else if (event.key === 'Escape') onCancel();
    else return;
    event.preventDefault();
  };

  return (
    <div className="fm-quick-insert">
      <input
        role="combobox"
        aria-label="Quick insert"
        aria-expanded
        aria-controls={`${id}-list`}
        aria-activedescendant={matches.length > 0 ? optionId(matches[active]!) : undefined}
        autoFocus
        value={search}
        placeholder="Function or family"
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        onBlur={onLeave}
        className="fm-quick-insert__input"
      />
      <div id={`${id}-list`} role="listbox" aria-label="Functions" className="fm-quick-insert__list">
        {groups.map(({ family, entries }) => (
          <ul key={family} role="group" aria-label={family} className="fm-quick-insert__family">
            <li role="presentation" aria-hidden className="fm-quick-insert__family-name">
              {family}
            </li>
            {entries.map(({ fn }) => (
              <li
                key={fn}
                id={optionId(fn)}
                role="option"
                aria-selected={fn === matches[active]}
                // keeps the focus in the search field, which would close quick insert on leaving it
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsert(fn)}
                className={fn === matches[active] ? 'fm-quick-insert__option fm-quick-insert__option--active' : 'fm-quick-insert__option'}
              >
                {fn}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
