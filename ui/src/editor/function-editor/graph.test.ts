import { describe, expect, test } from 'vitest';
import type { FunctionCatalogue } from '../../api/client';
import type { Box, TargetFieldMapping } from '../../generated/mapping-model';
import { localPath } from '../../model/field-path';
import { boxIds, boxView, CARD_HEIGHT, cardHeights, cardView, liveMarks, SINK, wires } from './graph';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;

/** OrderId and a constant into concat, which is the result; toUpperCase reads OrderId but feeds nothing. */
const mapping: TargetFieldMapping = {
  id: 't1',
  result: 'f1',
  boxes: {
    u1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] },
    f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] },
    c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
    a1: { kind: 'source', field: ORDER_ID },
  },
};

const catalogue: FunctionCatalogue = {
  concat: {
    family: 'text',
    executionKind: 'single',
    portable: true,
    fidelity: { level: 'assumed' },
    inputs: [{ name: 'a' }, { name: 'b' }],
  },
};

describe('the function graph of a target field mapping', () => {
  test('lists the boxes in sorted authoring id order', () => {
    expect(boxIds(mapping)).toEqual(['a1', 'c1', 'f1', 'u1']);
    expect(boxIds(undefined)).toEqual([]);
  });

  test('has one wire per used input slot and one from result into the sink', () => {
    expect(wires(mapping)).toEqual([
      { id: 'a1->f1#0', source: 'a1', target: 'f1', slot: 0 },
      { id: 'c1->f1#1', source: 'c1', target: 'f1', slot: 1 },
      { id: 'a1->u1#0', source: 'a1', target: 'u1', slot: 0 },
      { id: `f1->${SINK}`, source: 'f1', target: SINK },
    ]);
  });

  test('an unconnected input slot and a null result have no wire', () => {
    const unfinished: TargetFieldMapping = { id: 't1', result: null, boxes: { f1: { kind: 'function', fn: 'concat', inputs: [null, 'a1'] }, a1: { kind: 'source', field: ORDER_ID } } };

    expect(wires(unfinished)).toEqual([{ id: 'a1->f1#1', source: 'a1', target: 'f1', slot: 1 }]);
    expect(wires(undefined)).toEqual([]);
  });
});

describe('the view of a box', () => {
  test('a source-field box shows its field as a local path, the full path as its tooltip, and has no input slot', () => {
    const field = `${ORDER}/@Q{urn:x/y}channel`;

    expect(boxView({ kind: 'source', field }, catalogue, undefined)).toEqual({ title: 'Order/@channel', path: field, slots: [] });
  });

  test('a source-field box reading an escaped JSON property shows its names as the source tree does', () => {
    const field = '/$/order/a%2Fb%25%40%7B%7D';

    expect(boxView({ kind: 'source', field }, catalogue, undefined).title).toBe('$/order/a/b%@{}');
    expect(boxView({ kind: 'source', field }, catalogue, undefined).title).toBe(localPath(field));
  });

  test('a function box shows its function and the catalogue names of its input slots', () => {
    expect(boxView({ kind: 'function', fn: 'concat', inputs: ['a1'] }, catalogue, undefined)).toEqual({ title: 'concat', slots: ['a', 'b'] });
  });

  test('a function box the catalogue lacks numbers the slots its model has', () => {
    expect(boxView({ kind: 'function', fn: 'gone', inputs: ['a1', null] }, catalogue, undefined)).toEqual({ title: 'gone', slots: ['1', '2'] });
    expect(boxView({ kind: 'function', fn: 'gone' }, catalogue, undefined)).toEqual({ title: 'gone', slots: [] });
  });

  test('a udf box takes its slot names from the declaration, an unresolved box shows its name', () => {
    const udfs = { trim2: { executionKind: 'single' as const, inputs: ['text'], source: 'x' } };

    expect(boxView({ kind: 'udf', udf: 'trim2', inputs: [null] }, catalogue, udfs)).toEqual({ title: 'trim2', slots: ['text'] });
    expect(boxView({ kind: 'udf', udf: 'other', inputs: [null] }, catalogue, udfs)).toEqual({ title: 'other', slots: ['1'] });
    expect(boxView({ kind: 'unresolved', name: 'ns:fn', origin: 'po', inputs: ['a1'] }, catalogue, udfs)).toEqual({ title: 'ns:fn', slots: ['1'] });
  });
});

