/** The port for the viewer's own layout and view state, kept in the browser (ADR-0013, "Browser state"). */
export interface BrowserStateStore {
  /** The value written under `key`, or `undefined` when there is none or it cannot be read. */
  read(key: string): unknown;
  /** Keeps `value` under `key`; a failure is ignored, and the next read falls back to the defaults. */
  write(key: string, value: unknown): void;
}

const PREFIX = 'flottila-mapping:v1:';

/** The default `BrowserStateStore`, over `localStorage` or another `Storage`, with every call wrapped. */
export function storageBrowserState(storage: Pick<Storage, 'getItem' | 'setItem'>): BrowserStateStore {
  return {
    read(key) {
      try {
        const text = storage.getItem(PREFIX + key);
        return text === null ? undefined : (JSON.parse(text) as unknown);
      } catch {
        return undefined;
      }
    },
    write(key, value) {
      try {
        storage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // full or blocked storage: the state is lost, the editor still works (ADR-0013)
      }
    },
  };
}
