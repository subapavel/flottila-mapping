import type { AuthoringId, BoxReference, FieldPath, MappingModel, TargetFieldMapping } from '../generated/mapping-model';

/** Why a command was refused, by the model check's codes (ADR-0011, ADR-0013). */
export interface Refusal {
  code:
    | 'duplicate-authoring-id'
    | 'cross-target-field-reference'
    | 'unknown-box-reference'
    | 'box-cycle'
    | 'wrong-arity'
    | 'context-not-ancestor'
    | 'unknown-parameter'
    | 'wrong-parameter-type'
    | 'invalid-parameter-value';
  id: AuthoringId;
}

/** A command's answer: the next model, or why the model stays as it was. */
export type CommandResult = { kind: 'applied'; model: MappingModel } | ({ kind: 'refused' } & Refusal);

export const applied = (model: MappingModel): CommandResult => ({ kind: 'applied', model });

export const refused = (code: Refusal['code'], id: AuthoringId): CommandResult => ({ kind: 'refused', code, id });

/** What the editor tells the author about a refusal. */
export function describeRefusal({ code, id }: Refusal): string {
  switch (code) {
    case 'box-cycle':
      return `The wire would close a cycle: box ${id} already feeds the box it would read.`;
    case 'cross-target-field-reference':
      return `Box ${id} belongs to another target field mapping.`;
    case 'duplicate-authoring-id':
      return `The id ${id} is already used.`;
    case 'unknown-box-reference':
      return `There is no box ${id}.`;
    case 'wrong-arity':
      return `Box ${id} has no input slot there.`;
    case 'context-not-ancestor':
      return `That context is not a proper ancestor of the field box ${id} reads.`;
    case 'unknown-parameter':
      return `Box ${id} has no such parameter to set.`;
    case 'wrong-parameter-type':
      return `That value has the wrong type for the parameter of box ${id}.`;
    case 'invalid-parameter-value':
      return `That value is not one the parameter of box ${id} takes.`;
  }
}

/**
 * Refuses a reference from the target field mapping of `targetField` to box `id` unless that mapping has the box:
 * `cross-target-field-reference` when another mapping has it, else `unknown-box-reference`.
 */
export function refuseReference(model: MappingModel, targetField: FieldPath, id: AuthoringId): CommandResult | undefined {
  if (Object.hasOwn(model.targetFieldMappings?.[targetField]?.boxes ?? {}, id)) return undefined;
  const elsewhere = Object.values(model.targetFieldMappings ?? {}).some((mapping) => Object.hasOwn(mapping.boxes, id));
  return refused(elsewhere ? 'cross-target-field-reference' : 'unknown-box-reference', id);
}

/** The input slots of a box of `mapping`; a source-field box has none. */
export function inputsOf(mapping: TargetFieldMapping, id: AuthoringId): BoxReference[] {
  const box = mapping.boxes[id]!;
  return box.kind === 'source' ? [] : (box.inputs ?? []);
}
