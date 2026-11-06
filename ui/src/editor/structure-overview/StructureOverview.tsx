import { Button, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ApiClient } from '../../api/client';
import type { FieldPath, StructureRef } from '../../generated/mapping-model';
import type { WorkingCopyStore } from '../store/working-copy';
import {
  STATUS_FILTERS,
  fieldStatuses,
  filteredLinks,
  filteredRows,
  orphanedMappings,
  type FieldStatus,
  type StatusFilter,
} from './field-status';
import { anchorLinks, fieldLinks, linkGutter, rowAnchors, type Gutter } from './links';
import { occurrenceText, reachedSourceFields, stepName, treeRows } from './rows';

type Side = 'source' | 'target';

/** The expanded branches of both trees, by field path; a side without an entry has only its root expanded. */
export type Expanded = Partial<Record<Side, string[]>>;

/** The drag data of a source row: its field path. */
const SOURCE_FIELD = 'application/x-flottila-source-field';

/** Every row has this height, so the virtualiser and the link gutter place rows by index alone. */
const ROW_HEIGHT = 28;
const TREE_HEIGHT = 420;
const GUTTER_WIDTH = 120;

export interface StructureOverviewProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
  expanded: Expanded;
  onExpandedChange: (expanded: Expanded) => void;
  /** The selected target field: its links are highlighted and the others dimmed. */
  selectedField?: FieldPath | null;
  /** Asks the host to select a target field: a click on its row, or Enter or Space on it. */
  onSelectField?: (field: FieldPath) => void;
  /** The target rows shown: all, or those of one field status. */
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
}

/** The text of each status filter value, and of each field status mark. */
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  mapped: 'Mapped',
  'unmapped-mandatory': 'Unmapped mandatory',
  orphaned: 'Orphaned',
  error: 'Error',
};

const STATUS_COLOURS: Record<FieldStatus, string> = {
  mapped: 'var(--pf-t--global--color--status--success--default, #3d7317)',
  'unmapped-mandatory': 'var(--pf-t--global--color--status--warning--default, #dca614)',
  orphaned: 'var(--pf-t--global--color--nonstatus--purple--default, #5e40be)',
  error: 'var(--pf-t--global--color--status--danger--default, #b1380b)',
};

/**
 * The top half of the editor (ADR-0012): the source tree and the target tree side by side, virtualised, with the
 * field links drawn in the link gutter between them. Dropping a source row on a target row links the two fields; so
 * does Enter on a source row, then Enter on a target row. Clicking a target row, or Enter on it, selects that target
 * field; a source row never selects. Each target row carries its field status; the status filter shows the rows of
 * one status, and only the links to them. The orphaned target field mappings are listed below the trees under the
 * filters all and orphaned, and selecting one selects its target field.
 */
