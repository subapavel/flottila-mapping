import { createStore } from 'zustand/vanilla';
import { ApiProblem, describeError, type Diagnostic } from '../../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../../generated/mapping-model';
import { link, type Refusal } from '../../model/link';
import { sameModel } from '../../model/same-model';

/** How long after the last edit the working copy is compiled (ADR-0013). */
export const COMPILE_DELAY_MS = 500;

/** The ports of one open mapping's store. */
export interface WorkingCopyPorts {
  /** Draws a fresh authoring id. */
  newId: () => AuthoringId;
  /** Saves a model and resolves to the canonical model the service wrote (ADR-0013, ADR-0015). */
  save: (model: MappingModel) => Promise<MappingModel>;
  /** Compiles a model and resolves to its diagnostics (ADR-0015, ADR-0027); `signal` aborts the call. */
  compile: (model: MappingModel, signal: AbortSignal) => Promise<Diagnostic[]>;
}

export interface WorkingCopyState {
  /** The last canonical model the service returned. */
  baseline: MappingModel;
  /** The model as the author is editing it. */
  workingCopy: MappingModel;
  /** Why the last command was refused; `null` once a command applies. */
  refusal: Refusal | null;
  /** The latest diagnostics of the working copy: the last compile's, or a refused save's until the next compile. */
  diagnostics: Diagnostic[];
  /** The title of the transport error the last compile failed with; `null` once a compile answers. */
  compileFailure: string | null;
  /** Links a source field to a target field (the link command in `model/`). */
  link: (sourceField: FieldPath, targetField: FieldPath) => void;
  /**
   * Sends the working copy; the canonical response becomes the baseline. Rejects with the port's error; a refusal
   * with diagnostics (422 `model-refused`) replaces the diagnostics first.
   */
  save: () => Promise<void>;
  /**
   * Compiles the working copy `COMPILE_DELAY_MS` from now, cancelling a compile already scheduled or under way. Every
   * change of the working copy calls it.
   */
  scheduleCompile: () => void;
  /** Cancels a compile scheduled or under way; its answer is dropped. */
  cancelCompile: () => void;
}

export type WorkingCopyStore = ReturnType<typeof createWorkingCopyStore>;

/** Whether the working copy has changes the baseline lacks. */
export const selectUnsaved = (state: WorkingCopyState): boolean => !sameModel(state.workingCopy, state.baseline);

/** One store per open mapping (ADR-0013). Its actions only call the pure commands of `model/`. */
export function createWorkingCopyStore(baseline: MappingModel, ports: WorkingCopyPorts) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: AbortController | undefined;
  /** Counts the compiles scheduled and cancelled: only the answer of the current one is kept. */
  let generation = 0;

  const cancel = () => {
    generation++;
    clearTimeout(timer);
    running?.abort();
  };

  const store = createStore<WorkingCopyState>()((set, get) => ({
    baseline,
    workingCopy: baseline,
    refusal: null,
    diagnostics: [],
    compileFailure: null,

    link: (sourceField, targetField) => {
      const result = link(get().workingCopy, { sourceField, targetField, boxId: ports.newId(), mappingId: ports.newId() });
      if (result.kind === 'applied') set({ workingCopy: result.model, refusal: null });
      else set({ refusal: { code: result.code, id: result.id } });
    },

    save: async () => {
      const sent = get().workingCopy;
      let canonical: MappingModel;
      try {
        canonical = await ports.save(sent);
      } catch (error) {
        if (error instanceof ApiProblem && 'diagnostics' in error.problem) set({ diagnostics: error.problem.diagnostics });
        throw error;
      }
      // An edit made while the save was under way stays in the working copy.
      set((state) => ({ baseline: canonical, workingCopy: state.workingCopy === sent ? canonical : state.workingCopy }));
    },

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
  }));

  store.subscribe((state, previous) => {
    if (state.workingCopy !== previous.workingCopy) state.scheduleCompile();
  });
  return store;
}
