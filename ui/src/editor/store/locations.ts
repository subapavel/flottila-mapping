import type { Diagnostic } from '../../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';

/** Where an authoring id is: the target field whose mapping has it, and the box when it is a box's id. */
export function locate(model: MappingModel, id: AuthoringId): { field: FieldPath; box: AuthoringId | null } | undefined {
  for (const [field, mapping] of Object.entries(model.targetFieldMappings ?? {})) {
    if (mapping.id === id) return { field, box: null };
    if (Object.hasOwn(mapping.boxes, id)) return { field, box: id };
  }
  return undefined;
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

/**
 * The target field a diagnostic's location leads to (ADR-0015): for an authoring id, the target field `ownerOf` gives
 * it, the field of the target field mapping that is or has that element; for a pointer, `targetFieldAt`; for a field
 * path, the path when it is on the target side. `undefined` for a source field path, a file position, and an id or
 * pointer that leads to no target field.
 */
export function targetFieldOf(
  location: Diagnostic['location'],
  ownerOf: (id: AuthoringId) => FieldPath | undefined,
): FieldPath | undefined {
  switch (location.kind) {
    case 'authoring-id':
      return ownerOf(location.authoringId);
    case 'pointer':
      return targetFieldAt(location.pointer);
    case 'field-path':
      return location.side === 'target' ? location.fieldPath : undefined;
    case 'file-position':
      return undefined;
  }
}
