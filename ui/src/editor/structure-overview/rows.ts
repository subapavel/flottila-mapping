import type { FieldDto, StructureLoaded } from '../../api/client';
import type { BoxReference, FieldPath, TargetFieldMapping } from '../../generated/mapping-model';
import type { FieldRefusal } from '../../model/command';

type Side = 'source' | 'target';

/** One visible row of a structure tree. */
export interface TreeRow {
  /** The field path (ADR-0007): the root's step, then each child's step, each after a `/`. */
  path: string;
  depth: number;
  field: FieldDto;
  /** A structure field: it has a type with child fields, even when that type lists none. */
  expandable: boolean;
  expanded: boolean;
  /** The refusal that refuses the row's field in its tree, nearest the root (`refusalAt`); absent when none does. */
  refusal?: FieldRefusal;
}

/** The steps of a field path: an EQName's braces may hold a `/` (ADR-0007). */
export const STEP = /(?:\{[^}]*\}|[^/{])+/g;

/** The codes of the refusals that hold in a target only: a source reads the field (ADR-0008, #94, #95). */
const TARGET_ONLY = new Set(['interleaved-target-group', 'abstract-target-element']);

/** A field's own refusal, when it refuses the field on `side`. */
const refusing = (field: FieldDto, side: Side): FieldRefusal | undefined =>
  side === 'target' || !TARGET_ONLY.has(field.refusal?.code ?? '') ? field.refusal : undefined;

/**
 * The refusal that refuses the field at `path` on `side`, as compile reports it (ADR-0008 Shape, ADR-0027): the
 * refusal of the refused field nearest the root on the path, counting one that holds in a target only on the target
 * side only. The wire gives each field its own refusal, since a type's fields are shared (ADR-0015). `undefined` when
 * no field on the path refuses it, or the structure has no field at `path`. A step is matched against its first
 * same-step sibling: same-step siblings all carry one `ambiguous-field-path`, so the walk ends there anyway.
 */
export function refusalAt(structure: StructureLoaded, path: FieldPath, side: Side): FieldRefusal | undefined {
  const steps = path.match(STEP) ?? [];
  let field: FieldDto | undefined = steps[0] === structure.root.step ? structure.root : undefined;
  for (const step of steps.slice(1)) {
    if (field === undefined || refusing(field, side)) break;
    field = field.type === undefined ? undefined : structure.types[field.type]?.find((c) => c.step === step);
  }
  return field && refusing(field, side);
}

/**
 * Flattens the structure graph (ADR-0015) into the visible rows of the `side` tree: the root, then the child fields of
 * every expanded row. A recursive type is expanded only as deep as its paths are, so the rows are always finite
 * (ADR-0008). Each row carries the refusal `refusalAt` gives its path.
 */
export function treeRows(structure: StructureLoaded, expanded: ReadonlySet<string>, side: Side): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (field: FieldDto, path: string, depth: number, above: FieldRefusal | undefined) => {
    const open = field.type !== undefined && expanded.has(path);
    const refusal = above ?? refusing(field, side);
    rows.push({ path, depth, field, expandable: field.type !== undefined, expanded: open, ...(refusal && { refusal }) });
    if (!open) return;
    for (const child of structure.types[field.type!] ?? []) visit(child, `${path}/${child.step}`, depth + 1, refusal);
  };
  visit(structure.root, `/${structure.root.step}`, 0, undefined);
  return rows;
}

/**
 * The name a row shows for the last step of a field path: its local name, `@` before an attribute's, and a JSON
 * property's name as the schema spells it, its `% / @ { }` decoded (ADR-0007); a JSON root is `$`.
 */
export function stepName(path: string): string {
  const last = /(?:\{[^}]*\}|[^/{])+$/.exec(path)?.[0] ?? path;
  return decodeURIComponent(last.replace(/^(@?)Q\{[^}]*\}/, '$1'));
}

/** A field's effective occurrence, `min..max`, with `unbounded` for an absent max. */
export function occurrenceText(field: FieldDto): string {
  return `${field.min}..${field.max ?? 'unbounded'}`;
}

/**
 * The source fields read by the source-field boxes that a target field mapping's `result` reaches (ADR-0013), each
 * once, in the order a walk from `result` through the boxes' inputs meets them. An unreachable box adds none, so a
 * mapping whose `result` is null has none. The walk stops at an empty input slot, a box it has met, and a missing box.
 */
export function reachedSourceFields(mapping: TargetFieldMapping | undefined): FieldPath[] {
  return [...reachedSourceBoxes(mapping).keys()];
}

/** The reached source fields of `reachedSourceFields`, each with how many reached source-field boxes read it. */
export function reachedSourceBoxes(mapping: TargetFieldMapping | undefined): Map<FieldPath, number> {
  const fields = new Map<FieldPath, number>();
  const met = new Set<string>();
  const visit = (ref: BoxReference) => {
    if (ref === null || met.has(ref)) return;
    met.add(ref);
    const box = mapping!.boxes[ref];
    if (box === undefined) return;
    if (box.kind === 'source') fields.set(box.field, (fields.get(box.field) ?? 0) + 1);
    else box.inputs?.forEach(visit);
  };
  if (mapping) visit(mapping.result);
  return fields;
}
