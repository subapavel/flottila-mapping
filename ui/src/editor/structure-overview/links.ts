import type { StructureLoaded } from '../../api/client';
import type { FieldPath, MappingModel } from '../../generated/mapping-model';
import { properAncestors } from '../../model/set-context';
import { reachedSourceBoxes, type TreeRow } from './rows';

/** A field link (ADR-0012): one per pair of source field and target field. */
export interface FieldLink {
  source: FieldPath;
  target: FieldPath;
  /** How many source-field boxes reading `source` the target field mapping's `result` reaches; the fx count. */
  boxes: number;
  /** One of those boxes has a context that is not the parent: the link is marked (ADR-0012). */
  contextChanged?: true;
}

/** The row a field link ends at: the field's own row, or its nearest visible ancestor's, dashed. */
export interface Anchor {
  index: number;
  dashed: boolean;
}

export type AnchoredLink = FieldLink & { from: Anchor; to: Anchor };

/** The scroll state of one tree: its scroll offset and its height, in px. */
export interface Viewport {
  scrollTop: number;
  height: number;
}

export type Edge = 'above' | 'below';

/** A link as the gutter draws it: `y1` on the source side, `y2` on the target side, in px from the gutter's top. */
export interface LinkLine extends FieldLink {
  y1: number;
  y2: number;
  /** The end on that side is scrolled away and drawn at the gutter edge. */
  sourceEdge?: Edge;
  targetEdge?: Edge;
  dashed: boolean;
  /** Highlighted for the selected target field, dimmed for the others, plain while none is selected. */
  emphasis: 'highlighted' | 'dimmed' | 'plain';
}

export interface Gutter {
  lines: LinkLine[];
  /** Per side, how many drawn links end at the top edge (↑n) and at the bottom edge (↓n). */
  counts: Record<'source' | 'target', Record<Edge, number>>;
}

/** The steps of a field path: an EQName's braces may hold a `/` (ADR-0007). */
const STEP = /(?:\{[^}]*\}|[^/{])+/g;

/**
 * The field links of a model: per target field mapping, one per source field that its `result` reaches, in the order
 * of the model's target field mappings and then the walk from `result`. A link is marked when one of the reached
 * source-field boxes behind it has a context that is not its field's parent.
 */
export function fieldLinks(model: MappingModel): FieldLink[] {
  return Object.entries(model.targetFieldMappings ?? {}).flatMap(([target, mapping]) =>
    [...reachedSourceBoxes(mapping)].map(([source, boxes]): FieldLink => {
      const link: FieldLink = { source, target, boxes: boxes.length };
      if (boxes.some((box) => box.context !== undefined && box.context !== properAncestors(box.field)[0])) link.contextChanged = true;
      return link;
    }),
  );
}

/**
 * Where a link to a field ends among a tree's visible rows: the field's own row, else its nearest visible ancestor's
 * row, dashed. `undefined` when the structure has no such field, as for an orphaned reference.
 */
export function rowAnchors(structure: StructureLoaded, rows: readonly TreeRow[]): (path: FieldPath) => Anchor | undefined {
  const index = new Map(rows.map((row, i) => [row.path, i]));
  return (path) => {
    const steps = path.match(STEP) ?? [];
    if (steps[0] !== structure.root.step) return undefined;
    let field = structure.root;
    let prefix = `/${steps[0]}`;
    // the root is always row 0; a deeper row is visible only while all its ancestors are
    let anchor: Anchor = { index: 0, dashed: false };
    for (const step of steps.slice(1)) {
      const child = field.type === undefined ? undefined : structure.types[field.type]?.find((c) => c.step === step);
      if (child === undefined) return undefined;
      field = child;
      prefix += `/${step}`;
      const row = index.get(prefix);
      anchor = row === undefined ? { index: anchor.index, dashed: true } : { index: row, dashed: false };
    }
    return anchor;
  };
}

/** The links whose two ends have a row, each with its rows; a link to a field a tree does not have is not drawn. */
export function anchorLinks(
  links: readonly FieldLink[],
  source: (path: FieldPath) => Anchor | undefined,
  target: (path: FieldPath) => Anchor | undefined,
): AnchoredLink[] {
  return links.flatMap((link) => {
    const from = source(link.source);
    const to = target(link.target);
    return from && to ? [{ ...link, from, to }] : [];
  });
}

/**
 * The link gutter for the trees' scroll states, all rows `rowHeight` high (ADR-0012). A link is drawn when at least
 * one of its ends is on screen; an end scrolled away runs to the gutter edge on its side and is counted there.
 */
export function linkGutter(
  links: readonly AnchoredLink[],
  source: Viewport,
  target: Viewport,
  rowHeight: number,
  selectedTarget: FieldPath | null,
): Gutter {
  const counts: Gutter['counts'] = { source: { above: 0, below: 0 }, target: { above: 0, below: 0 } };
  const lines: LinkLine[] = [];
  for (const link of links) {
    const from = place(link.from.index, source, rowHeight);
    const to = place(link.to.index, target, rowHeight);
    if (from.edge && to.edge) continue;
    if (from.edge) counts.source[from.edge]++;
    if (to.edge) counts.target[to.edge]++;
    lines.push({
      source: link.source,
      target: link.target,
      boxes: link.boxes,
      contextChanged: link.contextChanged,
      y1: from.y,
      y2: to.y,
      sourceEdge: from.edge,
      targetEdge: to.edge,
      dashed: link.from.dashed || link.to.dashed,
      emphasis: selectedTarget === null ? 'plain' : link.target === selectedTarget ? 'highlighted' : 'dimmed',
    });
  }
  return { lines, counts };
}

/** A row's centre in the viewport, or the edge it is scrolled past. */
function place(index: number, view: Viewport, rowHeight: number): { y: number; edge?: Edge } {
  const y = index * rowHeight + rowHeight / 2 - view.scrollTop;
  if (y < 0) return { y: 0, edge: 'above' };
  if (y > view.height) return { y: view.height, edge: 'below' };
  return { y };
}
