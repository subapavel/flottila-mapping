import type { FieldDto, StructureLoaded } from '../../api/client';
import type { FieldPath } from '../../generated/mapping-model';
import { stepName } from '../../model/field-path';

/** A field the remap picker offers: its field path, and the path of its local names to show. */
export interface RemapChoice {
  path: FieldPath;
  label: string;
}

/**
 * The fields of the source structure a source-field box can be remapped to, in tree order. Below a field whose type
 * is already on its path nothing is offered, so that a recursive type (ADR-0008) ends.
 */
export function remapChoices(structure: StructureLoaded): RemapChoice[] {
  const choices: RemapChoice[] = [];
  const visit = (field: FieldDto, path: FieldPath, label: string, types: ReadonlySet<string>) => {
    choices.push({ path, label });
    if (field.type === undefined || types.has(field.type)) return;
    const below = new Set(types).add(field.type);
    for (const child of structure.types[field.type] ?? []) {
      visit(child, `${path}/${child.step}`, `${label}/${stepName(child.step)}`, below);
    }
  };
  visit(structure.root, `/${structure.root.step}`, `/${stepName(structure.root.step)}`, new Set());
  return choices;
}