describe('the value of a constant box', () => {
  test('is its value param as JSON, and "" (the default) when the param is left out', () => {
    expect(boxView(mapping.boxes.c1!, catalogue, undefined)).toEqual({ title: 'constant', slots: [], value: '"-"' });
    expect(boxView({ kind: 'function', fn: 'constant' }, catalogue, undefined).value).toBe('""');
  });

  test('another box has none', () => {
    expect(boxView({ kind: 'function', fn: 'concat', params: { value: 'x' } }, catalogue, undefined).value).toBeUndefined();
  });
});

describe('the card of a box (spec #135)', () => {
  const cards: FunctionCatalogue = {
    ...catalogue,
    divide: { family: 'arithmetic', executionKind: 'single', portable: true, fidelity: { level: 'deviation', text: 'scale' } },
    abs: { family: 'arithmetic', executionKind: 'single', portable: false, fidelity: { level: 'exact' } },
    formatNum: {
      family: 'text',
      executionKind: 'single',
      portable: true,
      fidelity: { level: 'exact' },
      params: [
        { name: 'pattern', type: 'string', default: '0' },
        { name: 'mode', type: 'string', default: 'a', values: ['a', 'b'] },
        { name: 'map', type: 'table', default: {} },
      ],
    },
  };

  test('a source-field box is captioned and shows its context: the parent, or the one the model names', () => {
    expect(cardView({ kind: 'source', field: ORDER_ID }, cards)).toEqual({
      kind: 'source',
      caption: 'source field',
      badges: [],
      params: [],
      context: { value: ORDER, choices: [{ path: ORDER, label: 'Order (parent)' }] },
    });
    const deep = cardView({ kind: 'source', field: `${ORDER}/A/B` }, cards).context!;
    expect(deep.value).toBe(`${ORDER}/A`);
    expect(deep.choices).toEqual([
      { path: `${ORDER}/A`, label: 'A (parent)' },
      { path: ORDER, label: 'Order' },
    ]);
    expect(cardView({ kind: 'source', field: `${ORDER}/A/B`, context: ORDER }, cards).context!.value).toBe(ORDER);
  });

  test('a field with no proper ancestor offers itself as its context', () => {
    expect(cardView({ kind: 'source', field: ORDER }, cards).context).toEqual({ value: ORDER, choices: [{ path: ORDER, label: 'Order (parent)' }] });
  });

  test('a function box shows the fidelity badges of its entry, but not "not portable"', () => {
    expect(cardView({ kind: 'function', fn: 'divide' }, cards)).toEqual({
      kind: 'function',
      caption: 'fn',
      badges: [{ kind: 'deviation', text: 'scale' }],
      params: [],
    });
    expect(cardView({ kind: 'function', fn: 'concat' }, cards).badges).toEqual([{ kind: 'assumed' }]);
    expect(cardView({ kind: 'function', fn: 'abs' }, cards).badges).toEqual([]);
    expect(cardView({ kind: 'function', fn: 'gone' }, cards).badges).toEqual([]);
  });

  test('its params are text, or a table by its size; a constant leaves its value to the box', () => {
    expect(cardView({ kind: 'function', fn: 'formatNum', params: { pattern: '0', mode: 'b', extra: 'x', map: { A: 'B', C: 'D' } } }, cards).params).toEqual([
      { name: 'pattern', text: '0', table: false, editable: true, values: undefined },
      { name: 'mode', text: 'b', table: false, editable: true, values: ['a', 'b'] },
      { name: 'extra', text: 'x', table: false, editable: false, values: undefined },
      { name: 'map', text: 'table, 2 rows', table: true, editable: false },
    ]);
    expect(cardView({ kind: 'function', fn: 'constant', params: { value: '-' } }, cards).params).toEqual([]);
  });

  test('a UDF box and an unresolved box have their own captions, and no badges', () => {
    expect(cardView({ kind: 'udf', udf: 'shout', params: { loud: 'yes' } }, cards)).toEqual({
      kind: 'udf',
      caption: 'UDF',
      badges: [],
      params: [{ name: 'loud', text: 'yes', table: false, editable: false, values: undefined }],
    });
    expect(cardView({ kind: 'unresolved', name: 'x', origin: 'po' }, cards)).toEqual({ kind: 'unresolved', caption: 'unresolved', badges: [], params: [] });
  });
});

