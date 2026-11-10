import { AngleRightIcon, CogIcon, SearchIcon } from '@patternfly/react-icons';
import { useMemo, useState } from 'react';
import type { FunctionCatalogue as Catalogue } from '../../../api/client';
import { drilldown, type DrilldownFunction } from './function-groups';

/** The drag type of a function dragged from the drilldown onto the canvas; its data is the catalogue name. */
export const functionDragType = 'application/x-mapping-function';

/** What a function the catalogue lacks says, and the follow-up issue that adds it. */
const unavailable = (fn: DrilldownFunction) => `Not available yet (#${fn.issue})`;

/**
 * The functions drilldown (the prototype's FunctionCatalogue) over the catalogue (spec #152): its groups open one by one,
 * or all that match while a search is typed; a function is added by a click or dragged onto the canvas. A function the
 * catalogue lacks is shown disabled with "Not available yet" and its follow-up issue.
 */
export function FunctionCatalogue({ catalogue, add, disabled = false }: { catalogue: Catalogue; add: (fn: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsedResults, setCollapsedResults] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => drilldown(catalogue), [catalogue]);
  const filter = query.trim().toLowerCase();
  let matches = 0;
  return (
    <div className="function-catalogue" aria-label="Function catalogue" role="region">
      <label className="catalogue-search">
        <SearchIcon />
        <input
          type="search"
          aria-label="Search functions"
          placeholder="Search functions"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCollapsedResults({});
          }}
        />
      </label>
      <div className="catalogue-groups">
        {groups.map(({ group, functions }) => {
          const entries = functions.filter((fn) => [group, fn.name].some((value) => value.toLowerCase().includes(filter)));
          if (entries.length === 0) return null;
          matches += entries.length;
          const open = filter ? !collapsedResults[group] : Boolean(expanded[group]);
          return (
            <div key={group} className="catalogue-group">
              <button
                type="button"
                className="catalogue-group-toggle"
                aria-expanded={open}
                onClick={() => {
                  if (filter) setCollapsedResults((old) => ({ ...old, [group]: open }));
                  else setExpanded((old) => ({ ...old, [group]: !open }));
                }}
              >
                <AngleRightIcon />
                <span>{group}</span>
                <small>{entries.length}</small>
              </button>
              {open && (
                <ul>
                  {entries.map((fn) => {
                    const off = disabled || fn.fn === undefined;
                    return (
                      <li key={fn.key}>
                        <button
                          type="button"
                          className="catalogue-function"
                          aria-disabled={fn.fn === undefined || undefined}
                          disabled={disabled && fn.fn !== undefined}
                          title={fn.fn === undefined ? unavailable(fn) : undefined}
                          aria-description={fn.fn === undefined ? unavailable(fn) : undefined}
                          draggable={!off}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(functionDragType, fn.fn!);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => {
                            if (!off) add(fn.fn!);
                          }}
                        >
                          <i aria-hidden="true">ƒ</i>
                          <span>{fn.name}</span>
                          {fn.overload !== undefined && <small>{fn.overload} inputs</small>}
                          {fn.configurable && <CogIcon aria-label="Configurable" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
        {matches === 0 && <p>No matching functions.</p>}
      </div>
    </div>
  );
}
