import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ApiClient } from '../../api/client';
import type { FieldPath, StructureRef } from '../../generated/mapping-model';
import { describeFieldRefusal, type FieldRefusal } from '../../model/command';
import type { WorkingCopyStore } from '../store/working-copy';
import { anchorLinks, fieldLinks, linkGutter, rowAnchors, type Gutter } from './links';
import { occurrenceText, reachedSourceFields, refusalAt, stepName, treeRows } from './rows';

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
}

/**
 * The top half of the editor (ADR-0012): the source tree and the target tree side by side, virtualised, with the
 * field links drawn in the link gutter between them. Dropping a source row on a target row links the two fields; so
 * does Enter on a source row, then Enter on a target row. A refused field's row is marked, its reason and position on
 * hover, and a link from or to it is refused (ADR-0027). Clicking a target row, or Enter on it, selects that target
 * field; a source row never selects.
 */
export function StructureOverview({
  mappingId,
  api,
  store,
  expanded,
  onExpandedChange,
  selectedField = null,
  onSelectField,
}: StructureOverviewProps) {
  const model = useStore(store, (s) => s.workingCopy);
  const source = useTree(mappingId, api, model.source, expanded.source, 'source');
  const target = useTree(mappingId, api, model.target, expanded.target, 'target');
  const [picked, setPicked] = useState<string | null>(null);

  const links = useMemo(() => fieldLinks(model), [model]);
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
    // a row to link from or to exists only once its structure has loaded
    if (sourceField) {
      store.getState().link(sourceField, targetField, {
        source: refusalAt(source.structure!, sourceField, 'source'),
        target: refusalAt(target.structure!, targetField, 'target'),
      });
    }
    setPicked(null);
  };

  return (
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
          onClick: () => onSelectField?.(path),
          onKeyDown: (e) => {
            if (!activated(e)) return;
            linkTo(path, picked);
            onSelectField?.(path);
          },
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

/** One tree: its structure, its visible rows, where links end among them, and its virtualiser. */
function useTree(mappingId: string, api: ApiClient, ref: StructureRef, expanded: string[] | undefined, side: Side) {
  const request = { base: mappingId.split('/').slice(0, -1).join('/'), bundle: ref.bundle, root: ref.root };
  const query = useQuery({ queryKey: ['structure', request], queryFn: () => api.loadStructure(request) });
  const structure = query.data?.kind === 'loaded' ? query.data : undefined;
  const rootPath = structure ? `/${structure.root.step}` : '';
  const rows = useMemo(
    () => (structure ? treeRows(structure, new Set(expanded ?? [rootPath]), side) : []),
    [structure, expanded, rootPath, side],
  );
  // Same-step siblings share a field path (ADR-0008), so the second and later rows of a path get `#n`; an XML name
  // holds no `#`, and a JSON object has no two members of one name.
  const keys = useMemo(() => {
    const seen = new Map<string, number>();
    return rows.map(({ path }) => {
      const n = (seen.get(path) ?? 0) + 1;
      seen.set(path, n);
      return n === 1 ? path : `${path}#${n}`;
    });
  }, [rows]);
  const anchors = useMemo(() => (structure ? rowAnchors(structure, rows) : undefined), [structure, rows]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => keys[index]!,
    overscan: 8,
  });
  const viewport = { scrollTop: virtualizer.scrollOffset ?? 0, height: virtualizer.scrollRect?.height ?? 0 };
  return { query, structure, rootPath, rows, anchors, scrollRef, virtualizer, viewport };
}

type Tree = ReturnType<typeof useTree>;

interface TreePaneProps {
  side: Side;
  tree: Tree;
  onToggle: (side: Side, rootPath: string, path: string) => void;
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
              {r.refusal && <RefusedMark side={side} path={r.path} refusal={r.refusal} />}
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
 * count when several source-field boxes stand behind it, and per side the ↑n and ↓n of the ends scrolled away.
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

/** The mark of a refused field's row (ADR-0027): its reason and the declaration's file, line and column on hover. */
function RefusedMark({ side, path, refusal }: { side: Side; path: string; refusal: FieldRefusal }) {
  const text = `Refused: ${describeFieldRefusal(refusal)}`;
  return (
    <span data-testid={`refused:${side}:${path}`} role="img" aria-label={text} title={text}>
      ⊘
    </span>
  );
}

/** The field links that end at a target field: one mark per source field that its `result` reaches (ADR-0013). */
function TargetLinks({ store, path }: { store: WorkingCopyStore; path: string }) {
  const mapping = useStore(store, (s) => s.workingCopy.targetFieldMappings?.[path]);
  return reachedSourceFields(mapping).map((field) => <span key={field}>← {stepName(field)}</span>);
}
