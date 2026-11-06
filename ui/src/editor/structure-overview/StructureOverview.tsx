import { Button, SearchInput, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useId, useMemo, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ApiClient } from '../../api/client';
import type { FieldPath, StructureRef } from '../../generated/mapping-model';
import { describeFieldRefusal, type FieldRefusal } from '../../model/command';
import { stepName } from '../../model/field-path';
import { SOURCE_FIELD_DRAG } from '../store/drag';
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
import { expandAllPaths, fieldCount, occurrenceText, reachedSourceFields, refusalAt, searchRows, treeRows, type TreeRow } from './rows';
import './structure-overview.css';

type Side = 'source' | 'target';

/** The expanded branches of both trees, by field path; a side without an entry has only its root expanded. */
export type Expanded = Partial<Record<Side, string[]>>;

/** Every row has this height, so the virtualiser and the link gutter place rows by index alone. */
const ROW_HEIGHT = 28;
const GUTTER_WIDTH = 120;
/** The width of an fx mark at a link's target end. */
const FX_WIDTH = 17;

export interface StructureOverviewProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
  expanded: Expanded;
  onExpandedChange: (expanded: Expanded) => void;
  /** The selected target field: its row is selected, its links are highlighted and the others dimmed. */
  selectedField?: FieldPath | null;
  /** Asks the host to select a target field: a click on its row, or Enter or Space on it. */
  onSelectField?: (field: FieldPath) => void;
  /** The target rows shown: all, or those of one field status. */
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  /** How the two trees share the width; the host keeps it and draws `splitter` between them (ADR-0012). */
  sides: Sides;
  /** The splitter between the source tree and the link gutter. */
  splitter: ReactNode;
}

/** The trees' shares of the width (their flex grow), the side collapsed fully, if any, and the source tree's id. */
export interface Sides {
  source: number;
  target: number;
  collapsed: Side | null;
  sourceId: string;
}

/** The text of each status filter value, and of each field status mark. */
const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  mapped: 'Mapped',
  'unmapped-mandatory': 'Unmapped mandatory',
  orphaned: 'Orphaned',
  error: 'Error',
};

