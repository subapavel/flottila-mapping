import { describe, expect, test } from 'vitest';
import type { components } from '../../generated/api';
import { occurrenceText, treeRows } from './rows';

type FieldDto = components['schemas']['FieldDto'];
type StructureLoaded = components['schemas']['StructureLoaded'];

const field = (step: string, min: number, max: number | undefined, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min,
  ...(max === undefined ? {} : { max }),
  nillable: false,
  ...extra,
});

/** Order holds @channel, OrderId and Item; Item holds Sku and another Item (a recursive type, ADR-0008). */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Q{urn:a}Order', 1, 1, { namespace: 'urn:a', localName: 'Order', type: '/Q{urn:a}Order' }),
  types: {
    '/Q{urn:a}Order': [
      field('@channel', 0, 1, { valueType: 'xs:string' }),
      field('OrderId', 1, 1, { valueType: 'xs:string' }),
      field('Item', 0, undefined, { type: 'item' }),
    ],
    item: [field('Sku', 1, 1, { valueType: 'xs:token' }), field('Item', 0, undefined, { type: 'item' })],
  },
};

const ORDER = '/Q{urn:a}Order';
const describeRows = (expanded: string[]) =>
  treeRows(structure, new Set(expanded)).map((r) => `${'  '.repeat(r.depth)}${r.path}${r.expandable ? (r.expanded ? ' -' : ' +') : ''}`);

describe('the rows of a structure tree', () => {
  test('show only the root while nothing is expanded', () => {
    expect(describeRows([])).toEqual([`${ORDER} +`]);
  });

  test('list an expanded field’s child fields one level deeper, with their field paths, attributes marked', () => {
    expect(describeRows([ORDER])).toEqual([
      `${ORDER} -`,
      `  ${ORDER}/@channel`,
      `  ${ORDER}/OrderId`,
      `  ${ORDER}/Item +`,
    ]);
  });

  test('expand a recursive type only as deep as its paths are expanded', () => {
    expect(describeRows([ORDER, `${ORDER}/Item`, `${ORDER}/Item/Item`])).toEqual([
      `${ORDER} -`,
      `  ${ORDER}/@channel`,
      `  ${ORDER}/OrderId`,
      `  ${ORDER}/Item -`,
      `    ${ORDER}/Item/Sku`,
      `    ${ORDER}/Item/Item -`,
      `      ${ORDER}/Item/Item/Sku`,
      `      ${ORDER}/Item/Item/Item +`,
    ]);
  });

  test('ignore an expanded path whose parent is collapsed', () => {
    expect(describeRows([`${ORDER}/Item`])).toEqual([`${ORDER} +`]);
  });

  test('carry the field itself, so a row can show its type', () => {
    const orderId = treeRows(structure, new Set([ORDER]))[2]!;

    expect(orderId.field.valueType).toBe('xs:string');
    expect(orderId.field.step).toBe('OrderId');
  });

  test('treat a type id without fields as a structure field with no child fields', () => {
    const empty: StructureLoaded = { ...structure, types: {} };

    expect(treeRows(empty, new Set([ORDER])).map((r) => r.path)).toEqual([ORDER]);
  });
});

describe('the effective occurrence of a field', () => {
  test.each([
    [1, 1, '1..1'],
    [0, 1, '0..1'],
    [0, undefined, '0..unbounded'],
    [2, 5, '2..5'],
  ])('min %s and max %s read %s', (min, max, text) => {
    expect(occurrenceText(field('X', min, max))).toBe(text);
  });
});
