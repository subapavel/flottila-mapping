import { describe, expect, test } from 'vitest';
import type { FunctionCatalogue } from '../../api/client';
import { badges, paletteGroups } from './palette';

const exact = { level: 'exact' } as const;

const catalogue: FunctionCatalogue = {
  toUpperCase: { family: 'text', executionKind: 'single', portable: true, fidelity: { level: 'assumed' }, inputs: [{ name: 'a' }] },
  abs: { family: 'arithmetic', executionKind: 'single', portable: true, fidelity: exact, inputs: [{ name: 'a' }] },
  concat: { family: 'text', executionKind: 'single', portable: true, fidelity: exact, inputs: [{ name: 'a' }, { name: 'b' }] },
  divide: { family: 'arithmetic', executionKind: 'single', portable: false, fidelity: { level: 'deviation', text: 'rounds half even' } },
  constant: { family: 'constant', executionKind: 'single', portable: true, fidelity: exact, params: [{ name: 'value', type: 'string', default: '' }] },
};

const names = (groups: ReturnType<typeof paletteGroups>) => groups.map((g) => [g.family, g.entries.map((e) => e.fn)]);

describe('the palette', () => {
  test('groups the catalogue by function family, families and functions in name order', () => {
    expect(names(paletteGroups(catalogue, ''))).toEqual([
      ['arithmetic', ['abs', 'divide']],
      ['constant', ['constant']],
      ['text', ['concat', 'toUpperCase']],
    ]);
  });

  test('searches by function name, ignoring case and surrounding blanks', () => {
    expect(names(paletteGroups(catalogue, ' UPPER '))).toEqual([['text', ['toUpperCase']]]);
  });

  test('searches by family name, which keeps the whole family', () => {
    expect(names(paletteGroups(catalogue, 'arith'))).toEqual([['arithmetic', ['abs', 'divide']]]);
  });

  test('a search that matches nothing leaves no group', () => {
    expect(paletteGroups(catalogue, 'nothing')).toEqual([]);
  });

  test('each entry carries its badges', () => {
    expect(paletteGroups(catalogue, 'divide')[0]!.entries[0]).toEqual({
      fn: 'divide',
      badges: [{ kind: 'deviation', text: 'rounds half even' }, { kind: 'not-portable' }],
    });
  });
});

describe('the badges of a function', () => {
  test('an exact, portable function has none', () => {
    expect(badges(catalogue.abs!)).toEqual([]);
  });

  test('an assumed reading has the assumed badge', () => {
    expect(badges(catalogue.toUpperCase!)).toEqual([{ kind: 'assumed' }]);
  });

  test('a deviation has the deviation badge with its text, and a function that is not portable says so', () => {
    expect(badges(catalogue.divide!)).toEqual([{ kind: 'deviation', text: 'rounds half even' }, { kind: 'not-portable' }]);
    expect(badges({ ...catalogue.abs!, portable: false })).toEqual([{ kind: 'not-portable' }]);
  });
});