describe("a card's height for the layout (spec #135), one term at a time", () => {
  const deviating: FunctionCatalogue = { divide: { family: 'arithmetic', executionKind: 'single', portable: true, fidelity: { level: 'deviation', text: 'scale' } } };
  const { base, marks, row, context, value, slack } = CARD_HEIGHT;
  /** Every card: its name line and id, and the marks line it keeps whether it has marks or not. */
  const head = base + marks;
  const heightOf = (box: Box, orphaned: ReadonlySet<string> = new Set()) => cardHeights({ id: 't1', result: null, boxes: { b1: box } }, deviating, undefined, orphaned).b1;

  test('a card with only its head and id is the base, the marks line (reserved even without a mark) and the slack', () => {
    expect(heightOf({ kind: 'unresolved', name: 'x', origin: 'po' })).toBe(base + marks + slack);
  });

  test('each input slot and each param is a row', () => {
    expect(heightOf({ kind: 'unresolved', name: 'x', origin: 'po', inputs: [null, null], params: { p: 'x' } })).toBe(head + 3 * row + slack);
  });

  test("a source card's context select is its own term", () => {
    expect(heightOf({ kind: 'source', field: ORDER_ID })).toBe(head + context + slack);
  });

  test("a constant's value is its own term", () => {
    expect(heightOf({ kind: 'function', fn: 'constant', params: { value: '-' } })).toBe(head + value + slack);
  });

  test('fidelity badges add no height: they go on the marks line every card keeps', () => {
    expect(cardView({ kind: 'function', fn: 'divide' }, deviating).badges).toEqual([{ kind: 'deviation', text: 'scale' }]);
    expect(heightOf({ kind: 'function', fn: 'divide' })).toBe(head + slack);
  });

  test('an orphaned box has a row for its Orphaned mark', () => {
    expect(heightOf({ kind: 'source', field: ORDER_ID }, new Set(['b1']))).toBe(head + context + row + slack);
  });
});

describe('the live marks (ADR-0013)', () => {
  test('a null result and each input slot that reads no box are marked, absent slots included', () => {
    const unfinished: TargetFieldMapping = {
      id: 't1',
      result: null,
      boxes: {
        a1: { kind: 'source', field: ORDER_ID },
        f1: { kind: 'function', fn: 'concat', inputs: [null, 'a1'] },
        f2: { kind: 'function', fn: 'concat' },
        f3: { kind: 'function', fn: 'concat', inputs: ['a1', 'a1'] },
      },
    };

    expect(liveMarks(unfinished, catalogue, undefined)).toEqual({ resultUnconnected: true, unconnectedInputs: { f1: [0], f2: [0, 1] } });
  });

  test('a finished graph has no mark', () => {
    expect(liveMarks({ ...mapping, boxes: { ...mapping.boxes, u1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] } } }, catalogue, undefined)).toEqual({
      resultUnconnected: false,
      unconnectedInputs: {},
    });
  });
});
