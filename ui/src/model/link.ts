import { produce } from 'immer';
import type { AuthoringId, FieldPath, MappingModel, TargetFieldMappings } from '../generated/mapping-model';

/** Drop a source field on a target field (ADR-0012, "Field links"). */
export interface LinkCommand {
  sourceField: FieldPath;
  targetField: FieldPath;
  /** The id of the new source-field box. */
  boxId: AuthoringId;
  /** The id of the new target field mapping; used only when the target field has none. */
  mappingId: AuthoringId;
}

/** Why a command was refused, by the model check's codes (ADR-0011, ADR-0013). */
export interface Refusal {
  code: 'duplicate-authoring-id' | 'cross-target-field-reference';
  id: AuthoringId;
}

export type CommandResult = { kind: 'applied'; model: MappingModel } | ({ kind: 'refused' } & Refusal);

/**
 * Adds a source-field box reading `sourceField` to the target field mapping of `targetField`, creating that mapping
 * when the target field has none. The box becomes the mapping's `result` when `result` is `null` or the mapping is
 * new; a mapping that already has a result keeps it, and the new box is an unreachable box.
 *
 * Ids share one space across the mapping (ADR-0010). The command refuses:
 * - `cross-target-field-reference` when `boxId` names a box of another target field mapping;
 * - `duplicate-authoring-id` when any other id it would add is already used, or the two new ids are equal.
 */
export function link(model: MappingModel, command: LinkCommand): CommandResult {
  const mappings: TargetFieldMappings = model.targetFieldMappings ?? {};
  const existing = mappings[command.targetField];
  const refusal = refuse(mappings, command, existing === undefined);
  if (refusal) return { kind: 'refused', ...refusal };

  const next = produce(model, (draft) => {
    const all = (draft.targetFieldMappings ??= {});
    const mapping = (all[command.targetField] ??= { id: command.mappingId, result: null, boxes: {} });
    mapping.boxes[command.boxId] = { kind: 'source', field: command.sourceField };
    mapping.result ??= command.boxId;
  });
  return { kind: 'applied', model: next };
}

function refuse(mappings: TargetFieldMappings, command: LinkCommand, newMapping: boolean): Refusal | undefined {
  const used = new Set<AuthoringId>();
  for (const [target, mapping] of Object.entries(mappings)) {
    used.add(mapping.id);
    for (const box of Object.keys(mapping.boxes)) {
      if (box === command.boxId && target !== command.targetField) {
        return { code: 'cross-target-field-reference', id: box };
      }
      used.add(box);
    }
  }
  if (used.has(command.boxId)) return { code: 'duplicate-authoring-id', id: command.boxId };
  if (newMapping && (used.has(command.mappingId) || command.mappingId === command.boxId)) {
    return { code: 'duplicate-authoring-id', id: command.mappingId };
  }
  return undefined;
}
