import { describe, expect, test } from 'vitest';
import type { components } from '../../generated/api';
import type { MappingModel, TargetFieldMapping } from '../../generated/mapping-model';
import { anchorLinks, fieldLinks, linkGutter, rowAnchors, type AnchoredLink, type FieldLink } from './links';
import { treeRows } from './rows';

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

/** Order holds @channel, OrderId and Item; Item holds Sku and another Item (a recursive type, ADR-0008). */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Q{http://a/b}Order', { namespace: 'http://a/b', localName: 'Order', type: 'order' }),
  types: {
    order: [field('@channel'), field('OrderId'), field('Item', { type: 'item' })],
    item: [field('Sku'), field('Item', { type: 'item' })],
  },
};

const ORDER = '/Q{http://a/b}Order';
const CHANNEL = `${ORDER}/@channel`;
const ORDER_ID = `${ORDER}/OrderId`;
const ITEM = `${ORDER}/Item`;

describe('the field links of a model (ADR-0012, "Field links")', () => {
  const model = (targetFieldMappings: Record<string, TargetFieldMapping>): MappingModel =>
    ({ targetFieldMappings }) as unknown as MappingModel;
  const source = (path: string) => ({ kind: 'source' as const, field: path });
  const fn = (inputs: (string | null)[]) => ({ kind: 'function' as const, fn: 'concat', inputs });

  test('are none for a model without target field mappings', () => {
    expect(fieldLinks({} as MappingModel)).toEqual([]);
  });

  test('are one per pair of source and target field, counting the source-field boxes result reaches', () => {
    const links = fieldLinks(
      model({
        [ORDER_ID]: {
          id: 't1',
          result: 'f1',
          boxes: {
            f1: fn(['a1', 'f2', 'a3', null]),
            f2: fn(['a1', 'a2']),
            a1: source(CHANNEL),
            a2: source(CHANNEL),
            a3: source(`${ITEM}/Sku`),
            a4: source(CHANNEL),
          },
        },
        [CHANNEL]: { id: 't2', result: 'a1', boxes: { a1: source(CHANNEL) } },
        [ITEM]: { id: 't3', result: null, boxes: { a1: source(ITEM) } },
      }),
    );

    expect(links).toEqual<FieldLink[]>([
      { source: CHANNEL, target: ORDER_ID, boxes: 2 },
      { source: `${ITEM}/Sku`, target: ORDER_ID, boxes: 1 },
      { source: CHANNEL, target: CHANNEL, boxes: 1 },
    ]);
  });

  test('mark a link when a reached source-field box behind it has a context that is not the parent (ADR-0012)', () => {
    const SKU = `${ITEM}/Sku`;
    const links = fieldLinks(
      model({
        [ORDER_ID]: {
          id: 't1',
          result: 'f1',
          boxes: {
            f1: fn(['a1', 'a2', 'a3']),
            a1: source(SKU),
            a2: { ...source(SKU), context: ORDER },
            // a context equal to the parent, written out by hand, is the parent
            a3: { ...source(CHANNEL), context: ORDER },
            // an unreachable box marks nothing
            a4: { ...source(`${ORDER}/OrderId`), context: '/Q{http://a/b}Elsewhere' },
          },
        },
        [CHANNEL]: { id: 't2', result: 'a5', boxes: { a5: { ...source(SKU), context: ITEM } } },
      }),
    );

    expect(links.map((l) => [l.source, l.target, l.contextChanged])).toEqual([
      [SKU, ORDER_ID, true],
      [CHANNEL, ORDER_ID, undefined],
      [SKU, CHANNEL, undefined],
    ]);
  });
});

describe('where a field link ends in a tree', () => {
  const anchor = (expanded: string[]) => rowAnchors(structure, treeRows(structure, new Set(expanded)));

  test('is the field’s own row when it is visible', () => {
    expect(anchor([ORDER])(ORDER_ID)).toEqual({ index: 2, dashed: false });
  });

  test('is the nearest visible ancestor’s row, dashed, when the field is in a collapsed branch', () => {
    expect(anchor([ORDER])(`${ITEM}/Item/Sku`)).toEqual({ index: 3, dashed: true });
    expect(anchor([])(CHANNEL)).toEqual({ index: 0, dashed: true });
  });

  test('is a row of a recursive type as deep as it is expanded', () => {
    expect(anchor([ORDER, ITEM, `${ITEM}/Item`])(`${ITEM}/Item/Sku`)).toEqual({ index: 6, dashed: false });
  });

  test('is none for a field the structure does not have', () => {
    const at = anchor([ORDER, ITEM]);

    expect(at(`${ORDER}/Gone`)).toBeUndefined();
    expect(at(`${ITEM}/Sku/Deeper`)).toBeUndefined();
    expect(at('/Q{http://a/b}Invoice/OrderId')).toBeUndefined();
    expect(at('')).toBeUndefined();
  });

  test('is none below a structure field whose type lists no fields', () => {
    const empty: StructureLoaded = { ...structure, types: {} };

    expect(rowAnchors(empty, treeRows(empty, new Set([ORDER])))(ORDER_ID)).toBeUndefined();
  });
});

