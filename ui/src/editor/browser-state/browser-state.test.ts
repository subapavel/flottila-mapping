import { describe, expect, test } from 'vitest';
import { storageBrowserState } from './browser-state';

/** A Storage port over a Map; `failing` makes every call throw, as a blocked or full localStorage does. */
function fakeStorage(failing = false) {
  const items = new Map<string, string>();
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return {
    items,
    getItem: (key: string) => (failing ? fail() : (items.get(key) ?? null)),
    setItem: (key: string, value: string) => (failing ? fail() : void items.set(key, value)),
  };
}

describe('the browser state store over a Storage', () => {
  test('writes JSON under the flottila-mapping:v1: prefix and reads it back', () => {
    const storage = fakeStorage();
    const state = storageBrowserState(storage);

    state.write('mapping:m/one:expanded', { source: ['/a'] });

    expect([...storage.items]).toEqual([['flottila-mapping:v1:mapping:m/one:expanded', '{"source":["/a"]}']]);
    expect(state.read('mapping:m/one:expanded')).toEqual({ source: ['/a'] });
  });

  test('reads undefined for a key never written', () => {
    expect(storageBrowserState(fakeStorage()).read('nothing')).toBeUndefined();
  });

  test('reads undefined for a value that is no JSON', () => {
    const storage = fakeStorage();
    storage.items.set('flottila-mapping:v1:broken', '{');

    expect(storageBrowserState(storage).read('broken')).toBeUndefined();
  });

  test('falls back instead of throwing when the storage refuses a read or a write', () => {
    const state = storageBrowserState(fakeStorage(true));

    expect(() => state.write('k', 1)).not.toThrow();
    expect(state.read('k')).toBeUndefined();
  });
});
