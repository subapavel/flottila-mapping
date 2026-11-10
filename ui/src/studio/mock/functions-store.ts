import { createStore } from 'zustand/vanilla';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { readFunctions, type FunctionsState } from '../functions/function-model';

/** The key of a mapping's Functions tab state in the browser (ADR-0028: mock state per mapping id). */
export const functionsKey = (mappingId: string) => `mapping:${mappingId}:functions-preview`;

export interface FunctionsStoreState {
  functions: FunctionsState;
  /** Applies `change` and keeps the result in the browser at once. */
  edit: (change: (current: FunctionsState) => FunctionsState) => void;
}

/**
 * The Functions tab's mock store of one mapping (ADR-0028, ADR-0030, #169): its user-defined functions, Java areas,
 * imports and archives, read from and written to `BrowserStateStore` under the mapping's id. It is never written to the
 * mapping model and never sent to the `ApiClient`.
 */
export function createFunctionsStore(browserState: BrowserStateStore, mappingId: string) {
  return createStore<FunctionsStoreState>()((set, get) => ({
    functions: readFunctions(browserState.read(functionsKey(mappingId))),
    edit: (change) => {
      const functions = change(get().functions);
      set({ functions });
      browserState.write(functionsKey(mappingId), functions);
    },
  }));
}

export type FunctionsStore = ReturnType<typeof createFunctionsStore>;
