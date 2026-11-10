import { createStore } from 'zustand/vanilla';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import type { MessageChoice } from '../signature/structure-names';

/** The follow-up issue of several source or target messages (spec #152, preview features). */
export const SEVERAL_MESSAGES_ISSUE = 168;
/** The follow-up issue of mapping parameters (spec #152, preview features). */
export const PARAMETERS_ISSUE = 167;

export type Side = 'source' | 'target';

/** A message's occurrence in a multi-message signature, as the prototype offers them. */
export const OCCURRENCES = ['1', '0..1', '0..unbounded'] as const;
export type Occurrence = (typeof OCCURRENCES)[number];

/** A source or target message after the first: a preview feature (#168), kept in the browser and never in the file. */
export interface PreviewMessage {
  id: string;
  /** The message chosen for the row; none until one is chosen. */
  choice?: MessageChoice;
  occurrence: Occurrence;
}

/** A mapping parameter: a preview feature (#167), kept in the browser and never in the file. */
export interface PreviewParameter {
  id: string;
  name: string;
  type: 'string' | 'integer';
  direction: 'Import' | 'Export';
  description: string;
}

interface SignatureMockData {
  source: PreviewMessage[];
  target: PreviewMessage[];
  parameters: PreviewParameter[];
}

export interface SignatureMockState extends SignatureMockData {
  /** Inserts a message at `index` of the side's preview messages. */
  insertMessage: (side: Side, index: number, message: PreviewMessage) => void;
  removeMessage: (side: Side, id: string) => void;
  /** Swaps a message with its neighbour `delta` places away; at an end it stays. */
  moveMessage: (side: Side, id: string, delta: -1 | 1) => void;
  patchMessage: (side: Side, id: string, patch: Partial<Omit<PreviewMessage, 'id'>>) => void;
  addParameter: (parameter: PreviewParameter) => void;
  patchParameter: (id: string, patch: Partial<Omit<PreviewParameter, 'id'>>) => void;
  removeParameter: (id: string) => void;
  /** Orders the parameters by name (the prototype's Refresh). */
  sortParameters: () => void;
}

export type SignatureMockStore = ReturnType<typeof createSignatureMock>;

/** The key of a mapping's preview signature in the browser state (ADR-0028: mock state per mapping id). */
export const signatureMockKey = (mappingId: string) => `mapping:${mappingId}:preview:signature`;

/** The prototype's moveRow: the rows with `from` swapped with its neighbour `delta` away, or the same rows at an end. */
export function moveRow<T>(rows: readonly T[], from: number, delta: number): readonly T[] {
  const to = from + delta;
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const next = rows.slice();
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Whether a value read back from the browser has the three lists; anything else starts empty. */
function isData(value: unknown): value is SignatureMockData {
  const data = value as Partial<SignatureMockData> | null;
  return typeof data === 'object' && data !== null && Array.isArray(data.source) && Array.isArray(data.target) && Array.isArray(data.parameters);
}

/**
 * The preview signature of one mapping (ADR-0028): the messages after the first of each side and the parameters, in a
 * store of its own, read from and written to the browser state under the mapping's id. It never reaches the working
 * copy or the `ApiClient`.
 */
export function createSignatureMock(browserState: BrowserStateStore, mappingId: string) {
  const key = signatureMockKey(mappingId);
  const kept = browserState.read(key);
  const initial: SignatureMockData = isData(kept) ? kept : { source: [], target: [], parameters: [] };

  const store = createStore<SignatureMockState>()((set) => {
    const messages = (side: Side, change: (rows: PreviewMessage[]) => readonly PreviewMessage[]) =>
      set((state) => ({ [side]: change(state[side]) }));
    return {
      ...initial,
      insertMessage: (side, index, message) => messages(side, (rows) => [...rows.slice(0, index), message, ...rows.slice(index)]),
      removeMessage: (side, id) => messages(side, (rows) => rows.filter((row) => row.id !== id)),
      moveMessage: (side, id, delta) =>
        messages(side, (rows) =>
          moveRow(
            rows,
            rows.findIndex((row) => row.id === id),
            delta,
          ),
        ),
      patchMessage: (side, id, patch) => messages(side, (rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row))),
      addParameter: (parameter) => set((state) => ({ parameters: [...state.parameters, parameter] })),
      patchParameter: (id, patch) => set((state) => ({ parameters: state.parameters.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeParameter: (id) => set((state) => ({ parameters: state.parameters.filter((p) => p.id !== id) })),
      sortParameters: () => set((state) => ({ parameters: [...state.parameters].sort((a, b) => a.name.localeCompare(b.name)) })),
    };
  });
  store.subscribe(({ source, target, parameters }) => browserState.write(key, { source, target, parameters }));
  return store;
}
