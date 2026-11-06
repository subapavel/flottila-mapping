import { createStore } from 'zustand/vanilla';
import {
  ApiProblem,
  describeError,
  isSaveConflict,
  type Diagnostic,
  type FunctionCatalogue,
  type RefreshResponse,
  type StoredMapping,
  type TestResult,
  type TraceEntry,
} from '../../api/client';
import type { AuthoringId, Box, FieldPath, MappingModel, ParamValue } from '../../generated/mapping-model';
import { applied, refusalOf, type CommandResult, type FieldRefusal, type Refusal } from '../../model/command';
import { deleteBoxes } from '../../model/delete-box';
import { deleteTargetFieldMapping } from '../../model/delete-target-field-mapping';
import { insertBox } from '../../model/insert-box';
import { link } from '../../model/link';
import { paste } from '../../model/paste';
import { remap } from '../../model/remap';
import { sameModel } from '../../model/same-model';
import { setContext } from '../../model/set-context';
import { setInput } from '../../model/set-input';
import { setParam } from '../../model/set-param';
import { setResult, unwire, wire } from '../../model/wire';

/** How many edits undo keeps (ADR-0013: at least 100); an older one is dropped. */
export const UNDO_DEPTH = 100;

/** How long after the last edit the working copy is compiled (ADR-0013). */
export const COMPILE_DELAY_MS = 500;

/** The code of a field path the structure no longer has (GLOSSARY: Orphaned reference). */
const ORPHANED_REFERENCE = 'orphaned-reference';

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
  /** The selected box or target field mapping, by authoring id, the last selected of several; selecting is no undo step. */
  selection: AuthoringId | null;
  /** Every selected id, `selection` last: several boxes of one canvas are selected together for copy. */
  selected: readonly AuthoringId[];
  /** The boxes copy took, by the ids they had then, and the target field whose mapping they came from. */
  clipboard: Clipboard | null;
  /** Why the last command was refused; `null` once a command applies. */
  refusal: Refusal | null;
  /** A save answered that the file changed on disk: the author chooses Reload or Keep editing (ADR-0027). */
  conflict: boolean;
  /**
   * The latest diagnostics of the working copy: the last compile's, or a refresh's, a refused save's or a test run's
   * until the next compile.
   */
  diagnostics: Diagnostic[];
  /** The title of the transport error the last compile failed with; `null` once a compile answers. */
  compileFailure: string | null;
  /** What the last test run answered: output or a runtime error with its trace, or compile's refusal; `null` before a run. */
  lastRun: TestResult | null;
  /** The working copy the last test run ran; its trace is a stale trace once the working copy differs from it. */
  lastRunModel: MappingModel | null;
  /**
   * Links a source field to a target field (the link command in `model/`); `refusals` are the refusals the two fields
   * carry in their trees, which refuse the link (ADR-0027).
   */
  link: (sourceField: FieldPath, targetField: FieldPath, refusals?: { source?: FieldRefusal; target?: FieldRefusal }) => void;
  /** Inserts a box of standard function `fn` into the target field's mapping, with fresh ids. */
  insertBox: (targetField: FieldPath, fn: string) => void;
  /** Wires box `source`'s output into input slot `slot` of box `target`. */
  wire: (targetField: FieldPath, source: AuthoringId, target: AuthoringId, slot: number) => void;
  /** Removes the wire into input slot `slot` of box `target`. */
  unwire: (targetField: FieldPath, target: AuthoringId, slot: number) => void;
  /** Connects a box to the target field's sink, or disconnects it with `null`. */
  setResult: (targetField: FieldPath, box: AuthoringId | null) => void;
  /**
   * Deletes these boxes as one undo step, or none of them when an id names no box; each selected one is unselected, and
   * the last selected id left becomes the selection.
   */
  deleteBoxes: (boxes: readonly AuthoringId[]) => void;
  /** Sets box parameter `name` of a standard function box, checked against `catalogue`; the default is left out. */
  setParam: (targetField: FieldPath, box: AuthoringId, name: string, value: ParamValue, catalogue: FunctionCatalogue) => void;
  /** Sets a source-field box's context to a proper ancestor of its field; the parent is left out. */
  setContext: (targetField: FieldPath, box: AuthoringId, context: FieldPath) => void;
  /** Wires input slot `slot` of box `target` from box `source`, or leaves it unconnected with `null`. */
  setInput: (targetField: FieldPath, target: AuthoringId, slot: number, source: AuthoringId | null) => void;
  /**
   * Points source-field box `box` at the source field `field`, keeping its id and wires (GLOSSARY: Remap);
   * `sourceRefusal`, the refusal `field` carries in the source tree, refuses the remap (ADR-0027).
   */
  remap: (targetField: FieldPath, box: AuthoringId, field: FieldPath, sourceRefusal?: FieldRefusal) => void;
  /** Removes the target field mapping of `targetField` with all its boxes, such as an orphaned one. */
  deleteTargetFieldMapping: (targetField: FieldPath) => void;
  /**
   * Takes the answer of a refresh of the working copy `sent` (ADR-0027); its diagnostics become the set. When one of
   * its fingerprints differs from the working copy's, its model replaces the working copy as one undo step, or, when
   * the working copy changed since `sent`, only its source and target references replace the working copy's, so that
   * the edit stays. Returns the number of `orphaned-reference` diagnostics then, and `null` when no fingerprint changed.
   */
  applyRefresh: (sent: MappingModel, answer: RefreshResponse) => number | null;
  undo: () => void;
  redo: () => void;
  /** Selects one id, or nothing with `null`. */
  select: (selection: AuthoringId | null) => void;
  /** Selects these ids together, the last as `selection`. */
  selectBoxes: (ids: readonly AuthoringId[]) => void;
  /** Puts the selected boxes of the target field's mapping into the clipboard; with none of them selected, nothing. */
  copy: (targetField: FieldPath) => void;
  /**
   * Pastes the clipboard into the target field's mapping with fresh ids (the paste command in `model/`) and selects the
   * pasted boxes; an empty clipboard, or one copied from another target field, pastes nothing.
   */
  paste: (targetField: FieldPath) => void;
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
  /**
   * Keeps what a test run of `sent` answered. Its diagnostics become the latest unless the working copy changed while it
   * ran; the next compile then brings the newer ones.
   */
  recordRun: (sent: MappingModel, result: TestResult) => void;
}

