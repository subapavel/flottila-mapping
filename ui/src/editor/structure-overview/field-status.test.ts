import { describe, expect, test } from 'vitest';
import type { Diagnostic } from '../../api/client';
import type { components } from '../../generated/api';
import type { MappingModel, TargetFieldMapping } from '../../generated/mapping-model';
import {
  fieldStatuses,
  filteredLinks,
  filteredRows,
  isStatusFilter,
  orphanedBoxes,
  orphanedMappings,
  type FieldStatus,
} from './field-status';
import type { FieldLink } from './links';

type FieldDto = components['schemas']['FieldDto'];
type StructureLoaded = components['schemas']['StructureLoaded'];

const field = (step: string, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min: 0,
  nillable: false,
  ...extra,
});

/**
 * Order holds @channel, OrderId, Item and Note; Item holds Sku and another Item (a recursive type, ADR-0008); Note's
 * type lists no child fields.
 */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Q{http://a/b}Order', { namespace: 'http://a/b', localName: 'Order', type: 'order' }),
  types: {
    order: [field('@channel'), field('OrderId', { min: 1 }), field('Item', { type: 'item' }), field('Note', { type: 'note' })],
    item: [field('Sku'), field('Item', { type: 'item' })],
  },
};

const ORDER = '/Q{http://a/b}Order';
const CHANNEL = `${ORDER}/@channel`;
const ORDER_ID = `${ORDER}/OrderId`;
const ITEM = `${ORDER}/Item`;
const SKU = `${ITEM}/Sku`;
const DEEP_SKU = `${ITEM}/Item/Item/Sku`;

/** The RFC 6901 pointer to a target field mapping, the location of `unmapped-mandatory-leaf` (ADR-0015). */
const pointerTo = (path: string, below = '') => `/targetFieldMappings/${path.replaceAll('~', '~0').replaceAll('/', '~1')}${below}`;

const model = (targetFieldMappings: Record<string, TargetFieldMapping>): MappingModel =>
  ({ targetFieldMappings }) as unknown as MappingModel;

/** A target field mapping `id` whose result is one source-field box `<id>s` reading `source`. */
const copy = (id: string, source: string): TargetFieldMapping => ({ id, result: `${id}s`, boxes: { [`${id}s`]: { kind: 'source', field: source } } });

const error = (code: string, location: Diagnostic['location']): Diagnostic => ({ severity: 'error', code, message: code, location });
const unmappedMandatory = (path: string) => error('unmapped-mandatory-leaf', { kind: 'pointer', pointer: pointerTo(path) });