/** `n` and its noun, with the noun plural unless `n` is 1; thousands grouped as in `20,128`. */
const counted = (n: number, noun: string) => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The top half of the editor (ADR-0012): the source tree and the target tree side by side, virtualised, with the
 * field links drawn in the link gutter between them. Dropping a source row on a target row links the two fields; so
 * does Enter on a source row, then Enter on a target row. A refused field's row is marked, its reason and position on
 * hover, and a link from or to it is refused (ADR-0027). Clicking a target row, or Enter on it, selects that target
 * field; a source row never selects. Each target row carries its field status; the status filter shows the rows of
 * one status, and only the links to them. The orphaned target field mappings are listed below the trees under the
 * filters all and orphaned; selecting one selects its target field, and then offers to delete it.
 *
 * Each tree has a toolbar (spec #135): a search that shows the fields whose local name matches and their ancestors,
 * and only the links to rows it shows; Expand all and Collapse; and the field count and the visible-row count. The
 * search is this view's own state and the expansion the host's browser state: neither is an undo step.
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
  sides,
  splitter,
}: StructureOverviewProps) {
  const model = useStore(store, (s) => s.workingCopy);
  const diagnostics = useStore(store, (s) => s.diagnostics);
  const [search, setSearch] = useState<Record<Side, string>>({ source: '', target: '' });
  const source = useTree(mappingId, api, model.source, expanded.source, 'source', search.source);
  const statuses = useMemo(() => fieldStatuses(model, diagnostics, source.structure), [model, diagnostics, source.structure]);
  const target = useTree(mappingId, api, model.target, expanded.target, 'target', search.target, statuses, statusFilter);
  const orphaned = useMemo(() => (target.structure ? orphanedMappings(model, target.structure) : []), [model, target.structure]);
  const selectedOrphan = orphaned.find((path) => path === selectedField);
  const [picked, setPicked] = useState<string | null>(null);

  const links = useMemo(() => filteredLinks(fieldLinks(model), statuses, statusFilter), [model, statuses, statusFilter]);
  const anchored = useMemo(
    () => (source.anchors && target.anchors ? anchorLinks(links, source.anchors, target.anchors) : []),
    [links, source.anchors, target.anchors],
  );
  // With a side collapsed the gutter draws nothing: a link has no end on that side, and the other side's ↑n and ↓n
  // count the drawn links that run off its edge, of which there are none.
  const gutter = sides.collapsed === null ? linkGutter(anchored, source.viewport, target.viewport, ROW_HEIGHT, selectedField) : undefined;
  // the trees share one height; a tree still loading has none yet
  const gutterHeight = Math.max(source.viewport.height, target.viewport.height);
  // the columns: source tree, splitter, gutter, target tree; a collapsed tree takes no width
  const track = (side: Side) => (sides.collapsed === side ? '0' : `minmax(0, ${sides[side]}fr)`);

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
    <div className="fm-overview">
      <div className="fm-overview__trees" style={{ gridTemplateColumns: `${track('source')} auto auto ${track('target')}` }}>
        <TreePane
          side="source"
          id={sides.sourceId}
          hidden={sides.collapsed === 'source'}
          tree={source}
          search={search.source}
          onSearch={(value) => setSearch({ ...search, source: value })}
          onExpanded={(paths) => onExpandedChange({ ...expanded, source: paths })}
          // under a search, the matching rows and their ancestors are shown whatever is expanded
          onToggle={source.searching ? undefined : toggle}
          row={(path) => ({
            draggable: true,
            'aria-selected': picked === path,
            onDragStart: (e) => {
              e.dataTransfer.setData(SOURCE_FIELD_DRAG, path);
              e.dataTransfer.effectAllowed = 'link';
            },
            onKeyDown: (e) => activated(e) && setPicked(picked === path ? null : path),
          })}
        />
        {splitter}
        {gutter && <LinkGutter gutter={gutter} height={gutterHeight} />}
        <TreePane
          side="target"
          hidden={sides.collapsed === 'target'}
          tree={target}
          search={search.target}
          onSearch={(value) => setSearch({ ...search, target: value })}
          onExpanded={(paths) => onExpandedChange({ ...expanded, target: paths })}
          tools={
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
          }
          // under a filter or a search, the rows it shows and their ancestors are shown whatever is expanded
          onToggle={statusFilter === 'all' && !target.searching ? toggle : undefined}
          row={(path) => ({
            'aria-selected': selectedField === path,
            onDragOver: (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'link';
            },
            onDrop: (e) => {
              e.preventDefault();
              linkTo(path, e.dataTransfer.getData(SOURCE_FIELD_DRAG));
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
              <TargetLinks store={store} path={path} />
              <StatusMark status={statuses.get(path)} />
            </>
          )}
        />
      </div>
      {(statusFilter === 'all' || statusFilter === 'orphaned') && orphaned.length > 0 && (
        <section className="fm-overview__orphans">
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
          {selectedOrphan !== undefined && (
            <Button variant="secondary" isDanger onClick={() => store.getState().deleteTargetFieldMapping(selectedOrphan)}>
              Delete the selected orphaned target field mapping
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** A target row's field status mark: a coloured dot named by its status; nothing for a row without a status. */
function StatusMark({ status }: { status: FieldStatus | undefined }) {
  if (status === undefined) return null;
  const label = STATUS_LABELS[status];
  return <span role="img" aria-label={label} title={label} data-status={status} className="fm-status" />;
}

/** Enter or Space on a row, which then handles the key. */
function activated(e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return false;
  e.preventDefault();
  return true;
}

/** The structure of one side as the service loads it; the trees and the rest of the editor share its query. */
export function useStructure(mappingId: string, api: ApiClient, ref: StructureRef) {
  const request = { base: mappingId.split('/').slice(0, -1).join('/'), bundle: ref.bundle, root: ref.root };
  return useQuery({ queryKey: ['structure', request], queryFn: () => api.loadStructure(request) });
}

/** The source tree's statuses: none, and the same map on every render so that its rows stay memoised. */
const NO_STATUSES: ReadonlyMap<FieldPath, FieldStatus> = new Map();

/**
 * One tree: its structure, its visible rows, its field count, where links end among them, and its virtualiser. The
 * visible rows are the expanded ones under the filter `all` and no search; under a search, the rows `searchRows`
 * gives; under another filter, the rows of the filter's status in `statuses` and their ancestors, narrowed by the
 * search when there is one. A search is its text without the spaces around it; an empty one is no search.
 */
function useTree(
  mappingId: string,
  api: ApiClient,
  ref: StructureRef,
  expanded: string[] | undefined,
  side: Side,
  search: string,
  statuses: ReadonlyMap<FieldPath, FieldStatus> = NO_STATUSES,
  filter: StatusFilter = 'all',
) {
  const query = useStructure(mappingId, api, ref);
  const structure = query.data?.kind === 'loaded' ? query.data : undefined;
  const rootPath = structure ? `/${structure.root.step}` : '';
  const term = search.trim();
  const searching = term !== '';
  // under the filter `all` a new status map must not walk the tree again
  const shown = filter === 'all' ? NO_STATUSES : statuses;
  const rows = useMemo(() => {
    if (!structure) return [];
    if (filter !== 'all') return filteredRows(structure, shown, filter, side, term);
    return searching ? searchRows(structure, term, side) : treeRows(structure, new Set(expanded ?? [rootPath]), side);
  }, [structure, expanded, rootPath, side, shown, filter, term, searching]);
  const fields = useMemo(() => (structure ? fieldCount(structure) : 0), [structure]);
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
  const anchors = useMemo(() => (structure ? rowAnchors(structure, rows, searching) : undefined), [structure, rows, searching]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => keys[index]!,
    overscan: 8,
  });
  const viewport = { scrollTop: virtualizer.scrollOffset ?? 0, height: virtualizer.scrollRect?.height ?? 0 };
  return { query, structure, rootPath, rows, fields, searching, anchors, scrollRef, virtualizer, viewport };
}

type Tree = ReturnType<typeof useTree>;

interface TreePaneProps {
  side: Side;
  /** The pane's element id, which the splitter between the trees names as the pane it resizes. */
  id?: string;
  /** A hidden pane is collapsed fully. */
  hidden: boolean;
  tree: Tree;
  /** The search's text, as typed. */
  search: string;
  onSearch: (search: string) => void;
  /** Sets the tree's expanded branches: Expand all and Collapse. */
  onExpanded: (paths: string[]) => void;
  /** More controls in the tree's head, below its toolbar. */
  tools?: ReactNode;
  /** Expands or collapses a row; without it the rows offer no toggle. */
  onToggle?: (side: Side, rootPath: string, path: string) => void;
  row: (path: string) => HTMLAttributes<HTMLDivElement>;
  mark?: (path: string) => ReactNode;
}

/** A row's name: bold for a structure field, marked for an attribute (spec #135, after the prototype's .ftree__name). */
function nameClass(row: TreeRow) {
  const group = row.expandable ? ' fm-tree__name--group' : '';
  const attribute = row.field.kind === 'attribute' ? ' fm-tree__name--attribute' : '';
  return `fm-tree__name${group}${attribute}`;
}

function TreePane({ side, id, hidden, tree, search, onSearch, onExpanded, tools, onToggle, row, mark }: TreePaneProps) {
  const { query, structure, rootPath, rows, fields, scrollRef, virtualizer } = tree;
  const countId = useId();
  const label = side === 'source' ? 'Source structure' : 'Target structure';
  const display = hidden ? { display: 'none' } : undefined;
  const message = `fm-tree__message fm-tree--${side}`;

  if (query.isPending) {
    return (
      <p id={id} className={message} style={display}>
        Loading the {side} structure…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p id={id} role="alert" className={message} style={display}>
        {query.error.message}
      </p>
    );
  }
  if (query.data.kind === 'refused') {
    return (
      <ul id={id} aria-label={`${label} diagnostics`} className={message} style={display}>
        {query.data.diagnostics.map((d, i) => (
          <li key={i}>
            {d.severity} <code>{d.code}</code>: {d.message}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div id={id} className={`fm-tree fm-tree--${side}`} style={display}>
      <div className="fm-tree__head">
        <div role="group" aria-label={`${label} tools`} className="fm-tree__tools">
          <SearchInput
            className="fm-tree__search"
            aria-label={`Search ${side} fields`}
            placeholder="Search fields"
            value={search}
            onChange={(_event, value) => onSearch(value)}
            onClear={() => onSearch('')}
          />
          <Button variant="link" size="sm" onClick={() => onExpanded(expandAllPaths(structure!))}>
            Expand all
          </Button>
          <Button variant="link" size="sm" onClick={() => onExpanded([rootPath])}>
            Collapse
          </Button>
        </div>
        {tools}
        <div id={countId} className="fm-tree__count">
          {label}: {counted(fields, 'field')}, {counted(rows.length, 'visible row')}
        </div>
      </div>
      <div ref={scrollRef} role="tree" aria-label={label} aria-describedby={countId} className="fm-tree__scroll">
        <div role="presentation" className="fm-tree__rows" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const r = rows[item.index]!;
            const glyph = r.expanded ? '▾' : '▸';
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
                className="fm-tree__row"
                style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)`, paddingLeft: `${r.depth * 1.25}rem` }}
                {...row(r.path)}
              >
                {r.expandable && onToggle ? (
                  <button
                    type="button"
                    className="fm-tree__twisty"
                    aria-label={`${r.expanded ? 'Collapse' : 'Expand'} ${side} ${stepName(r.path)}`}
                    onClick={() => onToggle(side, rootPath, r.path)}
                  >
                    <span aria-hidden="true">{glyph}</span>
                  </button>
                ) : (
                  <div className="fm-tree__twisty" aria-hidden="true">
                    {r.expandable && glyph}
                  </div>
                )}
                <span className={nameClass(r)}>{stepName(r.path)}</span>
                <span className="fm-tree__type">{r.field.valueType}</span>
                <span className="fm-tree__occurrence">{occurrenceText(r.field)}</span>
                <span className="fm-tree__marks">
                  {r.refusal && <RefusedMark side={side} path={r.path} refusal={r.refusal} />}
                  {mark?.(r.path)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The link gutter (ADR-0012): a line per field link, dashed when it ends at a collapsed row's ancestor, with an fx
 * mark at its target end while that end is on screen, the fx count when several source-field boxes stand behind it,
 * a ctx mark at its source end when one of them has a context that is not the parent, and per side the ↑n and ↓n of
 * the ends scrolled away.
 */
function LinkGutter({ gutter, height }: { gutter: Gutter; height: number }) {
  const mid = GUTTER_WIDTH / 2;
  const count = (side: Side, edge: 'above' | 'below') => {
    const n = gutter.counts[side][edge];
    if (n === 0) return null;
    return (
      <span data-testid={`link-count:${side}:${edge}`} className={`fm-gutter__count fm-gutter__count--${side} fm-gutter__count--${edge}`}>
        {edge === 'above' ? '↑' : '↓'}
        {n}
      </span>
    );
  };
  return (
    <div className="fm-gutter">
      <svg aria-label="Field links" width={GUTTER_WIDTH} height={height}>
        {gutter.lines.map((l) => {
          const key = `${l.source}->${l.target}`;
          return (
            <g key={key}>
              <path
                data-testid={`field-link:${key}`}
                data-emphasis={l.emphasis}
                className="fm-gutter__link"
                d={`M0 ${l.y1} C${mid} ${l.y1} ${mid} ${l.y2} ${GUTTER_WIDTH} ${l.y2}`}
                strokeDasharray={l.dashed ? '4 3' : undefined}
              />
              {l.targetEdge === undefined && (
                <g
                  data-testid={`link-mark:${key}`}
                  data-emphasis={l.emphasis}
                  className="fm-gutter__fx"
                  transform={`translate(${GUTTER_WIDTH - FX_WIDTH - 1} ${l.y2 - 8})`}
                >
                  <rect width={FX_WIDTH} height={16} rx={3} />
                  <text x={FX_WIDTH / 2} y={11.5}>
                    fx
                  </text>
                </g>
              )}
              {l.boxes > 1 && (
                <text data-testid={`link-fx:${key}`} className="fm-gutter__label" x={mid} y={(l.y1 + l.y2) / 2 - 2} textAnchor="middle">
                  fx {l.boxes}
                </text>
              )}
              {l.contextChanged && (
                <text data-testid={`link-context:${key}`} className="fm-gutter__label" x={2} y={l.y1 - 3}>
                  <title>Read in a context other than its parent</title>
                  ctx
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {count('source', 'above')}
      {count('source', 'below')}
      {count('target', 'above')}
      {count('target', 'below')}
    </div>
  );
}

/** The mark of a refused field's row (ADR-0027): its reason and the declaration's file, line and column on hover. */
function RefusedMark({ side, path, refusal }: { side: Side; path: string; refusal: FieldRefusal }) {
  const text = `Refused: ${describeFieldRefusal(refusal)}`;
  return (
    <span data-testid={`refused:${side}:${path}`} role="img" aria-label={text} title={text} className="fm-refused">
      ⊘
    </span>
  );
}

/** The field links that end at a target field: one mark per source field that its `result` reaches (ADR-0013). */
function TargetLinks({ store, path }: { store: WorkingCopyStore; path: string }) {
  const mapping = useStore(store, (s) => s.workingCopy.targetFieldMappings?.[path]);
  return reachedSourceFields(mapping).map((field) => <span key={field}>← {stepName(field)}</span>);
}
