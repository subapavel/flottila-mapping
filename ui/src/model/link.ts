import type { AuthoringId, FieldPath, MappingModel } from '../generated/mapping-model';
import type { CommandResult } from './command';
import { insertBox } from './insert-box';

/** Drop a source field on a target field (ADR-0012, "Field links"). */
export interface LinkCommand {
  sourceField: FieldPath;
  targetField: FieldPath;
  /** The id of the new source-field box. */
  boxId: AuthoringId;
  /** The id of the new target field mapping; used only when the target field has none. */
  mappingId: AuthoringId;
}

/**
 * Adds a source-field box reading `sourceField` to the target field mapping of `targetField`: the insert box command
 * with a source-field box, so the same rules for `result` and the same refusals hold.
 */
export function link(model: MappingModel, command: LinkCommand): CommandResult {
  const { sourceField, ...ids } = command;
  return insertBox(model, { ...ids, box: { kind: 'source', field: sourceField } });
}