describe('the field status of a target row (ADR-0012, spec #104 stories 38 and 40)', () => {
  test('a field with a target field mapping is mapped; a field with none and no diagnostic has no status', () => {
    const statuses = fieldStatuses(model({ [ORDER_ID]: copy('t1', ORDER_ID), [SKU]: copy('t2', DEEP_SKU) }), [], structure);

    expect(statuses).toEqual(
      new Map<string, FieldStatus>([
        [ORDER_ID, 'mapped'],
        [SKU, 'mapped'],
      ]),
    );
  });

  test('a model without target field mappings has no status but the last compile’s', () => {
    expect(fieldStatuses({} as MappingModel, [], structure)).toEqual(new Map());
    expect(fieldStatuses({} as MappingModel, [unmappedMandatory(ORDER_ID)], structure)).toEqual(new Map([[ORDER_ID, 'unmapped-mandatory']]));
  });

  test('unmapped-mandatory-leaf of the last compile at the row’s pointer is unmapped mandatory', () => {
    const statuses = fieldStatuses(model({}), [unmappedMandatory(ORDER_ID), unmappedMandatory(`${ITEM}/Item/Sku`)], structure);

    expect(statuses).toEqual(
      new Map<string, FieldStatus>([
        [ORDER_ID, 'unmapped-mandatory'],
        [`${ITEM}/Item/Sku`, 'unmapped-mandatory'],
      ]),
    );
  });

  test('an error at the target field mapping, one of its boxes, its pointer or below, or its target field path is error', () => {
    const working = model({
      [ORDER_ID]: copy('t1', ORDER_ID),
      [CHANNEL]: copy('t2', CHANNEL),
      [SKU]: copy('t3', SKU),
      [ITEM]: copy('t4', ITEM),
    });
    const statuses = fieldStatuses(
      working,
      [
        error('unconnected-target-field', { kind: 'authoring-id', authoringId: 't1' }),
        error('wrong-input-count', { kind: 'authoring-id', authoringId: 't2s' }),
        error('model-invalid', { kind: 'pointer', pointer: pointerTo(SKU, '/boxes/t3s') }),
        error('unsupported-field', { kind: 'field-path', side: 'target', fieldPath: ITEM }),
        error('unsupported-field', { kind: 'pointer', pointer: pointerTo(`${ITEM}/Item`) }),
      ],
      structure,
    );

    expect(statuses).toEqual(
      new Map<string, FieldStatus>([
        [ORDER_ID, 'error'],
        [CHANNEL, 'error'],
        [SKU, 'error'],
        [ITEM, 'error'],
        [`${ITEM}/Item`, 'error'],
      ]),
    );
  });

  test('a warning, a source field path, an authoring id the working copy lacks, a file position and another pointer mark no row', () => {
    const statuses = fieldStatuses(
      model({ [ORDER_ID]: copy('t1', ORDER_ID) }),
      [
        { severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 't1s' } },
        error('orphaned-reference', { kind: 'field-path', side: 'source', fieldPath: CHANNEL }),
        error('unconnected-target-field', { kind: 'authoring-id', authoringId: 'gone' }),
        error('schema-unreadable', { kind: 'file-position', file: 'order.xsd', line: 1, column: 1 }),
        error('unsupported-field', { kind: 'pointer', pointer: '/target' }),
        error('model-invalid', { kind: 'pointer', pointer: '/targetFieldMappings' }),
        error('model-invalid', { kind: 'pointer', pointer: '' }),
        error('model-invalid', { kind: 'pointer', pointer: `x${pointerTo(ORDER_ID)}` }),
        error('model-invalid', { kind: 'pointer', pointer: pointerTo(ORDER_ID).replace('targetFieldMappings', 'udfs') }),
      ],
      structure,
    );

    expect(statuses).toEqual(new Map([[ORDER_ID, 'mapped']]));
  });

  test('a target field mapping with a source-field box reading a field the source structure lacks is orphaned', () => {
    const orphaned: TargetFieldMapping = {
      id: 't1',
      result: 'f1',
      boxes: {
        f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'a2'] },
        a1: { kind: 'source', field: CHANNEL },
        a2: { kind: 'source', field: `${ORDER}/Gone` },
      },
    };
    const working = model({ [ORDER_ID]: orphaned, [CHANNEL]: copy('t2', `${ORDER_ID}/Below`), [SKU]: copy('t3', '/Other/Sku') });

    expect(fieldStatuses(working, [], structure)).toEqual(
      new Map<string, FieldStatus>([
        [ORDER_ID, 'orphaned'],
        [CHANNEL, 'orphaned'],
        [SKU, 'orphaned'],
      ]),
    );
  });

  test('is mapped, not orphaned, while the source structure is not loaded', () => {
    expect(fieldStatuses(model({ [ORDER_ID]: copy('t1', `${ORDER}/Gone`) }), [], undefined)).toEqual(new Map([[ORDER_ID, 'mapped']]));
  });

  test('takes error before orphaned before unmapped mandatory before mapped, in any diagnostic order', () => {
    const working = model({
      [ORDER_ID]: copy('t1', `${ORDER}/Gone`),
      [CHANNEL]: copy('t2', `${ORDER}/Gone`),
      [SKU]: copy('t3', SKU),
    });
    const atT1 = error('orphaned-reference', { kind: 'authoring-id', authoringId: 't1s' });
    const unmapped = [unmappedMandatory(ORDER_ID), unmappedMandatory(CHANNEL), unmappedMandatory(SKU), unmappedMandatory(ITEM)];
    const atItem = error('unsupported-field', { kind: 'pointer', pointer: pointerTo(ITEM) });
    const expected = new Map<string, FieldStatus>([
      [ORDER_ID, 'error'],
      [CHANNEL, 'orphaned'],
      [SKU, 'unmapped-mandatory'],
      [ITEM, 'error'],
    ]);

    expect(fieldStatuses(working, [atT1, ...unmapped, atItem], structure)).toEqual(expected);
    expect(fieldStatuses(working, [...unmapped, atItem, atT1].reverse(), structure)).toEqual(expected);
  });
});

describe('the orphaned target field mappings (GLOSSARY, spec #104 story 46)', () => {
  test('are exactly the target field mappings whose field path the target structure lacks', () => {
    const working = model({
      [ORDER_ID]: copy('t1', ORDER_ID),
      [`${ORDER}/Missing`]: copy('t2', ORDER_ID),
      [DEEP_SKU]: copy('t3', ORDER_ID),
      [`${ITEM}/Item/Gone`]: copy('t4', ORDER_ID),
      [`${ORDER_ID}/Below`]: copy('t5', ORDER_ID),
      ['/Other']: copy('t6', ORDER_ID),
      [ORDER]: copy('t7', ORDER_ID),
      [`${ORDER}/Note`]: copy('t8', ORDER_ID),
      [`${ORDER}/Note/Text`]: copy('t9', ORDER_ID),
      ['/']: copy('t10', ORDER_ID),
    });

    expect(orphanedMappings(working, structure)).toEqual([
      `${ORDER}/Missing`,
      `${ITEM}/Item/Gone`,
      `${ORDER_ID}/Below`,
      '/Other',
      `${ORDER}/Note/Text`,
      '/',
    ]);
  });

  test('are none for a model without target field mappings', () => {
    expect(orphanedMappings({} as MappingModel, structure)).toEqual([]);
  });
});

