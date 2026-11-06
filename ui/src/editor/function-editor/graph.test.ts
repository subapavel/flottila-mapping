import { describe, expect, test } from 'vitest';
import type { FunctionCatalogue } from '../../api/client';
import type { TargetFieldMapping } from '../../generated/mapping-model';
import { stepName } from '../../model/field-path';
import { boxIds, boxView, liveMarks, SINK, wires } from './graph';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;

/** OrderId and a constant into concat, which is the result; toUpperCase reads OrderId but feeds nothing. */
const mapping: TargetFieldMapping = {
  id: 't1',
  result: 'f1',
  boxes: {
    u1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] },
    f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] },
    c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
    a1: { kind: 'source', field: ORDER_ID },
  },
};

const catalogue: FunctionCatalogue = {
  concat: {
    family: 'text',
    executionKind: 'single',
    portable: true,
    fidelity: { level: 'assumed' },
    inputs: [{ name: 'a' }, { name: 'b' }],
  },
};

describe('the function graph of a target field mapping', () => {
  test('lists the boxes in sorted authoring id order', () => {
    expect(boxIds(mapping)).toEqual(['a1', 'c1', 'f1', 'u1']);
    expect(boxIds(undefined)).toEqual([]);
  });

  test('has one wire per used input slot and one from result into the sink', () => {
    expect(wires(mapping)).toEqual([
      { id: 'a1->f1#0', source: 'a1', target: 'f1', slot: 0 },
      { id: 'c1->f1#1', source: 'c1', target: 'f1', slot: 1 },
      { id: 'a1->u1#0', source: 'a1', target: 'u1', slot: 0 },
      { id: `f1->${SINK}`, source: 'f1', target: SINK },
    ]);
  });

  test('an unconnected input slot and a null result have no wire', () => {
    const unfinished: TargetFieldMapping = { id: 't1', result: null, boxes: { f1: { kind: 'function', fn: 'concat', inputs: [null, 'a1'] }, a1: { kind: 'source', field: ORDER_ID } } };

    expect(wires(unfinished)).toEqual([{ id: 'a1->f1#1', source: 'a1', target: 'f1', slot: 1 }]);
    expect(wires(undefined)).toEqual([]);
  });
});

describe('the view of a box', () => {
  test('a source-field box shows its field step and has no input slot', () => {
    expect(boxView({ kind: 'source', field: `${ORDER}/@Q{urn:x/y}channel` }, catalogue, undefined)).toEqual({ title: '@channel', slots: [] });
  });

  test('a source-field box reading an escaped JSON property shows its name as the source tree does', () => {
    const field = '/$/order/a%2Fb%25%40%7B%7D';

    expect(boxView({ kind: 'source', field }, catalogue, undefined).title).toBe('a/b%@{}');
    expect(boxView({ kind: 'source', field }, catalogue, undefined).title).toBe(stepName(field));
  });

  test('a function box shows its function and the catalogue names of its input slots', () => {
    expect(boxView({ kind: 'function', fn: 'concat', inputs: ['a1'] }, catalogue, undefined)).toEqual({ title: 'concat', slots: ['a', 'b'] });
  });

  test('a function box the catalogue lacks numbers the slots its model has', () => {
    expect(boxView({ kind: 'function', fn: 'gone', inputs: ['a1', null] }, catalogue, undefined)).toEqual({ title: 'gone', slots: ['1', '2'] });
    expect(boxView({ kind: 'function', fn: 'gone' }, catalogue, undefined)).toEqual({ title: 'gone', slots: [] });
  });

  test('a udf box takes its slot names from the declaration, an unresolved box shows its name', () => {
    const udfs = { trim2: { executionKind: 'single' as const, inputs: ['text'], source: 'x' } };

    expect(boxView({ kind: 'udf', udf: 'trim2', inputs: [null] }, catalogue, udfs)).toEqual({ title: 'trim2', slots: ['text'] });
    expect(boxView({ kind: 'udf', udf: 'other', inputs: [null] }, catalogue, udfs)).toEqual({ title: 'other', slots: ['1'] });
    expect(boxView({ kind: 'unresolved', name: 'ns:fn', origin: 'po', inputs: ['a1'] }, catalogue, udfs)).toEqual({ title: 'ns:fn', slots: ['1'] });
  });
});

describe('the value of a constant box', () => {
  test('is its value param as JSON, and "" (the default) when the param is left out', () => {
    expect(boxView(mapping.boxes.c1!, catalogue, undefined)).toEqual({ title: 'constant', slots: [], value: '"-"' });
    expect(boxView({ kind: 'function', fn: 'constant' }, catalogue, undefined).value).toBe('""');
  });

  test('another box has none', () => {
    expect(boxView({ kind: 'function', fn: 'concat', params: { value: 'x' } }, catalogue, undefined).value).toBeUndefined();
  });
});

describe('the live marks (ADR-0013)', () => {
  test('a null result and each input slot that reads no box are marked, absent slots included', () => {
    const unfinished: TargetFieldMapping = {
      id: 't1',
      result: null,
      boxes: {
        a1: { kind: 'source', field: ORDER_ID },
        f1: { kind: 'function', fn: 'concat', inputs: [null, 'a1'] },
        f2: { kind: 'function', fn: 'concat' },
        f3: { kind: 'function', fn: 'concat', inputs: ['a1', 'a1'] },
      },
    };

    expect(liveMarks(unfinished, catalogue, undefined)).toEqual({ resultUnconnected: true, unconnectedInputs: { f1: [0], f2: [0, 1] } });
  });

  test('a finished graph has no mark', () => {
    expect(liveMarks({ ...mapping, boxes: { ...mapping.boxes, u1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] } } }, catalogue, undefined)).toEqual({
      resultUnconnected: false,
      unconnectedInputs: {},
    });
  });
});
