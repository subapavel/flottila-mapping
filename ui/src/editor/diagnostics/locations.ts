import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';

/**
 * The target field of the target field mapping that `id` names, itself or one of its boxes; `undefined` when the
 * working copy has no such authoring element (any more).
 */
export function targetFieldOf(model: MappingModel, id: AuthoringId): FieldPath | undefined {
  return Object.entries(model.targetFieldMappings ?? {}).find(([, mapping]) => mapping.id === id || id in mapping.boxes)?.[0];
}

/**
 * The target field whose member of `targetFieldMappings` a JSON pointer names or points into (RFC 6901, ADR-0015):
 * `/targetFieldMappings/<field path>` and below; `undefined` for any other pointer.
 */
export function targetFieldAt(pointer: string): FieldPath | undefined {
  const [first, member, field] = pointer.split('/');
  if (first !== '' || member !== 'targetFieldMappings' || field === undefined) return undefined;
  return field.replaceAll('~1', '/').replaceAll('~0', '~');
}
