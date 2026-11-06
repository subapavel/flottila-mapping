import type { FunctionCatalogue } from '../../api/client';
import type { AuthoringId, Box, BoxReference, FieldPath, MappingModel, TargetFieldMapping, Udfs } from '../../generated/mapping-model';

/** The node id of the sink, the target field itself; no authoring id has a `:` (ADR-0010). */
export const SINK = ':sink';

/** A wire of the canvas: a box's output into an input slot of another box, or `result` into the sink (no slot). */
export interface Wire {
  id: string;
  source: AuthoringId;
  target: AuthoringId | typeof SINK;
  slot?: number;
}

/** A target field mapping's box ids in sorted authoring id order (ADR-0012, "Layout"). */
export function boxIds(mapping: TargetFieldMapping | undefined): AuthoringId[] {
  return Object.keys(mapping?.boxes ?? {}).sort();
}

/** The input slots of a box; a source-field box has none. */
function inputsOf(box: Box): BoxReference[] {
  return box.kind === 'source' ? [] : (box.inputs ?? []);
}

/** One wire per used input slot, the boxes in sorted order and their slots in order, then `result` into the sink. */
export function wires(mapping: TargetFieldMapping | undefined): Wire[] {
  const all: Wire[] = [];
  for (const id of boxIds(mapping)) {
    inputsOf(mapping!.boxes[id]!).forEach((source, slot) => {
      if (source !== null) all.push({ id: `${source}->${id}#${slot}`, source, target: id, slot });
    });
  }
  const result = mapping?.result ?? null;
  if (result !== null) all.push({ id: `${result}->${SINK}`, source: result, target: SINK });
  return all;
}

/** The boxes `result` reaches through the input slots; any other box is an unreachable box (ADR-0013). */
export function reachable(mapping: TargetFieldMapping | undefined): Set<AuthoringId> {
  const reached = new Set<AuthoringId>();
  const pending: BoxReference[] = [mapping?.result ?? null];
  while (pending.length > 0) {
    const id = pending.pop()!;
    // an empty slot, a box met before (a model written by hand may hold a cycle), a reference to no box
    if (id === null || reached.has(id) || !Object.hasOwn(mapping!.boxes, id)) continue;
    reached.add(id);
    pending.push(...inputsOf(mapping!.boxes[id]!));
  }
  return reached;
}

/** What a box node shows: its title, the names of its input slots, and a constant box's value. */
export interface BoxView {
  title: string;
  slots: string[];
  /** A `constant` box's value as JSON, `""` when the param is left out at its default. */
  value?: string;
}

/**
 * A source-field box shows its field's last step; a function box its function and the catalogue's input names; a
 * `udf` box its declaration's input names; an `unresolved` box its name. Slots without a known name are numbered
 * from 1, as many as the model has.
 */
export function boxView(box: Box, catalogue: FunctionCatalogue, udfs: Udfs | undefined): BoxView {
  if (box.kind === 'source') return { title: stepName(box.field), slots: [] };
  const [title, names] =
    box.kind === 'function'
      ? [box.fn, catalogue[box.fn]?.inputs?.map((input) => input.name)]
      : box.kind === 'udf'
        ? [box.udf, udfs?.[box.udf]?.inputs]
        : [box.name, undefined];
  const view: BoxView = { title, slots: names ?? inputsOf(box).map((_, i) => String(i + 1)) };
  if (box.kind === 'function' && box.fn === 'constant') view.value = JSON.stringify(box.params?.value ?? '');
  return view;
}

/** The live marks of a canvas (ADR-0013): whether `result` is `null`, and the input slots that read no box, by box. */
export interface LiveMarks {
  resultUnconnected: boolean;
  /** Only the boxes that have such a slot; a slot the model leaves out counts. */
  unconnectedInputs: Record<AuthoringId, number[]>;
}

export function liveMarks(mapping: TargetFieldMapping, catalogue: FunctionCatalogue, udfs: Udfs | undefined): LiveMarks {
  const unconnectedInputs: Record<AuthoringId, number[]> = {};
  for (const id of boxIds(mapping)) {
    const box = mapping.boxes[id]!;
    const inputs = inputsOf(box);
    const open = boxView(box, catalogue, udfs).slots.flatMap((_, slot) => (inputs[slot] == null ? [slot] : []));
    if (open.length > 0) unconnectedInputs[id] = open;
  }
  return { resultUnconnected: mapping.result === null, unconnectedInputs };
}

/** The local name of a field path's last step, `@` before an attribute's. */
export function stepName(path: FieldPath): string {
  const last = /(?:\{[^}]*\}|[^/{])+$/.exec(path)![0];
  return last.replace(/^(@?)Q\{[^}]*\}/, '$1');
}

/** Where an authoring id is: the target field whose mapping has it, and the box when it is a box's id. */
export function locate(model: MappingModel, id: AuthoringId): { field: FieldPath; box: AuthoringId | null } | undefined {
  for (const [field, mapping] of Object.entries(model.targetFieldMappings ?? {})) {
    if (mapping.id === id) return { field, box: null };
    if (Object.hasOwn(mapping.boxes, id)) return { field, box: id };
  }
  return undefined;
}
