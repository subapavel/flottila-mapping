import { describe, expect, test } from 'vitest';
import type { MappingModel } from '../../generated/mapping-model';
import { locate, targetFieldAt, targetFieldOf } from './locations';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;

const structure = {
  bundle: ['../structures/skeleton/order.xsd'] as [string],
  fingerprint: 'sha256:df1714b8b2e4b09e326626a2ea72780bf6298a0ca733c69f5586ea657e4bd90d',
  root: { element: 'Q{urn:flottila:corpus:skeleton}Order' },
};
const model: MappingModel = {
  formatVersion: 1,
  source: structure,
  target: structure,
  targetFieldMappings: {
    [ORDER_ID]: { id: 't1', result: 'a1', boxes: { a1: { kind: 'source', field: ORDER_ID }, c1: { kind: 'function', fn: 'constant' } } },
    [NOTE]: { id: 't2', result: null, boxes: { a2: { kind: 'source', field: NOTE } } },
  },
};
const ownerIn = (m: MappingModel) => (id: string) => locate(m, id)?.field;
const at = (authoringId: string, m: MappingModel = model) => targetFieldOf({ kind: 'authoring-id', authoringId }, ownerIn(m));

describe('locating an authoring id', () => {
  test('a box id names its target field and the box', () => {
    expect(locate(model, 'c1')).toEqual({ field: ORDER_ID, box: 'c1' });
  });

  test('a target field mapping id names its target field and no box', () => {
    expect(locate(model, 't1')).toEqual({ field: ORDER_ID, box: null });
  });

  test('an id the model lacks names nothing', () => {
    expect(locate(model, 'zz')).toBeUndefined();
    expect(locate({ ...model, targetFieldMappings: undefined }, 'c1')).toBeUndefined();
  });
});

describe('where a diagnostic leads', () => {
  test('an authoring id leads to the target field of its target field mapping, by the mapping id or a box id', () => {
    expect(at('t1')).toBe(ORDER_ID);
    expect(at('a2')).toBe(NOTE);
  });

  test('an authoring id the working copy no longer has leads nowhere', () => {
    expect(at('gone')).toBeUndefined();
    expect(at('t1', { ...model, targetFieldMappings: undefined })).toBeUndefined();
  });

  test('a pointer to a target field mapping, or into one, leads to its field, unescaped as RFC 6901 says', () => {
    expect(targetFieldAt('/targetFieldMappings/~1Q{urn:flottila:corpus:skeleton}Order~1OrderId')).toBe(ORDER_ID);
    expect(targetFieldAt('/targetFieldMappings/~1Q{urn:a~0b}R~1x/boxes/a1/kind')).toBe('/Q{urn:a~b}R/x');
    // ~01 is an escaped ~ followed by 1, never a /
    expect(targetFieldAt('/targetFieldMappings/~1a~01')).toBe('/a~1');
    expect(targetFieldOf({ kind: 'pointer', pointer: '/targetFieldMappings/~1a~01/result' }, ownerIn(model))).toBe('/a~1');
  });

  test('any other pointer leads nowhere', () => {
    for (const pointer of ['/source/fingerprint', '/formatVersion', '', '/targetFieldMappings', 'targetFieldMappings/~1a']) {
      expect(targetFieldAt(pointer), pointer).toBeUndefined();
      expect(targetFieldOf({ kind: 'pointer', pointer }, ownerIn(model)), pointer).toBeUndefined();
    }
  });

  test('a field path leads to a target field on the target side only', () => {
    expect(targetFieldOf({ kind: 'field-path', side: 'target', fieldPath: NOTE }, ownerIn(model))).toBe(NOTE);
    expect(targetFieldOf({ kind: 'field-path', side: 'source', fieldPath: NOTE }, ownerIn(model))).toBeUndefined();
  });

  test('a schema file position leads to no target field', () => {
    expect(targetFieldOf({ kind: 'file-position', file: 'order.xsd', line: 3, column: 7 }, ownerIn(model))).toBeUndefined();
  });
});
