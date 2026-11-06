import type { Diagnostic, FieldDto, StructureLoaded } from '../../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';
import type { FieldRefusal } from '../../model/command';
import { fieldPathSteps } from '../../model/field-path';
import { rowRefusal, type TreeRow } from './rows';

/** The mark of a target row (GLOSSARY: Field status); a row without one has no mark. */
export type FieldStatus = 'mapped' | 'unmapped-mandatory' | 'orphaned' | 'error';

/** What the target tree shows: every row, or the rows of one status (ADR-0012). */
export type StatusFilter = 'all' | FieldStatus;

/** The filter values in the order the filter offers them. */
export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'mapped', 'unmapped-mandatory', 'orphaned', 'error'];

/** The code compile reports at the pointer of a mandatory target leaf that no target field mapping writes. */
const UNMAPPED_MANDATORY_LEAF = 'unmapped-mandatory-leaf';

/** The statuses from the least to the most urgent: a row shows the most urgent of its statuses. */
const PRECEDENCE: readonly FieldStatus[] = ['mapped', 'unmapped-mandatory', 'orphaned', 'error'];

/** Whether a value read from browser state is a status filter. */
export function isStatusFilter(value: unknown): value is StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter);
}

/**
 * The status of every target field that has one, by field path (spec #104, "Status derivation"). Mapped and orphaned
 * come from the working copy: a target field mapping makes its field mapped, and orphaned when one of its source-field
 * boxes reads a field that `source` lacks; while `source` is not loaded, no box counts as orphaned. Unmapped mandatory
 * and error come from `diagnostics`, the last compile's: `unmapped-mandatory-leaf` at a field makes it unmapped
 * mandatory, and any other error at it makes it error. A diagnostic is at a field when its location is the field's
 * target field mapping or one of its boxes by authoring id, a pointer to that member of `targetFieldMappings` or into
 * it, or the field path on the target side. A field with several statuses has the most urgent: error, then orphaned,
 * then unmapped mandatory, then mapped.
 */
export function fieldStatuses(
  model: MappingModel,
  diagnostics: readonly Diagnostic[],
  source: StructureLoaded | undefined,
): Map<FieldPath, FieldStatus> {
  const statuses = new Map<FieldPath, FieldStatus>();
  const raise = (path: FieldPath, status: FieldStatus) => {
    const current = statuses.get(path);
    if (current === undefined || PRECEDENCE.indexOf(status) > PRECEDENCE.indexOf(current)) statuses.set(path, status);
  };

  const owner = new Map<string, FieldPath>();
  const orphans = orphanedBoxes(model, source);
  for (const [path, mapping] of Object.entries(model.targetFieldMappings ?? {})) {
    owner.set(mapping.id, path);
    let orphaned = false;
    for (const id of Object.keys(mapping.boxes)) {
      owner.set(id, path);
      if (orphans.has(id)) orphaned = true;
    }
    raise(path, orphaned ? 'orphaned' : 'mapped');
  }

  for (const diagnostic of diagnostics) {
    const path = targetFieldOf(diagnostic.location, owner);
    if (path === undefined) continue;
    if (diagnostic.code === UNMAPPED_MANDATORY_LEAF) raise(path, 'unmapped-mandatory');
    else if (diagnostic.severity === 'error') raise(path, 'error');
  }
  return statuses;
}

/** The target field a diagnostic's location names, by `owner` for an authoring id; `undefined` for any other. */
function targetFieldOf(location: Diagnostic['location'], owner: ReadonlyMap<string, FieldPath>): FieldPath | undefined {
  switch (location.kind) {
    case 'authoring-id':
      return owner.get(location.authoringId);
    case 'pointer': {
      // RFC 6901 (ADR-0015): `/targetFieldMappings/<field path>` and below
      const [first, member, field] = location.pointer.split('/');
      if (first !== '' || member !== 'targetFieldMappings' || field === undefined) return undefined;
      return field.replaceAll('~1', '/').replaceAll('~0', '~');
    }
    case 'field-path':
      return location.side === 'target' ? location.fieldPath : undefined;
    case 'file-position':
      return undefined;
  }
}

