import { useQuery } from '@tanstack/react-query';
import { useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, StructureLoaded } from '../../api/client';
import type { StructureRef } from '../../generated/mapping-model';
import type { WorkingCopyStore } from '../store/working-copy';
import { occurrenceText, reachedSourceFields, stepName, treeRows } from './rows';

type Side = 'source' | 'target';

/** The expanded branches of both trees, by field path; a side without an entry has only its root expanded. */
export type Expanded = Partial<Record<Side, string[]>>;

/** The drag data of a source row: its field path. */
const SOURCE_FIELD = 'application/x-flottila-source-field';

export interface StructureOverviewProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
  expanded: Expanded;
  onExpandedChange: (expanded: Expanded) => void;
}

/**
 * The top half of the editor (ADR-0012): the source tree and the target tree side by side. Dropping a source row on
 * a target row links the two fields; so does Enter on a source row, then Enter on a target row.
 */
export function StructureOverview({ mappingId, api, store, expanded, onExpandedChange }: StructureOverviewProps) {
  const source = useStore(store, (s) => s.workingCopy.source);
  const target = useStore(store, (s) => s.workingCopy.target);
  const [picked, setPicked] = useState<string | null>(null);

  const toggle = (side: Side, rootPath: string, path: string) => {
    const open = new Set(expanded[side] ?? [rootPath]);
    if (open.has(path)) open.delete(path);
    else open.add(path);
    onExpandedChange({ ...expanded, [side]: [...open] });
  };

  const linkTo = (targetField: string, sourceField: string | null) => {
    if (sourceField) store.getState().link(sourceField, targetField);
    setPicked(null);
  };

  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      <StructureTree
        side="source"
        mappingId={mappingId}
        api={api}
        structureRef={source}
        expanded={expanded.source}
        onToggle={toggle}
        row={(path) => ({
          draggable: true,
          'aria-selected': picked === path,
          onDragStart: (e) => {
            e.dataTransfer.setData(SOURCE_FIELD, path);
            e.dataTransfer.effectAllowed = 'link';
          },
          onKeyDown: (e) => activated(e) && setPicked(picked === path ? null : path),
        })}
      />
      <StructureTree
        side="target"
        mappingId={mappingId}
        api={api}
        structureRef={target}
        expanded={expanded.target}
        onToggle={toggle}
        row={(path) => ({
          onDragOver: (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link';
          },
          onDrop: (e) => {
            e.preventDefault();
            linkTo(path, e.dataTransfer.getData(SOURCE_FIELD));
          },
          onKeyDown: (e) => activated(e) && linkTo(path, picked),
        })}
        mark={(path) => <TargetLinks store={store} path={path} />}
      />
    </div>
  );
}

/** Enter or Space on a row, which then handles the key. */
function activated(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  return true;
}

interface StructureTreeProps {
  side: Side;
  mappingId: string;
  api: ApiClient;
  structureRef: StructureRef;
  expanded: string[] | undefined;
  onToggle: (side: Side, rootPath: string, path: string) => void;
  row: (path: string) => HTMLAttributes<HTMLLIElement>;
  mark?: (path: string) => ReactNode;
}

function StructureTree({ side, mappingId, api, structureRef, expanded, onToggle, row, mark }: StructureTreeProps) {
  const request = { base: mappingId.split('/').slice(0, -1).join('/'), bundle: structureRef.bundle, root: structureRef.root };
  const structure = useQuery({ queryKey: ['structure', request], queryFn: () => api.loadStructure(request) });
  const label = side === 'source' ? 'Source structure' : 'Target structure';

  if (structure.isPending) return <p>Loading the {side} structure…</p>;
  if (structure.isError) return <p role="alert">{structure.error.message}</p>;
  if (structure.data.kind === 'refused') {
    return (
      <ul aria-label={`${label} diagnostics`}>
        {structure.data.diagnostics.map((d, i) => (
          <li key={i}>
            {d.severity} <code>{d.code}</code>: {d.message}
          </li>
        ))}
      </ul>
    );
  }
  return <Tree side={side} label={label} structure={structure.data} expanded={expanded} onToggle={onToggle} row={row} mark={mark} />;
}

function Tree({
  side,
  label,
  structure,
  expanded,
  onToggle,
  row,
  mark,
}: Omit<StructureTreeProps, 'mappingId' | 'api' | 'structureRef'> & { label: string; structure: StructureLoaded }) {
  const rootPath = `/${structure.root.step}`;
  const rows = treeRows(structure, new Set(expanded ?? [rootPath]));
  return (
    <ul role="tree" aria-label={label} style={{ listStyle: 'none', padding: 0, flex: 1 }}>
      {rows.map((r) => (
        <li
          key={r.path}
          role="treeitem"
          aria-level={r.depth + 1}
          aria-expanded={r.expandable ? r.expanded : undefined}
          aria-label={stepName(r.path)}
          data-testid={`${side}-field:${r.path}`}
          tabIndex={0}
          style={{ display: 'flex', gap: '0.5rem', paddingLeft: `${r.depth * 1.25}rem` }}
          {...row(r.path)}
        >
          {r.expandable && (
            <button
              type="button"
              aria-label={`${r.expanded ? 'Collapse' : 'Expand'} ${side} ${stepName(r.path)}`}
              onClick={() => onToggle(side, rootPath, r.path)}
            >
              <span aria-hidden="true">{r.expanded ? '▾' : '▸'}</span>
            </button>
          )}
          <span>{stepName(r.path)}</span>
          <span>{r.field.valueType}</span>
          <span>{occurrenceText(r.field)}</span>
          {mark?.(r.path)}
        </li>
      ))}
    </ul>
  );
}

/** The field links that end at a target field: one mark per source field that its `result` reaches (ADR-0013). */
function TargetLinks({ store, path }: { store: WorkingCopyStore; path: string }) {
  const mapping = useStore(store, (s) => s.workingCopy.targetFieldMappings?.[path]);
  return reachedSourceFields(mapping).map((field) => <span key={field}>← {stepName(field)}</span>);
}