export interface Clipboard {
  targetField: FieldPath;
  boxes: Readonly<Record<AuthoringId, Box>>;
}

export type WorkingCopyStore = ReturnType<typeof createWorkingCopyStore>;

/** Whether the working copy has changes the baseline lacks. */
export const selectUnsaved = (state: WorkingCopyState): boolean => !sameModel(state.workingCopy, state.baseline);

/** The trace of the last test run by authoring id; none before a run or when compile refused it (ADR-0015). */
export const selectTrace = (state: WorkingCopyState): Record<string, TraceEntry> | undefined =>
  state.lastRun === null || state.lastRun.kind === 'refused' ? undefined : state.lastRun.trace;

/** Whether the last run's trace is a stale trace: there is one, and the working copy has changed since that run (GLOSSARY). */
export const selectTraceStale = (state: WorkingCopyState): boolean =>
  selectTrace(state) !== undefined && !sameModel(state.workingCopy, state.lastRunModel!);

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
    /**
     * A command's result: an applied command is one undo step and redo is gone, unless it changed nothing; a refused
     * one leaves the working copy and records why. Returns whether it applied.
     */
    const apply = (result: CommandResult): boolean => {
      if (result.kind === 'refused') {
        set({ refusal: refusalOf(result) });
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
      selected: [],
      clipboard: null,
      refusal: null,
      conflict: false,
      diagnostics: [],
      compileFailure: null,
      lastRun: null,
      lastRunModel: null,

      link: (sourceField, targetField, refusals) =>
        void apply(
          link(get().workingCopy, {
            sourceField,
            targetField,
            boxId: ports.newId(),
            mappingId: ports.newId(),
            sourceRefusal: refusals?.source,
            targetRefusal: refusals?.target,
          }),
        ),

      insertBox: (targetField, fn) =>
        void apply(
          insertBox(get().workingCopy, { targetField, box: { kind: 'function', fn }, boxId: ports.newId(), mappingId: ports.newId() }),
        ),

      wire: (targetField, source, target, slot) => void apply(wire(get().workingCopy, { targetField, source, target, slot })),

      unwire: (targetField, target, slot) => void apply(unwire(get().workingCopy, { targetField, target, slot })),

      setResult: (targetField, box) => void apply(setResult(get().workingCopy, { targetField, box })),

      deleteBoxes: (boxes) => {
        if (apply(deleteBoxes(get().workingCopy, { boxes }))) get().selectBoxes(get().selected.filter((id) => !boxes.includes(id)));
      },

      setParam: (targetField, box, name, value, catalogue) =>
        void apply(setParam(get().workingCopy, { targetField, box, name, value }, catalogue)),

      setContext: (targetField, box, context) => void apply(setContext(get().workingCopy, { targetField, box, context })),

      setInput: (targetField, target, slot, source) => void apply(setInput(get().workingCopy, { targetField, target, slot, source })),

      remap: (targetField, box, field, sourceRefusal) => void apply(remap(get().workingCopy, { targetField, box, field, sourceRefusal })),

      deleteTargetFieldMapping: (targetField) => void apply(deleteTargetFieldMapping(get().workingCopy, { targetField })),

      applyRefresh: (sent, answer) => {
        const current = get().workingCopy;
        set({ diagnostics: answer.diagnostics });
        const { source, target } = answer.model;
        if (source.fingerprint === current.source.fingerprint && target.fingerprint === current.target.fingerprint) return null;
        apply(applied(current === sent ? answer.model : { ...current, source, target }));
        return answer.diagnostics.filter((d) => d.code === ORPHANED_REFERENCE).length;
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

      select: (selection) => set({ selection, selected: selection === null ? [] : [selection] }),

      selectBoxes: (ids) => set({ selected: ids, selection: ids.at(-1) ?? null }),

      copy: (targetField) => {
        const { workingCopy, selected } = get();
        const boxes = workingCopy.targetFieldMappings?.[targetField]?.boxes ?? {};
        const copied = selected.filter((id) => Object.hasOwn(boxes, id));
        if (copied.length > 0) set({ clipboard: { targetField, boxes: Object.fromEntries(copied.map((id) => [id, boxes[id]!])) } });
      },

      paste: (targetField) => {
        const { clipboard } = get();
        if (clipboard?.targetField !== targetField) return;
        const pasted: AuthoringId[] = [];
        const freshId = () => {
          const id = ports.newId();
          pasted.push(id);
          return id;
        };
        if (apply(paste(get().workingCopy, { targetField, boxes: clipboard.boxes, freshId, mappingId: ports.newId() }))) {
          get().selectBoxes(pasted);
        }
      },

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
          selected: [],
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

      recordRun: (sent, result) =>
        set((state) => ({
          lastRun: result,
          lastRunModel: sent,
          ...(sameModel(state.workingCopy, sent) ? { diagnostics: result.diagnostics } : {}),
        })),
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
