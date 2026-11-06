import { describe, expect, test } from 'vitest';
import type { FunctionCatalogue } from '../../api/client';
import type { Box, TargetFieldMapping } from '../../generated/mapping-model';
import { cardHeights, SINK } from './graph';
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

/** A function with two inputs and two params, as tall as a card gets: a divide-like box with `pattern` and `mode`. */
const tall: FunctionCatalogue = {
  divide: {
    family: 'arithmetic',
    executionKind: 'single',
    portable: true,
    fidelity: { level: 'exact' },
    inputs: [{ name: 'dividend' }, { name: 'divisor' }],
    params: [
      { name: 'pattern', type: 'string', default: '0' },
      { name: 'mode', type: 'string', default: 'a' },
    ],
  },
};
const divide = (inputs: (string | null)[]): Box => ({ kind: 'function', fn: 'divide', inputs, params: { pattern: '0', mode: 'b' } });

/** Two positions overlap when their rectangles, of the heights given, share any area. */
const overlapping = (positions: Positions, heights: Record<string, number>) => {
  const h = (id: string) => heights[id] ?? BOX.height;
  const ids = Object.keys(positions);
  return ids.flatMap((a, i) =>
    ids.slice(i + 1).filter((b) => {
      const [p, q] = [positions[a]!, positions[b]!];
      return Math.abs(p.x - q.x) < BOX.width && p.y < q.y + h(b) && q.y < p.y + h(a);
    }).map((b) => `${a}/${b}`),
  );
};

describe('cards of different heights never overlap (spec #135)', () => {
  // a1 feeds d1, a tall card, which with a2 feeds f1: d1 and a2 share a column
  const graph: TargetFieldMapping = {
    id: 't1',
    result: 'f1',
    boxes: {
      a1: { kind: 'source', field: ORDER_ID },
      a2: { kind: 'source', field: ORDER_ID },
      d1: divide(['a1', null]),
      d2: divide(['a2', null]),
      f1: { kind: 'function', fn: 'concat', inputs: ['d1', 'd2'] },
    },
  };
  const heights = cardHeights(graph, tall, undefined);

  test('a tall card is taller than a source card', () => {
    expect(heights.d1).toBeGreaterThan(BOX.height + 16);
    expect(heights.a1).toBeLessThan(heights.d1!);
  });

  test('Arrange puts a 2-input, 2-param function next to a source box without intersecting it', () => {
    expect(overlapping(arrange(graph, heights), heights)).toEqual([]);
  });

  test('a new box placed next to its neighbour does not intersect the tall cards already there', () => {
    // d2 and a2 are new: d2 goes left of f1, into d1's column, and a2 left of d2
    const kept = arrange({ ...graph, boxes: { a1: graph.boxes.a1!, d1: graph.boxes.d1!, f1: { kind: 'function', fn: 'concat', inputs: ['d1'] } } }, heights);
    const placed = place(graph, kept, null, heights);

    expect(Object.keys(placed).sort()).toEqual([SINK, 'a1', 'a2', 'd1', 'd2', 'f1']);
    expect(overlapping(placed, heights)).toEqual([]);
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

  test('a new box without a placed neighbour goes left of the selected box; a selected box not placed counts as none', () => {
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim' } } };

    expect(place(added, kept, 'f1').n1).toEqual({ x: kept.f1!.x - (BOX.width + 64), y: kept.f1!.y });
    expect(place(added, kept, 'n9').n1).toEqual({ x: 0, y: 400 + BOX.height + 16 });
  });

  test('a new box with a placed neighbour goes next to it, not to the selected box', () => {
    const added: TargetFieldMapping = { ...mapping, boxes: { ...mapping.boxes, n1: { kind: 'function', fn: 'trim', inputs: ['c1'] } } };

    expect(place(added, kept, 'f1').n1).toEqual({ x: kept.c1!.x + BOX.width + 64, y: kept.c1!.y });
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
