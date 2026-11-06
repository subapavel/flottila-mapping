import { describe, expect, test } from 'vitest';
import type { TargetFieldMapping } from '../../generated/mapping-model';
import { SINK } from './graph';
import { arrange, BOX, place, type Positions } from './layout';

const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

/** OrderId and a constant into concat, which is the result; toUpperCase reads OrderId but feeds nothing. */
const mapping: TargetFieldMapping = {
  id: 't1',
  result: 'f1',
  boxes: {
    a1: { kind: 'source', field: ORDER_ID },
    c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
    f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] },
    u1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] },
  },
};

/** The same mapping with its boxes in reverse key order, as another file or edit history may hold them. */
const reordered: TargetFieldMapping = {
  ...mapping,
  boxes: Object.fromEntries(Object.entries(mapping.boxes).reverse()),
};

/** The mapping's boxes without u1. */
const withoutU1 = () => Object.fromEntries(Object.entries(mapping.boxes).filter(([id]) => id !== 'u1'));

/** Two positions overlap when their boxes share any area. */
const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < BOX.width && Math.abs(a.y - b.y) < BOX.height;

describe('the full layout (Arrange, and a graph opened without kept positions)', () => {
  test('is deterministic for the same model, whatever the order of its boxes', () => {
    expect(Object.keys(reordered.boxes)).toEqual(['u1', 'f1', 'c1', 'a1']);

    expect(arrange(reordered)).toEqual(arrange(mapping));
    expect(JSON.stringify(arrange(mapping))).toBe(JSON.stringify(arrange(structuredClone(mapping))));
  });

  test('places every box and the sink, flowing left to right into the sink, without overlap', () => {
    const positions = arrange(mapping);

    expect(Object.keys(positions).sort()).toEqual([SINK, 'a1', 'c1', 'f1', 'u1'].sort());
    expect(positions.a1!.x).toBeLessThan(positions.f1!.x);
    expect(positions.f1!.x).toBeLessThan(positions[SINK]!.x);
    const all = Object.values(positions);
    all.forEach((a, i) => all.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)));
  });

  test('a target field without a mapping has only its sink', () => {
    expect(Object.keys(arrange(undefined))).toEqual([SINK]);
  });
});

describe('the stable layout after open', () => {
  const kept: Positions = { a1: { x: 0, y: 0 }, c1: { x: 0, y: 200 }, f1: { x: 300, y: 100 }, u1: { x: 300, y: 400 }, [SINK]: { x: 800, y: 100 } };

  test('keeps the same positions when the model has the same boxes', () => {
    expect(place(mapping, kept)).toBe(kept);
  });

  test('keeps positions only for ids the model still has', () => {
    const boxes = withoutU1();

    expect(place({ ...mapping, boxes }, kept)).toEqual({ a1: kept.a1, c1: kept.c1, f1: kept.f1, [SINK]: kept[SINK] });
  });

  test('an id like an Object member is a box, not a kept position', () => {
    const constructor: TargetFieldMapping = {
      id: 't1',
      result: 'constructor',
      boxes: Object.fromEntries([['constructor', { kind: 'source', field: ORDER_ID }]]),
    };

    expect(place(constructor, { [SINK]: { x: 600, y: 100 } })).toEqual({ [SINK]: { x: 600, y: 100 }, constructor: { x: 600 - (BOX.width + 64), y: 100 } });
  });

  test('a box replaced by another, as many ids as kept, places the new one and drops the old', () => {
    const boxes = withoutU1();
    const swapped: TargetFieldMapping = { ...mapping, boxes: { ...boxes, n1: { kind: 'function', fn: 'trim', inputs: ['c1'] } } };

    const positions = place(swapped, kept);

    expect(Object.keys(positions).sort()).toEqual([SINK, 'a1', 'c1', 'f1', 'n1'].sort());
    expect(positions.n1).toEqual({ x: kept.c1!.x + BOX.width + 64, y: kept.c1!.y });
  });

  test('a new box that feeds a box goes left of it, and the existing boxes keep their positions', () => {
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim' }, u1: { kind: 'function', fn: 'toUpperCase', inputs: ['n1'] } } };

    const positions = place(added, kept);

    expect(positions).toEqual({ ...kept, n1: { x: kept.u1!.x - (BOX.width + 64), y: kept.u1!.y } });
  });

  test('a new box that is the result goes left of the sink', () => {
    const added: TargetFieldMapping = { ...mapping, result: 'n1', boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim' } } };

    expect(place(added, kept).n1).toEqual({ x: kept[SINK]!.x - (BOX.width + 64), y: kept[SINK]!.y });
  });

  test('a new box fed by a box goes right of it', () => {
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim', inputs: ['c1'] } } };

    expect(place(added, kept).n1).toEqual({ x: kept.c1!.x + BOX.width + 64, y: kept.c1!.y });
  });

  test('a new box without a placed neighbour goes below the boxes, at the left edge', () => {
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim' } } };

    expect(place(added, kept).n1).toEqual({ x: 0, y: 400 + BOX.height + 16 });
  });

  test('a new box whose spot is taken moves down until it is free', () => {
    const crowded: Positions = { ...kept, u1: { x: BOX.width + 64, y: 220 } };
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim', inputs: ['c1'] } } };

    const n1 = place(added, crowded).n1!;

    expect(n1.x).toBe(kept.c1!.x + BOX.width + 64);
    expect(Object.entries(crowded).some(([, p]) => overlap(p, n1))).toBe(false);
    expect(n1.y).toBe(200 + 2 * (BOX.height + 16));
  });

  test('with nothing kept, the boxes are placed from the origin', () => {
    const positions = place(mapping, {});

    expect(Object.keys(positions).sort()).toEqual([SINK, 'a1', 'c1', 'f1', 'u1'].sort());
    expect(positions.a1).toEqual({ x: 0, y: 0 });
  });
});
