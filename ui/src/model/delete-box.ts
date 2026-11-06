import { produce } from 'immer';
import type { AuthoringId, MappingModel } from '../generated/mapping-model';
import { applied, refused, type CommandResult } from './command';

/** Removes a box, wherever it is. */
export interface DeleteBoxCommand {
  box: AuthoringId;
}

/**
 * Removes the box and leaves no dangling id (ADR-0013): every input of its target field mapping that read it becomes
 * `null`, and so does `result` if it was the result. A mapping left without boxes is removed (its `result` is then
 * `null`: it named the deleted box or nothing), and `targetFieldMappings` with it when no mapping is left, as the
 * canonical writer leaves an empty member out. Refuses an id that names no box as `unknown-box-reference`.
 */
export function deleteBox(model: MappingModel, command: DeleteBoxCommand): CommandResult {
  const { box } = command;
  const field = Object.keys(model.targetFieldMappings ?? {}).find((f) => Object.hasOwn(model.targetFieldMappings![f]!.boxes, box));
  if (field === undefined) return refused('unknown-box-reference', box);

  return applied(
    produce(model, (draft) => {
      const all = draft.targetFieldMappings!;
      const mapping = all[field]!;
      delete mapping.boxes[box];
      for (const other of Object.values(mapping.boxes)) {
        if (other.kind === 'source' || !other.inputs) continue;
        other.inputs = other.inputs.map((input) => (input === box ? null : input));
      }
      if (mapping.result === box) mapping.result = null;
      if (Object.keys(mapping.boxes).length === 0) delete all[field];
      if (Object.keys(all).length === 0) delete draft.targetFieldMappings;
    }),
  );
}
