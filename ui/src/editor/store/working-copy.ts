import { createStore } from 'zustand/vanilla';
import { ApiProblem, describeError, isSaveConflict, type Diagnostic, type StoredMapping } from '../../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';
import { link, type Refusal } from '../../model/link';
import { sameModel } from '../../model/same-model';

/** How many edits undo keeps (ADR-0013: at least 100); an older one is dropped. */
export const UNDO_DEPTH = 100;

/** How long after the last edit the working copy is compiled (ADR-0013). */
export const COMPILE_DELAY_MS = 500;

/** The ports of one open mapping's store. */
export interface WorkingCopyPorts {
  /** Draws a fresh authoring id. */
  newId: () => AuthoringId;
  /** Saves a model on condition of the ETag and resolves to what the service wrote (ADR-0013, ADR-0027). */
  save: (model: MappingModel, etag: string) => Promise<StoredMapping>;
  /** Reads the mapping file from disk. */
  load: () => Promise<StoredMapping>;
  /** Compiles a model and resolves to its diagnostics (ADR-0015, ADR-0027); `signal` aborts the call. */
  compile: (model: MappingModel, signal: AbortSignal) => Promise<Diagnostic[]>;
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
  /** The latest diagnostics of the working copy: the last compile's, or a refused save's until the next compile. */
  diagnostics: Diagnostic[];
  /** The title of the transport error the last compile failed with; `null` once a compile answers. */
  compileFailure: string | null;
  /** Links a source field to a target field (the link command in `model/`). */
  link: (sourceField: FieldPath, targetField: FieldPath) => void;
  undo: () => void;
  redo: () => void;
  select: (selection: AuthoringId | null) => void;
  /**
   * Sends the working copy with the baseline's ETag; what the service wrote becomes the baseline, and the history
   * stays. A save conflict opens `conflict`; any other error rejects, and a refusal with diagnostics (422
   * `model-refused`) replaces the diagnostics first.
   */
  save: () => Promise<void>;
  /** Drops the working copy and its history and loads the file from disk as the baseline. Rejects with the port's error. */
  reload: () => Promise<void>;
  /** Closes a save conflict and keeps the working copy. */
  keepEditing: () => void;
  /**
   * Compiles the working copy `COMPILE_DELAY_MS` from now, cancelling a compile already scheduled or under way. Every
   * change of the working copy calls it: an edit, undo, redo, a save's canonical model and a reload.
   */
  scheduleCompile: () => void;
  /** Cancels a compile scheduled or under way; its answer is dropped. */
  cancelCompile: () => void;
}

export type WorkingCopyStore = ReturnType<typeof createWorkingCopyStore>;

/** Whether the working copy has changes the baseline lacks. */
export const selectUnsaved = (state: WorkingCopyState): boolean => !sameModel(state.workingCopy, state.baseline);

/** One store per open mapping (ADR-0013). Its actions only call the pure commands of `model/`. */
export function createWorkingCopyStore(opened: StoredMapping, ports: WorkingCopyPorts) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: AbortController | undefined;
  /** Counts the compiles scheduled and cancelled: only the answer of the current one is kept. */
  let generation = 0;

  const cancel = () => {
    generation++;
    clearTimeout(timer);
    running?.abort();
  };

  const store = createStore<WorkingCopyState>()((set, get) => {
    /** An edit: one undo step, and redo is gone. */
    const edit = (model: MappingModel) =>
      set((state) => ({
        workingCopy: model,
        refusal: null,
        past: [...state.past, state.workingCopy].slice(-UNDO_DEPTH),
        future: [],
      }));

    return {
      baseline: opened.model,
      etag: opened.etag,
      workingCopy: opened.model,
      past: [],
      future: [],
      selection: null,
      refusal: null,
      conflict: false,
      diagnostics: [],
      compileFailure: null,

      link: (sourceField, targetField) => {
        const result = link(get().workingCopy, { sourceField, targetField, boxId: ports.newId(), mappingId: ports.newId() });
        if (result.kind === 'applied') edit(result.model);
        else set({ refusal: { code: result.code, id: result.id } });
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
          if (isSaveConflict(error)) {
            set({ conflict: true });
            return;
          }
          if (error instanceof ApiProblem && 'diagnostics' in error.problem) set({ diagnostics: error.problem.diagnostics });
          throw error;
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

      scheduleCompile: () => {
        cancel();
        const current = generation;
        timer = setTimeout(() => {
          running = new AbortController();
          ports.compile(get().workingCopy, running.signal).then(
            (diagnostics) => {
              if (current === generation) set({ diagnostics, compileFailure: null });
            },
            (error: unknown) => {
              if (current === generation) set({ compileFailure: describeError(error).title });
            },
          );
        }, COMPILE_DELAY_MS);
      },

      cancelCompile: cancel,
    };
  });

  store.subscribe((state, previous) => {
    if (state.workingCopy !== previous.workingCopy) state.scheduleCompile();
  });
  return store;
}

/** Tells `listener` each time the working copy starts or stops differing from the baseline; returns the unsubscribe. */
export function watchUnsaved(store: WorkingCopyStore, listener: (unsaved: boolean) => void): () => void {
  return store.subscribe((state, previous) => {
    const unsaved = selectUnsaved(state);
    if (unsaved !== selectUnsaved(previous)) listener(unsaved);
  });
}
