// PROTOTYPE (#10, throwaway): virtualised structure tree (flat visible-row list + TanStack Virtual,
// the Kaoto pattern from the research). PatternFly TreeView is not virtualised, so it is not used.
import { Button, SearchInput } from '@patternfly/react-core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { occurrenceText, type Structure } from '../model/structures';
import type { FieldPath } from '../model/types';

const ROW_H = 26;

export function FieldTree({ structure, marker, selected, onSelect, draggable, testId, initialDepth = 2, dense }: {
  structure: Structure;
  marker?: (p: FieldPath) => ReactNode;
  selected?: FieldPath | null;
  onSelect?: (p: FieldPath) => void;
  draggable?: boolean;
  testId: string;
  initialDepth?: number;
  dense?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<FieldPath>>(() => {
    const s = new Set<FieldPath>();
    for (const p of structure.order) if (structure.fields.get(p)!.depth < initialDepth) s.add(p);
    return s;
  });
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const out: FieldPath[] = [];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const keep = new Set<FieldPath>();
      for (const p of structure.order) {
        const f = structure.fields.get(p)!;
        if (f.name.toLowerCase().includes(q)) {
          let cur: FieldPath | null = p;
          while (cur && !keep.has(cur)) { keep.add(cur); cur = structure.fields.get(cur)!.parent; }
        }
      }
      for (const p of structure.order) if (keep.has(p)) out.push(p);
      return out;
    }
    const walk = (p: FieldPath) => {
      out.push(p);
      if (expanded.has(p)) for (const c of structure.fields.get(p)!.children) walk(c);
    };
    walk(structure.root);
    return out;
  }, [structure, expanded, query]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  const toggle = (p: FieldPath) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const expandAll = () => setExpanded(new Set(structure.order.filter((p) => structure.fields.get(p)!.children.length)));

  return (
    <div className={`ftree ${dense ? 'ftree--dense' : ''}`} data-testid={testId}>
      <div className="ftree__tools">
        <SearchInput aria-label={`search ${structure.label}`} placeholder="Search fields" value={query} onChange={(_e, v) => setQuery(v)} onClear={() => setQuery('')} />
        <Button variant="link" size="sm" onClick={expandAll} data-testid={`${testId}-expand-all`}>Expand all</Button>
        <Button variant="link" size="sm" onClick={() => setExpanded(new Set([structure.root]))}>Collapse</Button>
      </div>
      <div className="ftree__count">{structure.label}: {structure.fields.size.toLocaleString()} fields, {rows.length.toLocaleString()} visible rows</div>
      <div ref={scrollRef} className="ftree__scroll" data-testid={`${testId}-scroll`}>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map((vi) => {
            const p = rows[vi.index];
            const f = structure.fields.get(p)!;
            const hasKids = f.children.length > 0;
            return (
              <div
                key={p}
                data-tree-row
                className={`ftree__row ${selected === p ? 'is-selected' : ''}`}
                style={{ transform: `translateY(${vi.start}px)`, height: ROW_H, paddingLeft: 4 + f.depth * 14 }}
                onClick={() => onSelect?.(p)}
                draggable={draggable}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-field-path', p); e.dataTransfer.effectAllowed = 'copy'; }}
                title={p}
              >
                <span className="ftree__twisty" onClick={(e) => { e.stopPropagation(); if (hasKids) toggle(p); }}>
                  {hasKids ? (expanded.has(p) || query ? '▾' : '▸') : ''}
                </span>
                <span className={`ftree__name ${f.kind === 'attribute' ? 'is-attr' : ''} ${hasKids ? 'is-struct' : ''}`}>{f.name}</span>
                <span className="ftree__occ">{occurrenceText(f)}</span>
                {f.type && <span className="ftree__type">{f.type}</span>}
                <span className="ftree__marker">{marker?.(p)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
