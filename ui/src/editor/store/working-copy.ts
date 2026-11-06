import { createStore } from 'zustand/vanilla';
import { isSaveConflict, type StoredMapping } from '../../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';
import type { CommandResult, Refusal } from '../../model/command';
import { deleteBox } from '../../model/delete-box';
import { insertBox } from '../../model/insert-box';
import { link } from '../../model/link';
import { sameModel } from '../../model/same-model';
import { setResult, unwire, wire } from '../../model/wire';

/** How many edits undo keeps (ADR-0013: at least 100); an older one is dropped. */
export const UNDO_DEPTH = 100;

/** The ports of one open mapping's store. */
export interface WorkingCopyPorts {
  /** Draws a fresh authoring id. */
  newId: () => AuthoringId;
  /** Saves a model on condition of the ETag and resolves to what the service wrote (ADR-0013, ADR-0027). */
  save: (model: MappingModel, etag: string) => Promise<StoredMapping>;
  /** Reads the mapping file from disk. */
  load: () => Promise<StoredMapping>;
}

export interface WorkingCopyState {
  /** The last canonical model the service returned. */
  baseline: MappingModel;
  /** The baseline's ETag, sent as `If-Match` on save. */
  etag: string;
  /** The model as the author is editing it. */
  workingCopy: MappingModel;
  /** The working copies before each edit, oldest first, at most `UNDO_DEPTH`. */
  past: readonly MappingModel[];
  /** The working copies undo stepped back from, the next redo first. */
  future: readonly MappingModel[];
  /** The selected box or target field mapping, by authoring id; selecting is no undo step. */
  selection: AuthoringId | null;
  /** Why the last command was refused; `null` once a command applies. */
  refusal: Refusal | null;
  /** A save answered that the file changed on disk: the author chooses Reload or Keep editing (ADR-0027). */
  conflict: boolean;
  /** Links a source field to a target field (the link command in `model/`). */
  link: (sourceField: FieldPath, targetField: FieldPath) => void;
  /** Inserts a box of standard function `fn` into the target field's mapping, with fresh ids. */
  insertBox: (targetField: FieldPath, fn: string) => void;
  /** Wires box `source`'s output into input slot `slot` of box `target`. */
  wire: (targetField: FieldPath, source: AuthoringId, target: AuthoringId, slot: number) => void;
  /** Removes the wire into input slot `slot` of box `target`. */
  unwire: (targetField: FieldPath, target: AuthoringId, slot: number) => void;
  /** Connects a box to the target field's sink, or disconnects it with `null`. */
  setResult: (targetField: FieldPath, box: AuthoringId | null) => void;
  /** Deletes a box; the selection is cleared when it was that box. */
  deleteBox: (box: AuthoringId) => void;
  undo: () => void;
  redo: () => void;
  select: (selection: AuthoringId | null) => void;
  /**
   * Sends the working copy with the baseline's ETag; what the service wrote becomes the baseline, and the history
   * stays. A save conflict opens `conflict`; any other error rejects.
   */
  save: () => Promise<void>;
  /** Drops the working copy and its history and loads the file from disk as the baseline. Rejects with the port's error. */
  reload: () => Promise<void>;
  /** Closes a save conflict and keeps the working copy. */
  keepEditing: () => void;
}

export type WorkingCopyStore = ReturnType<typeof createWorkingCopyStore>;

/** Whether the working copy has changes the baseline lacks. */
export const selectUnsaved = (state: WorkingCopyState): boolean => !sameModel(state.workingCopy, state.baseline);

/** One store per open mapping (ADR-0013). Its actions only call the pure commands of `model/`. */
export function createWorkingCopyStore(opened: StoredMapping, ports: WorkingCopyPorts) {
  return createStore<WorkingCopyState>()((set, get) => {
    /**
     * A command's result: an applied command is one undo step and redo is gone, unless it changed nothing; a refused
     * one leaves the working copy and records why. Returns whether it applied.
     */
    const apply = (result: CommandResult): boolean => {
      if (result.kind === 'refused') {
        set({ refusal: { code: result.code, id: result.id } });
        return false;
      }
      set((state) =>
        result.model === state.workingCopy
          ? { refusal: null }
          : {
              workingCopy: result.model,
              refusal: null,
              past: [...state.past, state.workingCopy].slice(-UNDO_DEPTH),
              future: [],
            },
      );
      return true;
    };

    return {
      baseline: opened.model,
      etag: opened.etag,
      workingCopy: opened.model,
      past: [],
      future: [],
      selection: null,
      refusal: null,
      conflict: false,

      link: (sourceField, targetField) =>
        void apply(link(get().workingCopy, { sourceField, targetField, boxId: ports.newId(), mappingId: ports.newId() })),

      insertBox: (targetField, fn) =>
        void apply(
          insertBox(get().workingCopy, { targetField, box: { kind: 'function', fn }, boxId: ports.newId(), mappingId: ports.newId() }),
        ),

      wire: (targetField, source, target, slot) => void apply(wire(get().workingCopy, { targetField, source, target, slot })),

      unwire: (targetField, target, slot) => void apply(unwire(get().workingCopy, { targetField, target, slot })),

      setResult: (targetField, box) => void apply(setResult(get().workingCopy, { targetField, box })),

      deleteBox: (box) => {
        if (apply(deleteBox(get().workingCopy, { box })) && get().selection === box) set({ selection: null });
      },

      undo: () =>
        set((state) =>
          state.past.length === 0
            ? {}
            : { workingCopy: state.past.at(-1), past: state.past.slice(0, -1), future: [state.workingCopy, ...state.future] },
        ),

      redo: () =>
        set((state) =>
          state.future.length === 0
            ? {}
            : { workingCopy: state.future[0], future: state.future.slice(1), past: [...state.past, state.workingCopy] },
        ),

      select: (selection) => set({ selection }),

      save: async () => {
        const sent = get().workingCopy;
        let stored: StoredMapping;
        try {
          stored = await ports.save(sent, get().etag);
        } catch (error) {
          if (!isSaveConflict(error)) throw error;
          set({ conflict: true });
          return;
        }
        // An edit made while the save was under way stays in the working copy.
        set((state) => ({
          baseline: stored.model,
          etag: stored.etag,
          workingCopy: state.workingCopy === sent ? stored.model : state.workingCopy,
        }));
      },

      reload: async () => {
        const stored = await ports.load();
        set({
          baseline: stored.model,
          etag: stored.etag,
          workingCopy: stored.model,
          past: [],
          future: [],
          selection: null,
          conflict: false,
        });
      },

      keepEditing: () => set({ conflict: false }),
    };
  });
}

/** Tells `listener` each time the working copy starts or stops differing from the baseline; returns the unsubscribe. */
export function watchUnsaved(store: WorkingCopyStore, listener: (unsaved: boolean) => void): () => void {
  return store.subscribe((state, previous) => {
    const unsaved = selectUnsaved(state);
    if (unsaved !== selectUnsaved(previous)) listener(unsaved);
  });
}