export function StructureOverview({
  mappingId,
  api,
  store,
  expanded,
  onExpandedChange,
  selectedField = null,
  onSelectField,
  statusFilter,
  onStatusFilterChange,
}: StructureOverviewProps) {
  const model = useStore(store, (s) => s.workingCopy);
  const diagnostics = useStore(store, (s) => s.diagnostics);
  const source = useTree(mappingId, api, model.source, expanded.source);
  const statuses = useMemo(() => fieldStatuses(model, diagnostics, source.structure), [model, diagnostics, source.structure]);
  const target = useTree(mappingId, api, model.target, expanded.target, statuses, statusFilter);
  const orphaned = useMemo(() => (target.structure ? orphanedMappings(model, target.structure) : []), [model, target.structure]);
  const [picked, setPicked] = useState<string | null>(null);

  const links = useMemo(() => filteredLinks(fieldLinks(model), statuses, statusFilter), [model, statuses, statusFilter]);
  const anchored = useMemo(
    () => (source.anchors && target.anchors ? anchorLinks(links, source.anchors, target.anchors) : []),
    [links, source.anchors, target.anchors],
  );
  const gutter = linkGutter(anchored, source.viewport, target.viewport, ROW_HEIGHT, selectedField);

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
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleGroup isCompact aria-label="Status filter">
          {STATUS_FILTERS.map((value) => (
            <ToggleGroupItem
              key={value}
              text={STATUS_LABELS[value]}
              isSelected={statusFilter === value}
              onChange={() => onStatusFilterChange(value)}
            />
          ))}
        </ToggleGroup>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <TreePane
          side="source"
          tree={source}
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
        <LinkGutter gutter={gutter} />
        <TreePane
          side="target"
          tree={target}
          // under a filter, the rows of that status and their ancestors are shown whatever is expanded
          onToggle={statusFilter === 'all' ? toggle : undefined}
          row={(path) => ({
            onDragOver: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            },
            onDrop: (e) => {
              e.preventDefault();
              linkTo(path, e.dataTransfer.getData(SOURCE_FIELD));
            },
            onClick: () => onSelectField?.(path),
            onKeyDown: (e) => {
              if (!activated(e)) return;
              linkTo(path, picked);
              onSelectField?.(path);
            },
          })}
          mark={(path) => (
            <>
              <StatusMark status={statuses.get(path)} />
              <TargetLinks store={store} path={path} />
            </>
          )}
        />
      </div>
      {(statusFilter === 'all' || statusFilter === 'orphaned') && orphaned.length > 0 && (
        <section style={{ marginLeft: 'auto', width: '50%' }}>
          <h3>Orphaned target field mappings</h3>
          <ul aria-label="Orphaned target field mappings">
            {orphaned.map((path) => (
              <li key={path}>
                <Button variant="link" isInline onClick={() => onSelectField?.(path)}>
                  {path}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A target row's field status mark: a coloured dot named by its status; nothing for a row without a status. */
function StatusMark({ status }: { status: FieldStatus | undefined }) {
  if (status === undefined) return null;
  const label = STATUS_LABELS[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-status={status}
      style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOURS[status] }}
    />
  );
}

/** Enter or Space on a row, which then handles the key. */
function activated(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  return true;
}

/** The source tree's statuses: none, and the same map on every render so that its rows stay memoised. */
const NO_STATUSES: ReadonlyMap<FieldPath, FieldStatus> = new Map();

/**
 * One tree: its structure, its visible rows, where links end among them, and its virtualiser. The visible rows are
 * the expanded ones under the filter `all`, else the rows of the filter's status in `statuses` and their ancestors.
 */
function useTree(
  mappingId: string,
  api: ApiClient,
  ref: StructureRef,
  expanded: string[] | undefined,
  statuses: ReadonlyMap<FieldPath, FieldStatus> = NO_STATUSES,
  filter: StatusFilter = 'all',
) {
  const request = { base: mappingId.split('/').slice(0, -1).join('/'), bundle: ref.bundle, root: ref.root };
  const query = useQuery({ queryKey: ['structure', request], queryFn: () => api.loadStructure(request) });
  const structure = query.data?.kind === 'loaded' ? query.data : undefined;
  const rootPath = structure ? `/${structure.root.step}` : '';
  // under the filter `all` a new status map must not walk the tree again
  const shown = filter === 'all' ? NO_STATUSES : statuses;
  const rows = useMemo(() => {
    if (!structure) return [];
    return filter === 'all' ? treeRows(structure, new Set(expanded ?? [rootPath])) : filteredRows(structure, shown, filter);
  }, [structure, expanded, rootPath, shown, filter]);
  const anchors = useMemo(() => (structure ? rowAnchors(structure, rows) : undefined), [structure, rows]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]!.path,
    overscan: 8,
  });
  const viewport = { scrollTop: virtualizer.scrollOffset ?? 0, height: virtualizer.scrollRect?.height ?? 0 };
  return { query, structure, rootPath, rows, anchors, scrollRef, virtualizer, viewport };
}

type Tree = ReturnType<typeof useTree>;

interface TreePaneProps {
  side: Side;
  tree: Tree;
  /** Expands or collapses a row; without it the rows offer no toggle. */
  onToggle?: (side: Side, rootPath: string, path: string) => void;
  row: (path: string) => HTMLAttributes<HTMLDivElement>;
  mark?: (path: string) => ReactNode;
}

function TreePane({ side, tree, onToggle, row, mark }: TreePaneProps) {
  const { query, rootPath, rows, scrollRef, virtualizer } = tree;
  const label = side === 'source' ? 'Source structure' : 'Target structure';
  const pane = { flex: 1, minWidth: 0, height: TREE_HEIGHT };

  if (query.isPending) return <p style={pane}>Loading the {side} structure…</p>;
  if (query.isError) {
    return (
      <p role="alert" style={pane}>
        {query.error.message}
      </p>
    );
  }
  if (query.data.kind === 'refused') {
    return (
      <ul aria-label={`${label} diagnostics`} style={pane}>
        {query.data.diagnostics.map((d, i) => (
          <li key={i}>
            {d.severity} <code>{d.code}</code>: {d.message}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div ref={scrollRef} role="tree" aria-label={label} style={{ ...pane, overflowY: 'auto', overflowX: 'hidden' }}>
      <div role="presentation" style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const r = rows[item.index]!;
          return (
            <div
              key={item.key}
              role="treeitem"
              aria-level={r.depth + 1}
              aria-expanded={r.expandable ? r.expanded : undefined}
              aria-label={stepName(r.path)}
              title={r.path}
              data-testid={`${side}-field:${r.path}`}
              tabIndex={0}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                transform: `translateY(${item.start}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap',
                paddingLeft: `${r.depth * 1.25}rem`,
              }}
              {...row(r.path)}
            >
              {r.expandable && onToggle && (
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The link gutter (ADR-0012): a line per field link, dashed when it ends at a collapsed row's ancestor, with the fx
 * count when several source-field boxes stand behind it, a ctx mark at its source end when one of them has a context
 * that is not the parent, and per side the ↑n and ↓n of the ends scrolled away.
 */
function LinkGutter({ gutter }: { gutter: Gutter }) {
  const mid = GUTTER_WIDTH / 2;
  const count = (side: Side, edge: 'above' | 'below') => {
    const n = gutter.counts[side][edge];
    if (n === 0) return null;
    return (
      <text
        data-testid={`link-count:${side}:${edge}`}
        x={side === 'source' ? 2 : GUTTER_WIDTH - 2}
        y={edge === 'above' ? 10 : TREE_HEIGHT - 2}
        textAnchor={side === 'source' ? 'start' : 'end'}
        fontSize={10}
      >
        {edge === 'above' ? '↑' : '↓'}
        {n}
      </text>
    );
  };
  return (
    <svg aria-label="Field links" width={GUTTER_WIDTH} height={TREE_HEIGHT} style={{ flex: 'none' }}>
      {gutter.lines.map((l) => {
        const key = `${l.source}->${l.target}`;
        return (
          <g key={key}>
            <path
              data-testid={`field-link:${key}`}
              data-emphasis={l.emphasis}
              d={`M0 ${l.y1} C${mid} ${l.y1} ${mid} ${l.y2} ${GUTTER_WIDTH} ${l.y2}`}
              fill="none"
              stroke={l.emphasis === 'highlighted' ? 'var(--pf-t--global--border--color--clicked, #0066cc)' : 'currentColor'}
              strokeWidth={l.emphasis === 'highlighted' ? 2 : 1}
              strokeOpacity={l.emphasis === 'dimmed' ? 0.25 : 0.8}
              strokeDasharray={l.dashed ? '4 3' : undefined}
            />
            {l.boxes > 1 && (
              <text data-testid={`link-fx:${key}`} x={mid} y={(l.y1 + l.y2) / 2 - 2} textAnchor="middle" fontSize={10}>
                fx {l.boxes}
              </text>
            )}
            {l.contextChanged && (
              <text data-testid={`link-context:${key}`} x={2} y={l.y1 - 3} fontSize={10}>
                <title>Read in a context other than its parent</title>
                ctx
              </text>
            )}
          </g>
        );
      })}
      {count('source', 'above')}
      {count('source', 'below')}
      {count('target', 'above')}
      {count('target', 'below')}
    </svg>
  );
}

/** The field links that end at a target field: one mark per source field that its `result` reaches (ADR-0013). */
function TargetLinks({ store, path }: { store: WorkingCopyStore; path: string }) {
  const mapping = useStore(store, (s) => s.workingCopy.targetFieldMappings?.[path]);
  return reachedSourceFields(mapping).map((field) => <span key={field}>← {stepName(field)}</span>);
}
