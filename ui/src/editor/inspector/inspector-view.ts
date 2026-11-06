import type { FunctionCatalogue } from '../../api/client';
import type { AuthoringId, Box, FieldPath, MappingModel, Params, TargetFieldMapping, Udfs } from '../../generated/mapping-model';
import { localPath, stepName } from '../../model/field-path';

/** The box the inspector shows, with its target field mapping. */
export interface Inspected {
  id: AuthoringId;
  box: Box;
  mapping: TargetFieldMapping;
}

/**
 * The selected box when it is a box of the selected target field's mapping; the store's selection may be a box of
 * another target field mapping, which the canvas does not show either.
 */
export function inspected(model: MappingModel, targetField: FieldPath | null, selection: AuthoringId | null): Inspected | undefined {
  const mapping = targetField === null ? undefined : model.targetFieldMappings?.[targetField];
  if (mapping === undefined || selection === null || !Object.hasOwn(mapping.boxes, selection)) return undefined;
  return { id: selection, box: mapping.boxes[selection]!, mapping };
}

/** What a box is called: its source field's local path (as on its card), its function, its UDF or its original name. */
export function boxTitle(box: Box): string {
  switch (box.kind) {
    case 'source':
      return localPath(box.field);
    case 'function':
      return box.fn;
    case 'udf':
      return box.udf;
    case 'unresolved':
      return box.name;
  }
}

/**
 * The names of a box's input slots, as the canvas shows them: the catalogue's for a function, the declaration's for a
 * `udf`; slots without a known name are numbered from 1, as many as the model has. A source-field box has none.
 */
export function slotNames(box: Box, catalogue: FunctionCatalogue, udfs: Udfs | undefined): string[] {
  if (box.kind === 'source') return [];
  const names = box.kind === 'function' ? catalogue[box.fn]?.inputs?.map((input) => input.name) : box.kind === 'udf' ? udfs?.[box.udf]?.inputs : undefined;
  return names ?? (box.inputs ?? []).map((_, i) => String(i + 1));
}

/** The boxes an input slot of `target` may be wired from: every other box of its mapping, in sorted id order. */
export function slotChoices(mapping: TargetFieldMapping, target: AuthoringId): { id: AuthoringId; title: string }[] {
  return Object.keys(mapping.boxes)
    .sort()
    .filter((id) => id !== target)
    .map((id) => ({ id, title: boxTitle(mapping.boxes[id]!) }));
}

/**
 * A target field mapping's expression (spec #145): the function chain of box `id`, its `result` by default, after the
 * prototype's `chainText`. A box is its name with its inputs, then its params sorted by name, in brackets, as
 * `formatDate(/PO/Date, outputPattern="yyyyMMdd")`; a source-field box is its field's path in local names, with
 * ` @ctx` and the context's name when it has one; a constant is its value in quotes; an unresolved function's name
 * ends in `?`. No box, an unconnected input and an id the mapping lacks are `∅`; a box met a second time is `↺` and its
 * name, so that a fan-out is written once and a cycle ends.
 */
export function chainText(mapping: TargetFieldMapping, id: AuthoringId | null = mapping.result, seen = new Set<AuthoringId>()): string {
  const box = id === null ? undefined : mapping.boxes[id];
  if (box === undefined) return '∅';
  if (box.kind === 'source') return `/${localPath(box.field)}${box.context === undefined ? '' : ` @ctx ${stepName(box.context)}`}`;
  if (box.kind === 'function' && box.fn === 'constant') return `"${box.params?.value ?? ''}"`;
  const name = box.kind === 'function' ? box.fn : box.kind === 'udf' ? box.udf : `${box.name}?`;
  if (seen.has(id!)) return `↺${name}`;
  seen.add(id!);
  const inputs = (box.inputs ?? []).map((input) => chainText(mapping, input, seen));
  return `${name}(${[...inputs, ...paramTexts(box.params)].join(', ')})`;
}

/** A box's params as `name="value"`, a table as `name={n rows}`, sorted by name. */
function paramTexts(params: Params | undefined): string[] {
  return Object.keys(params ?? {})
    .sort()
    .map((name) => {
      const value = params![name]!;
      return typeof value === 'string' ? `${name}="${value}"` : `${name}={${Object.keys(value).length} rows}`;
    });
}

/** One row of a table parameter's editor. */
export interface TableRow {
  key: string;
  value: string;
}

/** The first key that a later row repeats: a table cannot hold it twice, so the editor refuses the rows. */
export function duplicateKey(rows: readonly TableRow[]): string | undefined {
  const seen = new Set<string>();
  for (const { key } of rows) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return undefined;
}
