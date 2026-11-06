import type { FunctionCatalogue } from '../../api/client';
import type { AuthoringId, Box, FieldPath, MappingModel, TargetFieldMapping, Udfs } from '../../generated/mapping-model';

type CatalogueEntry = FunctionCatalogue[string];

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

/** The local name of a field path's last step, `@` before an attribute's. */
export function stepName(path: FieldPath): string {
  const last = /(?:\{[^}]*\}|[^/{])+$/.exec(path)?.[0] ?? path;
  return last.replace(/^(@?)Q\{[^}]*\}/, '$1');
}

/** What a box is called: its source field's last step, its function, its UDF or its original name. */
export function boxTitle(box: Box): string {
  switch (box.kind) {
    case 'source':
      return stepName(box.field);
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

/** A mark of a catalogue entry (ADR-0026): an assumed reading, a deviation with its text, an export that needs Flottila. */
export type Badge = { kind: 'assumed' } | { kind: 'deviation'; text: string } | { kind: 'not-portable' };

/** The fidelity badge, if the function is not exact, then "not portable" if its export is not portable. */
export function badges(entry: CatalogueEntry): Badge[] {
  const { fidelity } = entry;
  const marks: Badge[] = [];
  if (fidelity.level === 'assumed') marks.push({ kind: 'assumed' });
  if (fidelity.level === 'deviation') marks.push({ kind: 'deviation', text: fidelity.text });
  if (!entry.portable) marks.push({ kind: 'not-portable' });
  return marks;
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
