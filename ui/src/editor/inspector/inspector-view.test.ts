import { describe, expect, test } from 'vitest';
import type { FunctionCatalogue } from '../../api/client';
import type { MappingModel } from '../../generated/mapping-model';
import { localPath } from '../../model/field-path';
import { boxTitle, duplicateKey, inspected, slotChoices, slotNames } from './inspector-view';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;

const catalogue: FunctionCatalogue = {
  concat: {
    family: 'text',
    executionKind: 'single',
    inputs: [{ name: 'a' }, { name: 'b' }],
    portable: true,
    fidelity: { level: 'exact' },
  },
};

const model = {
  targetFieldMappings: {
    [ORDER_ID]: {
      id: 't1',
      result: 'f1',
      boxes: {
        a1: { kind: 'source', field: ORDER_ID },
        f1: { kind: 'function', fn: 'concat', inputs: ['a1'] },
        u1: { kind: 'udf', udf: 'shout', inputs: ['f1', null, 'a1'] },
        r1: { kind: 'unresolved', name: 'FormatByExample', origin: 'po' },
        x1: { kind: 'function', fn: 'noSuchFunction', inputs: [null, null] },
      },
    },
    [NOTE]: { id: 'tn', result: 'n1', boxes: { n1: { kind: 'source', field: NOTE } } },
  },
} as unknown as MappingModel;
const mapping = model.targetFieldMappings![ORDER_ID]!;

describe('the box the inspector shows', () => {
  test("is the selection when it is a box of the selected target field's mapping", () => {
    expect(inspected(model, ORDER_ID, 'f1')).toEqual({ id: 'f1', box: mapping.boxes.f1, mapping });
  });

  test("is none without a selection, for a box of another target field's mapping, and for a target field mapping's id", () => {
    expect(inspected(model, ORDER_ID, null)).toBeUndefined();
    expect(inspected(model, ORDER_ID, 'n1')).toBeUndefined();
    expect(inspected(model, ORDER_ID, 't1')).toBeUndefined();
    expect(inspected(model, null, 'f1')).toBeUndefined();
    expect(inspected({} as MappingModel, ORDER_ID, 'f1')).toBeUndefined();
  });
});

describe("a box's input slots", () => {
  test('are named by the catalogue for a function, by the declaration for a udf, numbered otherwise', () => {
    const udfs = { shout: { executionKind: 'single' as const, inputs: ['text'], source: 'Shout.java#shout' } };

    expect(slotNames(mapping.boxes.f1!, catalogue, udfs)).toEqual(['a', 'b']);
    expect(slotNames(mapping.boxes.u1!, catalogue, udfs)).toEqual(['text']);
    expect(slotNames(mapping.boxes.u1!, catalogue, undefined)).toEqual(['1', '2', '3']);
    expect(slotNames(mapping.boxes.x1!, catalogue, udfs)).toEqual(['1', '2']);
    expect(slotNames(mapping.boxes.r1!, catalogue, udfs)).toEqual([]);
    expect(slotNames(mapping.boxes.a1!, catalogue, udfs)).toEqual([]);
  });

  test('are wired from any other box of the same target field mapping, in sorted id order, with its title', () => {
    expect(slotChoices(mapping, 'f1')).toEqual([
      { id: 'a1', title: 'Order/OrderId' },
      { id: 'r1', title: 'FormatByExample' },
      { id: 'u1', title: 'shout' },
      { id: 'x1', title: 'noSuchFunction' },
    ]);
  });
});

describe("a box's title", () => {
  test('a source-field box is titled by its local path, an escaped JSON property by its names as the source tree shows them', () => {
    const field = '/$/order/a%2Fb%25%40%7B%7D';

    expect(boxTitle({ kind: 'source', field: '/Q{urn:x}Order/@Q{urn:y}code' })).toBe('Order/@code');
    expect(boxTitle({ kind: 'source', field })).toBe('$/order/a/b%@{}');
    expect(boxTitle({ kind: 'source', field })).toBe(localPath(field));
  });
});

describe('a duplicate key of a table editor', () => {
  test('is the first key that a later row repeats, or none', () => {
    expect(duplicateKey([{ key: 'A', value: '1' }, { key: 'B', value: '2' }])).toBeUndefined();
    expect(duplicateKey([{ key: 'A', value: '1' }, { key: 'B', value: '2' }, { key: 'A', value: '3' }, { key: 'B', value: '' }])).toBe('A');
    expect(duplicateKey([])).toBeUndefined();
  });
});
