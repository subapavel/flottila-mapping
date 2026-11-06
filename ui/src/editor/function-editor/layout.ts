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
export const BOX = { width: 180, height: 64 } as const;

/** A new box's distance from its neighbour, left or right, and the step that moves it down off a taken spot. */
const COLUMN = BOX.width + 64;
const ROW = BOX.height + 16;

/** The node ids of a target field mapping's graph: its boxes in sorted authoring id order, then the sink. */
const nodeIds = (mapping: TargetFieldMapping | undefined) => [...boxIds(mapping), SINK];

/**
 * The full layout, run when a graph opens without kept positions and by "Arrange" (ADR-0012, "Layout"): dagre, left
 * to right into the sink, nodes and wires added in sorted authoring id order so that the same model always gets the
 * same layout.
 */
export function arrange(mapping: TargetFieldMapping | undefined): Positions {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 16, ranksep: 64 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of nodeIds(mapping)) graph.setNode(id, { width: BOX.width, height: BOX.height });
  for (const wire of wires(mapping)) graph.setEdge(wire.source, wire.target);
  layout(graph);
  return Object.fromEntries(
    nodeIds(mapping).map((id) => {
      const node = graph.node(id);
      return [id, { x: node.x! - BOX.width / 2, y: node.y! - BOX.height / 2 }];
    }),
  );
}

/**
 * The stable layout after open (ADR-0012): `kept` positions stay where they are, but only for ids the model still
 * has, and each new node is placed next to its neighbour. The neighbour is the first placed node it feeds, which it
 * goes left of; else the first placed node that feeds it, which it goes right of; else it goes below all nodes at the
 * left edge. A taken spot moves it down. Returns `kept` itself when the model has exactly its ids.
 */
export function place(mapping: TargetFieldMapping | undefined, kept: Positions): Positions {
  const ids = nodeIds(mapping);
  const keptIds = Object.keys(kept);
  if (keptIds.length === ids.length && ids.every((id) => Object.hasOwn(kept, id))) return kept;

  const placed: Record<string, XY> = Object.fromEntries(ids.filter((id) => Object.hasOwn(kept, id)).map((id) => [id, kept[id]!]));
  const all = wires(mapping);
  for (const id of ids.filter((id) => !Object.hasOwn(placed, id))) {
    const consumer = all.find((w) => w.source === id && Object.hasOwn(placed, w.target))?.target;
    const producer = all.find((w) => w.target === id && Object.hasOwn(placed, w.source))?.source;
    let spot = consumer
      ? { x: placed[consumer]!.x - COLUMN, y: placed[consumer]!.y }
      : producer
        ? { x: placed[producer]!.x + COLUMN, y: placed[producer]!.y }
        : below(Object.values(placed));
    while (Object.values(placed).some((p) => Math.abs(p.x - spot.x) < BOX.width && Math.abs(p.y - spot.y) < BOX.height)) {
      spot = { x: spot.x, y: spot.y + ROW };
    }
    placed[id] = spot;
  }
  return placed;
}

/** Below all placed nodes at their left edge; the origin when none is placed. */
function below(placed: XY[]): XY {
  if (placed.length === 0) return { x: 0, y: 0 };
  return { x: Math.min(...placed.map((p) => p.x)), y: Math.max(...placed.map((p) => p.y)) + ROW };
}
