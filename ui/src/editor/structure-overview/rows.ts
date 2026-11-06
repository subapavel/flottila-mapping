import type { FieldDto, StructureLoaded } from '../../api/client';
import type { BoxReference, FieldPath, SourceFieldBox, TargetFieldMapping } from '../../generated/mapping-model';

/** One visible row of a structure tree. */
export interface TreeRow {
  /** The field path (ADR-0007): the root's step, then each child's step, each after a `/`. */
  path: string;
  depth: number;
  field: FieldDto;
  /** A structure field: it has a type with child fields, even when that type lists none. */
  expandable: boolean;
  expanded: boolean;
}

/**
 * Flattens the structure graph (ADR-0015) into the visible rows: the root, then the child fields of every expanded
 * row. A recursive type is expanded only as deep as its paths are, so the rows are always finite (ADR-0008).
 */
export function treeRows(structure: StructureLoaded, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (field: FieldDto, path: string, depth: number) => {
    const open = field.type !== undefined && expanded.has(path);
    rows.push({ path, depth, field, expandable: field.type !== undefined, expanded: open });
    if (!open) return;
    for (const child of structure.types[field.type!] ?? []) visit(child, `${path}/${child.step}`, depth + 1);
  };
  visit(structure.root, `/${structure.root.step}`, 0);
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

/** The reached source fields of `reachedSourceFields`, each with the reached source-field boxes that read it. */
export function reachedSourceBoxes(mapping: TargetFieldMapping | undefined): Map<FieldPath, SourceFieldBox[]> {
  const fields = new Map<FieldPath, SourceFieldBox[]>();
  const met = new Set<string>();
  const visit = (ref: BoxReference) => {
    if (ref === null || met.has(ref)) return;
    met.add(ref);
    const box = mapping!.boxes[ref];
    if (box === undefined) return;
    if (box.kind === 'source') fields.set(box.field, [...(fields.get(box.field) ?? []), box]);
    else box.inputs?.forEach(visit);
  };
  if (mapping) visit(mapping.result);
  return fields;
}
