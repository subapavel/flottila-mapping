// PROTOTYPE (#10, throwaway): deterministic auto-layout of function graphs. Positions are never
// written into the mapping model (ADR-0010 "Layout and orphans"); manual drags live in
// sessionStorage keyed by AuthoringId (positions below).
import dagre from '@dagrejs/dagre';
import ELK from 'elkjs/lib/elk.bundled.js';
import { inputNames } from '../model/derive';
import type { AuthoringId, FieldPath, MappingModel, TargetFieldMapping } from '../model/types';
import { boxInputs } from '../model/types';

export type LNode = { id: string; width: number; height: number; rank?: 'first' | 'last' };
export type LEdge = { id: string; source: string; target: string; targetHandle?: string };
export type GraphSpec = { nodes: LNode[]; edges: LEdge[] };
export type Positions = Record<string, { x: number; y: number }>;

export const BOX_W = 180;
export function boxHeight(nInputs: number, nParams: number): number {
  return 40 + Math.max(1, nInputs) * 20 + nParams * 26;
}

export const targetNodeId = (p: FieldPath) => `target:${p}`;
export const fieldNodeId = (p: FieldPath) => `field:${p}`;

export function fieldMappingGraph(model: MappingModel, path: FieldPath, fm: TargetFieldMapping): GraphSpec {
  const nodes: LNode[] = [];
  const edges: LEdge[] = [];
  for (const id of Object.keys(fm.boxes).sort()) {
    const b = fm.boxes[id];
    const nIn = inputNames(model, b).length;
    nodes.push({ id, width: BOX_W, height: boxHeight(nIn, b.kind === 'source' ? (b.context ? 1 : 0) : Object.keys(b.params ?? {}).length) });
    boxInputs(b).forEach((src, i) => { if (src && fm.boxes[src]) edges.push({ id: `${src}->${id}#${i}`, source: src, target: id, targetHandle: `in-${i}` }); });
  }
  nodes.push({ id: targetNodeId(path), width: 170, height: 50, rank: 'last' });
  if (fm.result && fm.boxes[fm.result]) edges.push({ id: `${fm.result}->target`, source: fm.result, target: targetNodeId(path), targetHandle: 'in-0' });
  return { nodes, edges };
}

/** Variant (b): the whole mapping as one graph: source fields, boxes, target fields. */
export function wholeMappingGraph(model: MappingModel, copies = 1): GraphSpec {
  const nodes: LNode[] = [];
  const edges: LEdge[] = [];
  for (let c = 0; c < copies; c++) {
    const sfx = c === 0 ? '' : `~${c}`;
    const fields = new Set<string>();
    for (const path of Object.keys(model.targetFieldMappings).sort()) {
      const fm = model.targetFieldMappings[path];
      const g = fieldMappingGraph(model, path, fm);
      for (const n of g.nodes) nodes.push({ ...n, id: n.id + sfx });
      for (const e of g.edges) edges.push({ ...e, id: e.id + sfx, source: e.source + sfx, target: e.target + sfx });
      for (const id of Object.keys(fm.boxes).sort()) {
        const b = fm.boxes[id];
        if (b.kind !== 'source') continue;
        const fid = fieldNodeId(b.field) + sfx;
        if (!fields.has(fid)) { fields.add(fid); nodes.push({ id: fid, width: 200, height: 36, rank: 'first' }); }
        edges.push({ id: `${fid}->${id}${sfx}`, source: fid, target: id + sfx, targetHandle: 'in-0' });
      }
    }
  }
  return { nodes, edges };
}

export function layoutDagre(g: GraphSpec): Positions {
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 50, marginx: 10, marginy: 10 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) dg.setNode(n.id, { width: n.width, height: n.height });
  for (const e of g.edges) dg.setEdge(e.source, e.target);
  dagre.layout(dg);
  const pos: Positions = {};
  for (const n of g.nodes) {
    const d = dg.node(n.id) as { x: number; y: number };
    pos[n.id] = { x: Math.round(d.x - n.width / 2), y: Math.round(d.y - n.height / 2) };
  }
  return alignRanks(g, pos);
}

const elk = new ELK();
export async function layoutElk(g: GraphSpec): Promise<Positions> {
  const res = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '20', 'elk.layered.spacing.nodeNodeBetweenLayers': '50' },
    children: g.nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    edges: g.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }))
  });
  const pos: Positions = {};
  for (const c of res.children ?? []) pos[c.id] = { x: Math.round(c.x ?? 0), y: Math.round(c.y ?? 0) };
  return alignRanks(g, pos);
}

/** Source fields to the far left, target fields to the far right. */
function alignRanks(g: GraphSpec, pos: Positions): Positions {
  const xs = Object.values(pos).map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  for (const n of g.nodes) {
    if (n.rank === 'first') pos[n.id].x = minX;
    if (n.rank === 'last') pos[n.id].x = maxX;
  }
  return pos;
}

// ---- manual positions: browser state only ----
const KEY = 'prototype-mapping-editor:pos:';
export function loadManual(scope: string, ids: string[]): Positions {
  const out: Positions = {};
  for (const id of ids) {
    const v = sessionStorage.getItem(`${KEY}${scope}:${id}`);
    if (v) out[id] = JSON.parse(v);
  }
  return out;
}
export function saveManual(scope: string, id: AuthoringId, p: { x: number; y: number }) {
  sessionStorage.setItem(`${KEY}${scope}:${id}`, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
}
export function resetManual(scope: string, ids: string[]) {
  for (const id of ids) sessionStorage.removeItem(`${KEY}${scope}:${id}`);
}

