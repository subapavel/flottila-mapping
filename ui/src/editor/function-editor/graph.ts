import type { FunctionCatalogue } from '../../api/client';
import type { AuthoringId, Box, BoxReference, TargetFieldMapping, Udfs } from '../../generated/mapping-model';
import { stepName } from '../../model/field-path';
import { properAncestors } from '../../model/set-context';
import { badges, type Badge } from './palette';

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

/**
 * A parameter of a box card: a text param's value, or a table param's size. `editable` is a text param of a catalogue
 * function, as in the inspector; `values` are the choices of a param that takes only those.
 */
export interface CardParam {
  name: string;
  text: string;
  table: boolean;
  editable: boolean;
  values?: string[];
}

/** A source-field box's context: the value shown, and the choices, the parent first (as the inspector offers them). */
export interface CardContext {
  value: string;
  choices: { path: string; label: string }[];
}

/** What a box card shows besides its `BoxView`: its caption, fidelity badges, parameters and a source field's context. */
export interface CardView {
  kind: Box['kind'];
  caption: string;
  /** The fidelity badges (assumed, deviation) of a function the catalogue knows. */
  badges: Badge[];
  params: CardParam[];
  /** A source-field box's context; the parent's when the model leaves it out. */
  context?: CardContext;
}

/**
 * The card of a box (spec #135): a caption by kind, the fidelity badges of its catalogue entry, its parameters as the
 * model holds them (a constant's value is its `BoxView.value`, so not repeated), and a source-field box's context. A
 * field without a proper ancestor shows its own name as its context.
 */
export function cardView(box: Box, catalogue: FunctionCatalogue): CardView {
  if (box.kind === 'source') {
    const ancestors = properAncestors(box.field);
    const choices = (ancestors.length > 0 ? ancestors : [box.field]).map((path, i) => ({
      path,
      label: i === 0 ? `${stepName(path)} (parent)` : stepName(path),
    }));
    return { kind: 'source', caption: 'source field', badges: [], params: [], context: { value: box.context ?? choices[0]!.path, choices } };
  }
  const entry = box.kind === 'function' ? catalogue[box.fn] : undefined;
  const params =
    box.kind === 'function' && box.fn === 'constant'
      ? []
      : Object.entries(box.params ?? {}).map(([name, value]): CardParam => {
          if (typeof value !== 'string') return { name, text: `table, ${Object.keys(value).length} rows`, table: true, editable: false };
          const param = entry?.params?.find((p) => p.name === name);
          return { name, text: value, table: false, editable: param !== undefined, values: param?.type === 'string' ? param.values : undefined };
        });
  return {
    kind: box.kind,
    caption: box.kind === 'function' ? 'fn' : box.kind === 'udf' ? 'UDF' : 'unresolved',
    badges: entry === undefined ? [] : badges(entry).filter((badge) => badge.kind !== 'not-portable'),
    params,
  };
}

/** The heights, in px, of a card's parts, as function-editor.css sets them (a row is a line of text with its padding). */
export const CARD_HEIGHT = { base: 50, row: 22, context: 26, value: 22, badges: 22, slack: 8 } as const;

/**
 * Each box's card height from its content, for the layout: the caption and id, one row per input slot and per param,
 * a source card's context row, a constant's value, and a row more when fidelity badges make the head wrap. A function
 * of the model and the catalogue only, so the layout stays deterministic (ADR-0012).
 */
export function cardHeights(mapping: TargetFieldMapping, catalogue: FunctionCatalogue, udfs: Udfs | undefined): Record<AuthoringId, number> {
  return Object.fromEntries(
    boxIds(mapping).map((id) => {
      const box = mapping.boxes[id]!;
      const view = boxView(box, catalogue, udfs);
      const card = cardView(box, catalogue);
      const height =
        CARD_HEIGHT.base +
        CARD_HEIGHT.row * (view.slots.length + card.params.length) +
        (card.context === undefined ? 0 : CARD_HEIGHT.context) +
        (view.value === undefined ? 0 : CARD_HEIGHT.value) +
        (card.badges.length === 0 ? 0 : CARD_HEIGHT.badges) +
        CARD_HEIGHT.slack;
      return [id, height];
    }),
  );
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
