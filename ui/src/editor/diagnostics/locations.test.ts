import { describe, expect, test } from 'vitest';
import type { MappingModel } from '../../generated/mapping-model';
import { targetFieldAt, targetFieldOf } from './locations';

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
    [ORDER_ID]: { id: 't1', result: 'a1', boxes: { a1: { kind: 'source', field: ORDER_ID } } },
    [NOTE]: { id: 't2', result: null, boxes: { a2: { kind: 'source', field: NOTE } } },
  },
};

describe('where a diagnostic leads', () => {
  test('an authoring id leads to the target field of its target field mapping, by the mapping id or a box id', () => {
    expect(targetFieldOf(model, 't1')).toBe(ORDER_ID);
    expect(targetFieldOf(model, 'a2')).toBe(NOTE);
  });

  test('an authoring id the working copy no longer has leads nowhere', () => {
    expect(targetFieldOf(model, 'gone')).toBeUndefined();
    expect(targetFieldOf({ ...model, targetFieldMappings: undefined }, 't1')).toBeUndefined();
  });

  test('a pointer to a target field mapping, or into one, leads to its field, unescaped as RFC 6901 says', () => {
    expect(targetFieldAt('/targetFieldMappings/~1Q{urn:flottila:corpus:skeleton}Order~1OrderId')).toBe(ORDER_ID);
    expect(targetFieldAt('/targetFieldMappings/~1Q{urn:a~0b}R~1x/boxes/a1/kind')).toBe('/Q{urn:a~b}R/x');
    // ~01 is an escaped ~ followed by 1, never a /
    expect(targetFieldAt('/targetFieldMappings/~1a~01')).toBe('/a~1');
  });

  test('any other pointer leads nowhere', () => {
    for (const pointer of ['/source/fingerprint', '/formatVersion', '', '/targetFieldMappings', 'targetFieldMappings/~1a']) {
      expect(targetFieldAt(pointer), pointer).toBeUndefined();
    }
  });
});
