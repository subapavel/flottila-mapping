import { describe, expect, test } from 'vitest';
import type { FieldDto, StructureLoaded } from '../../api/client';
import { remapChoices } from './remap-choices';

const field = (step: string, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min: 0,
  nillable: false,
  ...extra,
});

/** Order holds @channel, Item and Note; Item holds Q{urn:x/y}Sku and another Item (a recursive type, ADR-0008). */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Q{http://a/b}Order', { type: 'order' }),
  types: {
    order: [field('@channel'), field('Item', { type: 'item' }), field('Note', { type: 'note' })],
    item: [field('Q{urn:x/y}Sku'), field('Item', { type: 'item' })],
  },
};

const ORDER = '/Q{http://a/b}Order';

describe('the fields a source-field box can be remapped to', () => {
  test('are every field of the source structure in tree order, each named by its local names', () => {
    expect(remapChoices(structure)).toEqual([
      { path: ORDER, label: '/Order' },
      { path: `${ORDER}/@channel`, label: '/Order/@channel' },
      { path: `${ORDER}/Item`, label: '/Order/Item' },
      { path: `${ORDER}/Item/Q{urn:x/y}Sku`, label: '/Order/Item/Sku' },
      { path: `${ORDER}/Item/Item`, label: '/Order/Item/Item' },
      { path: `${ORDER}/Note`, label: '/Order/Note' },
    ]);
  });

  test('stop below a field whose type is already on its path, so a recursive type ends', () => {
    const paths = remapChoices(structure).map((choice) => choice.path);

    expect(paths).toContain(`${ORDER}/Item/Item`);
    expect(paths).not.toContain(`${ORDER}/Item/Item/Q{urn:x/y}Sku`);
  });
});