/**
 * The orphaned source-field boxes (GLOSSARY: Orphaned reference): the authoring ids of the source-field boxes, in any
 * target field mapping, that read a field `source` lacks; none while `source` is not loaded.
 */
export function orphanedBoxes(model: MappingModel, source: StructureLoaded | undefined): Set<AuthoringId> {
  const orphans = new Set<AuthoringId>();
  if (source === undefined) return orphans;
  const sourceField = fieldLookup(source);
  for (const mapping of Object.values(model.targetFieldMappings ?? {})) {
    for (const [id, box] of Object.entries(mapping.boxes)) {
      if (box.kind === 'source' && sourceField(box.field) === undefined) orphans.add(id);
    }
  }
  return orphans;
}

/**
 * The orphaned target field mappings (GLOSSARY): the field paths of the target field mappings that `target` lacks, in
 * the model's order. They have no row in the target tree.
 */
export function orphanedMappings(model: MappingModel, target: StructureLoaded): FieldPath[] {
  const targetField = fieldLookup(target);
  return Object.keys(model.targetFieldMappings ?? {}).filter((path) => targetField(path) === undefined);
}

/**
 * The target rows under a status filter (ADR-0012): every row of status `filter` and each of its ancestors, in tree
 * order, whatever is expanded. An ancestor is shown expanded; a row of that status with no such row below it is shown
 * collapsed. A field path the structure lacks shows no row, nor any ancestor for it. Each row carries the refusal
 * nearest the root on its path in the `side` tree, as `treeRows` gives it (ADR-0027).
 */
export function filteredRows(
  structure: StructureLoaded,
  statuses: ReadonlyMap<FieldPath, FieldStatus>,
  filter: FieldStatus,
  side: 'source' | 'target',
): TreeRow[] {
  const matches = new Set<FieldPath>();
  const ancestors = new Set<FieldPath>();
  for (const [path, status] of statuses) {
    if (status !== filter) continue;
    matches.add(path);
    const steps = fieldPathSteps(path);
    for (let i = 1; i < steps.length; i++) ancestors.add(`/${steps.slice(0, i).join('/')}`);
  }
  // only the branches down to a match are walked, so a recursive type ends (ADR-0008)
  const visit = (field: FieldDto, path: string, depth: number, above: FieldRefusal | undefined): TreeRow[] => {
    const refusal = rowRefusal(field, side, above);
    const children = field.type !== undefined && ancestors.has(path) ? (structure.types[field.type] ?? []) : [];
    const below = children.flatMap((child) => visit(child, `${path}/${child.step}`, depth + 1, refusal));
    if (below.length === 0 && !matches.has(path)) return [];
    const row = { path, depth, field, expandable: field.type !== undefined, expanded: below.length > 0, ...(refusal && { refusal }) };
    return [row, ...below];
  };
  return visit(structure.root, `/${structure.root.step}`, 0, undefined);
}

/** The links a status filter keeps: all of them under `all`, else those whose target field has that status. */
export function filteredLinks<L extends { target: FieldPath }>(
  links: readonly L[],
  statuses: ReadonlyMap<FieldPath, FieldStatus>,
  filter: StatusFilter,
): L[] {
  return filter === 'all' ? [...links] : links.filter((link) => statuses.get(link.target) === filter);
}

/** Finds a field of a structure by its field path, each type's children indexed by step once per lookup. */
function fieldLookup(structure: StructureLoaded): (path: FieldPath) => FieldDto | undefined {
  const children = new Map<string, Map<string, FieldDto>>();
  const child = (type: string, step: string) => {
    let byStep = children.get(type);
    if (byStep === undefined) {
      byStep = new Map((structure.types[type] ?? []).map((c) => [c.step, c]));
      children.set(type, byStep);
    }
    return byStep.get(step);
  };
  return (path) => {
    const steps = fieldPathSteps(path);
    if (steps[0] !== structure.root.step) return undefined;
    let field: FieldDto | undefined = structure.root;
    for (const step of steps.slice(1)) {
      field = field.type === undefined ? undefined : child(field.type, step);
      if (field === undefined) return undefined;
    }
    return field;
  };
}
