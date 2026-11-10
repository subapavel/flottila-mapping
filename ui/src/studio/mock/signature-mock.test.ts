import { describe, expect, test } from 'vitest';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { createSignatureMock, moveRow, signatureMockKey, type PreviewMessage, type PreviewParameter } from './signature-mock';

function memoryBrowserState(seed: Record<string, unknown> = {}): BrowserStateStore & { values: Map<string, unknown> } {
  const values = new Map(Object.entries(seed));
  return { values, read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

const message = (id: string): PreviewMessage => ({ id, occurrence: '1' });
const parameter = (id: string, name: string): PreviewParameter => ({ id, name, type: 'string', direction: 'Import', description: '' });
const KEY = signatureMockKey('mappings/order');

describe('the prototype moveRow', () => {
  test('swaps a row with its neighbour', () => {
    expect(moveRow(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveRow(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  test('gives back the same rows at an end or for a row it does not have', () => {
    const rows = ['a', 'b'];
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, -1, 1)).toBe(rows);
    expect(moveRow(rows, 2, -1)).toBe(rows);
  });
});

describe('the preview signature of a mapping (ADR-0028)', () => {
  test('starts empty, and keeps each change in the browser state under the mapping id', () => {
    const browserState = memoryBrowserState();
    const mock = createSignatureMock(browserState, 'mappings/order');
    expect(mock.getState()).toMatchObject({ source: [], target: [], parameters: [] });

    mock.getState().insertMessage('source', 0, message('m1'));
    mock.getState().addParameter(parameter('p1', 'date'));

    expect(browserState.values.get(KEY)).toEqual({ source: [message('m1')], target: [], parameters: [parameter('p1', 'date')] });
    expect(createSignatureMock(browserState, 'mappings/order').getState()).toMatchObject({ source: [message('m1')], parameters: [parameter('p1', 'date')] });
    expect(createSignatureMock(browserState, 'mappings/other').getState().source).toEqual([]);
  });

  test('anything else kept under the key starts empty', () => {
    for (const kept of ['text', null, { source: [], target: [] }, { source: 1, target: [], parameters: [] }, { source: [], target: {}, parameters: [] }]) {
      const mock = createSignatureMock(memoryBrowserState({ [KEY]: kept }), 'mappings/order');

      expect(mock.getState()).toMatchObject({ source: [], target: [], parameters: [] });
    }
  });

  test('inserts, moves, patches and removes the messages of one side', () => {
    const mock = createSignatureMock(memoryBrowserState(), 'mappings/order');
    const { insertMessage, moveMessage, patchMessage, removeMessage } = mock.getState();
    insertMessage('target', 0, message('a'));
    insertMessage('target', 1, message('c'));
    insertMessage('target', 1, message('b'));
    expect(mock.getState().target.map((m) => m.id)).toEqual(['a', 'b', 'c']);

    moveMessage('target', 'c', -1);
    patchMessage('target', 'b', { occurrence: '0..unbounded' });
    removeMessage('target', 'a');

    expect(mock.getState().target).toEqual([message('c'), { id: 'b', occurrence: '0..unbounded' }]);
    expect(mock.getState().source).toEqual([]);
  });

  test('adds, patches, orders by name and removes the parameters', () => {
    const mock = createSignatureMock(memoryBrowserState(), 'mappings/order');
    const { addParameter, patchParameter, sortParameters, removeParameter } = mock.getState();
    addParameter(parameter('p1', 'zone'));
    addParameter(parameter('p2', 'date'));
    addParameter(parameter('p3', 'mode'));

    patchParameter('p1', { type: 'integer' });
    sortParameters();
    removeParameter('p3');

    expect(mock.getState().parameters).toEqual([parameter('p2', 'date'), { ...parameter('p1', 'zone'), type: 'integer' }]);
  });
});
