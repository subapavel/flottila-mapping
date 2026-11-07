import { describe, expect, test } from 'vitest';
import type { FieldDto, StructureLoaded } from '../../api/client';
import type { MappingModel } from '../../generated/mapping-model';
import { openingField, placed } from './target-field';

const field = (step: string, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: 'element',
  step,
  namespace: '',
  localName: step,
  min: 0,
  nillable: false,
  ...extra,
});

/** Order holds Id, Item and Note; Item holds Line; Note's type is not in the structure. */
const order: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Order', { type: 'order' }),
  types: {
    order: [field('Id', { valueType: 'xs:string' }), field('Item', { type: 'item' }), field('Note', { type: 'missing' })],
    item: [field('Line', { valueType: 'xs:string' })],
  },
};

/** A model whose target field mappings write these paths, in this order. */
const mapped = (...paths: string[]) =>
  ({ targetFieldMappings: Object.fromEntries(paths.map((path, i) => [path, { id: `t${i}`, result: null, boxes: {} }])) }) as unknown as MappingModel;

describe('a field placed in its structure', () => {
  test('is found with its child index at each step below the root', () => {
    expect(placed(order, '/Order')).toEqual({ field: order.root, position: [] });
    expect(placed(order, '/Order/Item/Line')).toEqual({ field: order.types.item![0], position: [1, 0] });
  });

  test('is not found under another root, below a leaf, in a type the structure lacks, or by a step no child has', () => {
    expect(placed(order, '/Invoice/Id')).toBeUndefined();
    expect(placed(order, '/Order/Id/Deeper')).toBeUndefined();
    expect(placed(order, '/Order/Note/Text')).toBeUndefined();
    expect(placed(order, '/Order/Gone')).toBeUndefined();
  });
});

describe('the target field a mapping opens on (spec #145)', () => {
  test('is the kept field when the structure has it, a mapped one or not', () => {
    expect(openingField(order, mapped('/Order/Id'), '/Order/Item')).toBe('/Order/Item');
  });

  test('is otherwise the first mapped target field in tree order, the structure lacking the kept one or none kept', () => {
    expect(openingField(order, mapped('/Order/Gone', '/Order/Item/Line', '/Order/Id'), '/Order/Gone')).toBe('/Order/Id');
    expect(openingField(order, mapped('/Order/Item/Line', '/Order/Item'), undefined)).toBe('/Order/Item');
    expect(openingField(order, mapped('/Order/Item', '/Order/Item/Line'), 42)).toBe('/Order/Item');
    expect(openingField(order, mapped('/Order/Item/Line', '/Order/Id'), null)).toBe('/Order/Id');
  });

  test('is none when the structure has no mapped field, or the model no target field mappings', () => {
    expect(openingField(order, mapped('/Order/Gone'), undefined)).toBeUndefined();
    expect(openingField(order, {} as MappingModel, undefined)).toBeUndefined();
  });
});
