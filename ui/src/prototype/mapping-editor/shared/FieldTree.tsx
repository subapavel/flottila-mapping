// PROTOTYPE (#10, throwaway): virtualised structure tree (flat visible-row list + TanStack Virtual,
// the Kaoto pattern from the research). PatternFly TreeView is not virtualised, so it is not used.
// Round 2: reports its visible rows and scroll position (onView) so a link gutter can draw lines,
// accepts drops on rows, a row filter, and extra columns.
import { Button, SearchInput } from '@patternfly/react-core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { occurrenceText, type Structure } from '../model/structures';
import type { FieldPath } from '../model/types';

export const ROW_H = 26;

/** What a link gutter needs to know about a tree: which rows are visible and where. */
export type TreeView = {
  index: Map<FieldPath, number>; // visible row index of each shown path
  scrollTop: number;
  height: number; // viewport height of the scroll area
  top: number; // client y of the scroll area's top edge
};

export function FieldTree({ structure, marker, selected, onSelect, draggable, testId, initialDepth = 2, dense,
  onView, onRowDrop, filter, renderExtra, header, toolsExtra, className }: {
  structure: Structure;
  marker?: (p: FieldPath) => ReactNode;
  selected?: FieldPath | null;
  onSelect?: (p: FieldPath) => void;
  draggable?: boolean;
  testId: string;
  initialDepth?: number;
  dense?: boolean;
  onView?: (v: TreeView) => void;
  onRowDrop?: (target: FieldPath, sourcePath: FieldPath) => void;
  filter?: ((p: FieldPath) => boolean) | null;
  renderExtra?: (p: FieldPath) => ReactNode;
  header?: ReactNode;
  toolsExtra?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState<Set<FieldPath>>(() => {
    const s = new Set<FieldPath>();
    for (const p of structure.order) if (structure.fields.get(p)!.depth < initialDepth) s.add(p);
    return s;
  });
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const out: FieldPath[] = [];
    const q = query.trim().toLowerCase();
    if (q || filter) {
      // search / filter: matches plus their ancestors, shown expanded
      const keep = new Set<FieldPath>();
      for (const p of structure.order) {
        const f = structure.fields.get(p)!;
        if ((!q || f.name.toLowerCase().includes(q)) && (!filter || filter(p))) {
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
  }, [structure, expanded, query, filter]);
  const index = useMemo(() => new Map(rows.map((p, i) => [p, i])), [rows]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  const report = () => {
    const el = scrollRef.current;
    if (!el || !onView) return;
    onView({ index, scrollTop: el.scrollTop, height: el.clientHeight, top: el.getBoundingClientRect().top });
  };
  useLayoutEffect(report, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onView) return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }); // re-subscribe each render so `report` sees the current index

  const toggle = (p: FieldPath) => setExpanded((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const expandAll = () => setExpanded(new Set(structure.order.filter((p) => structure.fields.get(p)!.children.length)));

  return (
    <div className={`ftree ${dense ? 'ftree--dense' : ''} ${className ?? ''}`} data-testid={testId}>
      <div className="ftree__tools">
        <SearchInput aria-label={`search ${structure.label}`} placeholder="Search fields" value={query} onChange={(_e, x) => setQuery(x)} onClear={() => setQuery('')} />
        <Button variant="link" size="sm" onClick={expandAll} data-testid={`${testId}-expand-all`}>Expand all</Button>
        <Button variant="link" size="sm" onClick={() => setExpanded(new Set([structure.root]))} data-testid={`${testId}-collapse`}>Collapse</Button>
        {toolsExtra}
      </div>
      <div className="ftree__count">{structure.label}: {structure.fields.size.toLocaleString()} fields, {rows.length.toLocaleString()} visible rows</div>
      {header}
      <div ref={scrollRef} className="ftree__scroll" data-testid={`${testId}-scroll`} onScroll={report}>
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
                style={{ transform: `translateY(${vi.start}px)`, height: ROW_H }}
                onClick={() => onSelect?.(p)}
                draggable={draggable}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-field-path', p); e.dataTransfer.effectAllowed = 'copy'; }}
                onDragOver={onRowDrop ? (e) => { e.preventDefault(); e.currentTarget.classList.add('is-droptarget'); } : undefined}
                onDragLeave={onRowDrop ? (e) => e.currentTarget.classList.remove('is-droptarget') : undefined}
                onDrop={onRowDrop ? (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('is-droptarget');
                  const sp = e.dataTransfer.getData('application/x-field-path');
                  if (sp) onRowDrop(p, sp);
                } : undefined}
                title={p}
              >
                <span className="ftree__namecell" style={{ paddingLeft: 4 + f.depth * 14 }}>
                  <span className="ftree__twisty" onClick={(e) => { e.stopPropagation(); if (hasKids) toggle(p); }}>
                    {hasKids ? (expanded.has(p) || query || filter ? '▾' : '▸') : ''}
                  </span>
                  <span className={`ftree__name ${f.kind === 'attribute' ? 'is-attr' : ''} ${hasKids ? 'is-struct' : ''}`}>{f.name}</span>
                  {!renderExtra && <span className="ftree__occ">{occurrenceText(f)}</span>}
                  {!renderExtra && f.type && <span className="ftree__type">{f.type}</span>}
                </span>
                {renderExtra?.(p)}
                <span className="ftree__marker">{marker?.(p)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