describe('anchored field links', () => {
  test('keep a link whose ends both have a row and drop one with an end the tree does not have', () => {
    const links: FieldLink[] = [
      { source: ORDER_ID, target: CHANNEL, boxes: 1 },
      { source: `${ORDER}/Gone`, target: CHANNEL, boxes: 1 },
      { source: ORDER_ID, target: `${ORDER}/Gone`, boxes: 1 },
    ];
    const at = rowAnchors(structure, treeRows(structure, new Set([ORDER])));

    expect(anchorLinks(links, at, at)).toEqual<AnchoredLink[]>([
      { source: ORDER_ID, target: CHANNEL, boxes: 1, from: { index: 2, dashed: false }, to: { index: 1, dashed: false } },
    ]);
  });
});

describe('the link gutter (ADR-0012)', () => {
  const ROW = 20;
  /** Five rows fit in a viewport of 100 px. */
  const view = (scrollTop: number) => ({ scrollTop, height: 100 });
  const link = (from: number, to: number, extra: Partial<AnchoredLink> = {}): AnchoredLink => ({
    source: `s${from}`,
    target: `t${to}`,
    boxes: 1,
    from: { index: from, dashed: false },
    to: { index: to, dashed: false },
    ...extra,
  });

  test('draws a link between two visible rows at their centres, minus the scroll offset', () => {
    const gutter = linkGutter([link(1, 3)], view(0), view(20), ROW, null);

    expect(gutter.lines).toEqual([
      { source: 's1', target: 't3', boxes: 1, y1: 30, y2: 50, dashed: false, emphasis: 'plain' },
    ]);
    expect(gutter.counts).toEqual({ source: { above: 0, below: 0 }, target: { above: 0, below: 0 } });
  });

  test('counts a row whose centre is exactly at an edge as visible', () => {
    const gutter = linkGutter([link(0, 5)], view(10), view(10), ROW, null);

    expect(gutter.lines.map((l) => [l.y1, l.y2, l.sourceEdge, l.targetEdge])).toEqual([[0, 100, undefined, undefined]]);
  });

  test('ends a link to a row scrolled above or below at the gutter edge and counts it there', () => {
    const gutter = linkGutter([link(0, 2), link(2, 9), link(3, 0), link(12, 1)], view(40), view(0), ROW, null);

    expect(gutter.lines.map((l) => [l.source, l.y1, l.sourceEdge, l.y2, l.targetEdge])).toEqual([
      ['s0', 0, 'above', 50, undefined],
      ['s2', 10, undefined, 100, 'below'],
      ['s3', 30, undefined, 10, undefined],
      ['s12', 100, 'below', 30, undefined],
    ]);
    expect(gutter.counts).toEqual({ source: { above: 1, below: 1 }, target: { above: 0, below: 1 } });
  });

  test('draws no link whose ends are both scrolled away, and counts none', () => {
    const gutter = linkGutter([link(0, 9), link(20, 0), link(9, 9)], view(40), view(40), ROW, null);

    expect(gutter.lines).toEqual([]);
    expect(gutter.counts).toEqual({ source: { above: 0, below: 0 }, target: { above: 0, below: 0 } });
  });

  test('dashes a link that ends at a collapsed row’s visible ancestor, on either side', () => {
    const gutter = linkGutter(
      [link(1, 1, { from: { index: 1, dashed: true } }), link(2, 2, { to: { index: 2, dashed: true } }), link(3, 3)],
      view(0),
      view(0),
      ROW,
      null,
    );

    expect(gutter.lines.map((l) => l.dashed)).toEqual([true, true, false]);
  });

  test('highlights the selected target field’s links and dims the others', () => {
    const gutter = linkGutter([link(1, 1), link(2, 3), link(3, 3)], view(0), view(0), ROW, 't3');

    expect(gutter.lines.map((l) => [l.source, l.emphasis])).toEqual([
      ['s1', 'dimmed'],
      ['s2', 'highlighted'],
      ['s3', 'highlighted'],
    ]);
  });

  test('keeps the fx count of a link with several source-field boxes', () => {
    const gutter = linkGutter([link(1, 1, { boxes: 3 })], view(0), view(0), ROW, null);

    expect(gutter.lines[0]!.boxes).toBe(3);
  });

  test('keeps the mark of a link with a changed context', () => {
    const gutter = linkGutter([link(1, 1, { contextChanged: true }), link(2, 2)], view(0), view(0), ROW, null);

    expect(gutter.lines.map((l) => l.contextChanged)).toEqual([true, undefined]);
  });
});
