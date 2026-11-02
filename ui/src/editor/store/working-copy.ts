import { createStore } from 'zustand/vanilla';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';
import { link, type Refusal } from '../../model/link';
import { sameModel } from '../../model/same-model';

/** The ports of one open mapping's store. */
export interface WorkingCopyPorts {
  /** Draws a fresh authoring id. */
  newId: () => AuthoringId;
  /** Saves a model and resolves to the canonical model the service wrote (ADR-0013, ADR-0015). */
  save: (model: MappingModel) => Promise<MappingModel>;
}

export interface WorkingCopyState {
  /** The last canonical model the service returned. */
  baseline: MappingModel;
  /** The model as the author is editing it. */
  workingCopy: MappingModel;
  /** Why the last command was refused; `null` once a command applies. */
  refusal: Refusal | null;
  /** Links a source field to a target field (the link command in `model/`). */
  link: (sourceField: FieldPath, targetField: FieldPath) => void;
  /** Sends the working copy; the canonical response becomes the baseline. Rejects with the port's error. */
  save: () => Promise<void>;
}

export type WorkingCopyStore = ReturnType<typeof createWorkingCopyStore>;

/** Whether the working copy has changes the baseline lacks. */
export const selectUnsaved = (state: WorkingCopyState): boolean => !sameModel(state.workingCopy, state.baseline);

/** One store per open mapping (ADR-0013). Its actions only call the pure commands of `model/`. */
export function createWorkingCopyStore(baseline: MappingModel, ports: WorkingCopyPorts) {
  return createStore<WorkingCopyState>()((set, get) => ({
    baseline,
    workingCopy: baseline,
    refusal: null,

    link: (sourceField, targetField) => {
      const result = link(get().workingCopy, { sourceField, targetField, boxId: ports.newId(), mappingId: ports.newId() });
      if (result.kind === 'applied') set({ workingCopy: result.model, refusal: null });
      else set({ refusal: { code: result.code, id: result.id } });
    },

    save: async () => {
      const sent = get().workingCopy;
      const canonical = await ports.save(sent);
      // An edit made while the save was under way stays in the working copy.
      set((state) => ({ baseline: canonical, workingCopy: state.workingCopy === sent ? canonical : state.workingCopy }));
    },
  }));
}
