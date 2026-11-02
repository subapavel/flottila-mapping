import type { FieldDto, StructureLoaded } from '../../api/client';

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

/** The name a row shows for the last step of a field path: its local name, `@` before an attribute's. */
export function stepName(path: string): string {
  const last = /(?:\{[^}]*\}|[^/{])+$/.exec(path)?.[0] ?? path;
  return last.replace(/^(@?)Q\{[^}]*\}/, '$1');
}

/** A field's effective occurrence, `min..max`, with `unbounded` for an absent max. */
export function occurrenceText(field: FieldDto): string {
  return `${field.min}..${field.max ?? 'unbounded'}`;
}
