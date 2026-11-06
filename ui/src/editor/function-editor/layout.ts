import { graphlib, layout } from '@dagrejs/dagre';
import type { TargetFieldMapping } from '../../generated/mapping-model';
import { boxIds, SINK, wires } from './graph';

export interface XY {
  x: number;
  y: number;
}

/** The top-left corner of each box and of the sink, by node id: browser state only, never the model (ADR-0012). */
export type Positions = Readonly<Record<string, XY>>;

/** The size the layout gives every node, the sink included. */
export const BOX = { width: 180, height: 96 } as const;

/** The card heights by node id, from `cardHeights`; a node without one (the sink) has `BOX.height`. */
export type Heights = Readonly<Record<string, number>>;

const heightOf = (heights: Heights, id: string) => heights[id] ?? BOX.height;

/** The gap between two cards, and a new box's distance from its neighbour, left or right. */
const GAP = 16;
const COLUMN = BOX.width + 64;

/** The node ids of a target field mapping's graph: its boxes in sorted authoring id order, then the sink. */
const nodeIds = (mapping: TargetFieldMapping | undefined) => [...boxIds(mapping), SINK];

/**
 * The full layout, run when a graph opens without kept positions and by "Arrange" (ADR-0012, "Layout"): dagre, left
 * to right into the sink, nodes and wires added in sorted authoring id order so that the same model always gets the
 * same layout.
 */
export function arrange(mapping: TargetFieldMapping | undefined, heights: Heights = {}): Positions {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: GAP, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of nodeIds(mapping)) graph.setNode(id, { width: BOX.width, height: heightOf(heights, id) });
  for (const wire of wires(mapping)) graph.setEdge(wire.source, wire.target);
  layout(graph);
  return Object.fromEntries(
    nodeIds(mapping).map((id) => {
      const node = graph.node(id);
      return [id, { x: node.x! - BOX.width / 2, y: node.y! - heightOf(heights, id) / 2 }];
    }),
  );
}

/**
 * The stable layout after open (ADR-0012): `kept` positions stay where they are, but only for ids the model still
 * has, and each new node is placed next to its neighbour. The neighbour is the first placed node it feeds, which it
 * goes left of; else the first placed node that feeds it, which it goes right of; else the placed `selected` box, which
 * it goes left of (quick insert puts a box next to the selected box); else it goes below all nodes at the left edge. A
 * taken spot, one that its card would share area with, moves it down below the lowest card it meets. Returns `kept`
 * itself when the model has exactly its ids.
 */
export function place(mapping: TargetFieldMapping | undefined, kept: Positions, selected: string | null = null, heights: Heights = {}): Positions {
  const ids = nodeIds(mapping);
  const keptIds = Object.keys(kept);
  if (keptIds.length === ids.length && ids.every((id) => Object.hasOwn(kept, id))) return kept;

  const placed: Record<string, XY> = Object.fromEntries(ids.filter((id) => Object.hasOwn(kept, id)).map((id) => [id, kept[id]!]));
  const all = wires(mapping);
  for (const id of ids.filter((id) => !Object.hasOwn(placed, id))) {
    const consumer = all.find((w) => w.source === id && Object.hasOwn(placed, w.target))?.target;
    const producer = all.find((w) => w.target === id && Object.hasOwn(placed, w.source))?.source;
    const anchor = selected !== null && Object.hasOwn(placed, selected) ? selected : undefined;
    let spot = consumer
      ? { x: placed[consumer]!.x - COLUMN, y: placed[consumer]!.y }
      : producer
        ? { x: placed[producer]!.x + COLUMN, y: placed[producer]!.y }
        : anchor
          ? { x: placed[anchor]!.x - COLUMN, y: placed[anchor]!.y }
          : below(placed, heights);
    const h = heightOf(heights, id);
    const taken = (at: XY) =>
      Object.entries(placed).some(([other, p]) => Math.abs(p.x - at.x) < BOX.width && p.y < at.y + h && at.y < p.y + heightOf(heights, other));
    while (taken(spot)) spot = { x: spot.x, y: spot.y + h + GAP };
    placed[id] = spot;
  }
  return placed;
}

/** Below all placed nodes at their left edge; the origin when none is placed. */
function below(placed: Record<string, XY>, heights: Heights): XY {
  const all = Object.entries(placed);
  if (all.length === 0) return { x: 0, y: 0 };
  return { x: Math.min(...all.map(([, p]) => p.x)), y: Math.max(...all.map(([id, p]) => p.y + heightOf(heights, id))) + GAP };
}