describe('the orphaned source-field boxes (GLOSSARY: Orphaned reference, spec #104 story 45)', () => {
  test('are the source-field boxes of every target field mapping that read a field the source structure lacks', () => {
    const working = model({
      [ORDER_ID]: {
        id: 't1',
        result: 'f1',
        boxes: {
          f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'a2'] },
          a1: { kind: 'source', field: DEEP_SKU },
          a2: { kind: 'source', field: `${ORDER}/Gone` },
        },
      },
      [`${ORDER}/Missing`]: copy('t2', `${SKU}/Below`),
    });

    expect(orphanedBoxes(working, structure)).toEqual(new Set(['a2', 't2s']));
  });

  test('are none while the source structure is not loaded, and none for a model without target field mappings', () => {
    expect(orphanedBoxes(model({ [ORDER_ID]: copy('t1', `${ORDER}/Gone`) }), undefined)).toEqual(new Set());
    expect(orphanedBoxes({} as MappingModel, structure)).toEqual(new Set());
  });
});

describe('the target rows under a status filter (ADR-0012, spec #104 story 39)', () => {
  const statuses = new Map<string, FieldStatus>([
    [CHANNEL, 'error'],
    [ORDER_ID, 'mapped'],
    [`${ITEM}/Item/Sku`, 'error'],
    [ITEM, 'orphaned'],
    [`${ORDER}/Missing`, 'error'],
    [`${ORDER}/Note/Text`, 'error'],
    ['/', 'error'],
    [`${ORDER}/Gone/Deeper`, 'mapped'],
  ]);
  const shown = (filter: FieldStatus) => filteredRows(structure, statuses, filter).map((r) => [r.path, r.depth, r.expanded]);

  test('are the rows of that status with their ancestors, expanded down to them, in tree order', () => {
    expect(shown('error')).toEqual([
      [ORDER, 0, true],
      [CHANNEL, 1, false],
      [ITEM, 1, true],
      [`${ITEM}/Item`, 2, true],
      [`${ITEM}/Item/Sku`, 3, false],
    ]);
  });

  test('keep a structure field of that status collapsed when no row below it has that status', () => {
    expect(shown('orphaned')).toEqual([
      [ORDER, 0, true],
      [ITEM, 1, false],
    ]);
    expect(filteredRows(structure, statuses, 'orphaned')[1]!.expandable).toBe(true);
  });

  test('show no ancestor of a field the structure lacks', () => {
    expect(shown('mapped')).toEqual([
      [ORDER, 0, true],
      [ORDER_ID, 1, false],
    ]);
  });

  test('are none when no field has that status', () => {
    expect(shown('unmapped-mandatory')).toEqual([]);
  });

  test('show the root of that status expanded when a row below it has it too', () => {
    const both = new Map<string, FieldStatus>([
      [ORDER, 'mapped'],
      [ORDER_ID, 'mapped'],
    ]);
    expect(filteredRows(structure, both, 'mapped').map((r) => [r.path, r.expanded])).toEqual([
      [ORDER, true],
      [ORDER_ID, false],
    ]);
  });
});

describe('the field links under a status filter (ADR-0012, "Field links")', () => {
  const statuses = new Map<string, FieldStatus>([
    [CHANNEL, 'error'],
    [ORDER_ID, 'mapped'],
  ]);
  const links: FieldLink[] = [
    { source: CHANNEL, target: CHANNEL, boxes: 1 },
    { source: ORDER_ID, target: ORDER_ID, boxes: 2 },
    { source: SKU, target: SKU, boxes: 1 },
  ];

  test('are all links under "all"', () => {
    expect(filteredLinks(links, statuses, 'all')).toEqual(links);
  });

  test('are only the links to rows of that status, so a link to a hidden row is not drawn', () => {
    expect(filteredLinks(links, statuses, 'mapped')).toEqual([links[1]]);
    expect(filteredLinks(links, statuses, 'error')).toEqual([links[0]]);
    expect(filteredLinks(links, statuses, 'orphaned')).toEqual([]);
  });
});

describe('a status filter read from browser state', () => {
  test('is one of all, mapped, unmapped mandatory, orphaned and error', () => {
    for (const value of ['all', 'mapped', 'unmapped-mandatory', 'orphaned', 'error']) expect(isStatusFilter(value)).toBe(true);
    for (const value of [undefined, null, 'Mapped', 'unmapped', 3, {}]) expect(isStatusFilter(value)).toBe(false);
  });
});
