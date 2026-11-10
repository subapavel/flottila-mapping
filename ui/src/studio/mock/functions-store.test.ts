import { expect, test } from 'vitest';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { emptyFunctions, newFunction } from '../functions/function-model';
import { createFunctionsStore, functionsKey } from './functions-store';

function memoryBrowserState(): BrowserStateStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return { values, read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

test('a mapping without kept functions starts empty', () => {
  expect(createFunctionsStore(memoryBrowserState(), 'm/a').getState().functions).toEqual(emptyFunctions());
});

test('an edit is kept in the browser under its mapping id at once, and a new store of that mapping reads it', () => {
  const browserState = memoryBrowserState();
  const store = createFunctionsStore(browserState, 'm/a');
  const fn = newFunction('calculate1', 'f1');

  store.getState().edit((s) => ({ ...s, functions: [fn] }));

  expect(store.getState().functions.functions).toEqual([fn]);
  expect([...browserState.values.keys()]).toEqual([functionsKey('m/a')]);
  expect(createFunctionsStore(browserState, 'm/a').getState().functions.functions).toEqual([fn]);
  expect(createFunctionsStore(browserState, 'm/b').getState().functions).toEqual(emptyFunctions());
});

test('an edit that throws changes nothing and keeps nothing', () => {
  const browserState = memoryBrowserState();
  const store = createFunctionsStore(browserState, 'm/a');

  expect(() =>
    store.getState().edit(() => {
      throw new Error('refused');
    }),
  ).toThrow('refused');

  expect(store.getState().functions).toEqual(emptyFunctions());
  expect(browserState.values.size).toBe(0);
});
