import type { FieldDto, StructureLoaded } from '../../api/client';
import type { FieldPath, MappingModel } from '../../generated/mapping-model';
import { fieldPathSteps } from '../../model/field-path';

/** A field found in its structure, and its place in tree order: its child index at each step below the root. */
export interface Placed {
  field: FieldDto;
  position: number[];
}

/**
 * The field at `path` in `structure`, with its place in tree order; `undefined` when the structure has no such field.
 * A step is matched against its first same-step sibling, as `refusalAt` does.
 */
export function placed(structure: StructureLoaded, path: FieldPath): Placed | undefined {
  const steps = fieldPathSteps(path);
  if (steps[0] !== structure.root.step) return undefined;
  let field = structure.root;
  const position: number[] = [];
  for (const step of steps.slice(1)) {
    const children = field.type === undefined ? [] : (structure.types[field.type] ?? []);
    const index = children.findIndex((child) => child.step === step);
    if (index < 0) return undefined;
    position.push(index);
    field = children[index]!;
  }
  return { field, position };
}

/**
 * The target field a mapping opens on (spec #145, "Opening selection"): `kept`, the one kept in browser state, when
 * `target` has it; otherwise the first mapped target field in tree order. `undefined` when `target` has none of the
 * fields the target field mappings write.
 */
export function openingField(target: StructureLoaded, model: MappingModel, kept: unknown): FieldPath | undefined {
  if (typeof kept === 'string' && placed(target, kept) !== undefined) return kept;
  let first: { path: FieldPath; position: number[] } | undefined;
  for (const path of Object.keys(model.targetFieldMappings ?? {})) {
    const at = placed(target, path);
    if (at !== undefined && (first === undefined || before(at.position, first.position))) first = { path, position: at.position };
  }
  return first?.path;
}

/** Whether place `a` comes before place `b` in tree order: at the first step where they differ, or as its ancestor. */
function before(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    // b is an ancestor of a
    if (i === b.length) return false;
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  // a is an ancestor of b: two mapped paths never share a place
  return true;
}
