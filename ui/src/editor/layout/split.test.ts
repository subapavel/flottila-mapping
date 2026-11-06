import { describe, expect, test } from 'vitest';
import { dragged, keyed, readSplit, shown, type Split, type SplitRules } from './split';

// The halves collapse either way; Enter collapses the top one. The inspector collapses only itself, the end pane.
const HALVES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
const INSPECTOR: SplitRules = { initial: 0.7, collapsible: ['end'] };
const open = (ratio: number): Split => ({ ratio, collapsed: null });

describe('a splitter by keyboard', () => {
  test('the arrows of its orientation move it by 5 %, and other keys leave it to the page', () => {
    expect(keyed(open(0.5), 'ArrowDown', HALVES, 'horizontal')).toEqual(open(0.55));
    expect(keyed(open(0.5), 'ArrowUp', HALVES, 'horizontal')).toEqual(open(0.45));
    expect(keyed(open(0.7), 'ArrowRight', INSPECTOR, 'vertical')).toEqual(open(0.75));
    expect(keyed(open(0.7), 'ArrowLeft', INSPECTOR, 'vertical')).toEqual(open(0.65));
    expect(keyed(open(0.5), 'ArrowLeft', HALVES, 'horizontal')).toBeUndefined();
    expect(keyed(open(0.5), 'ArrowDown', INSPECTOR, 'vertical')).toBeUndefined();
    expect(keyed(open(0.5), 'a', HALVES, 'horizontal')).toBeUndefined();
  });

  test('a step past the smallest share collapses a collapsible pane and keeps the ratio to restore', () => {
    expect(keyed(open(0.1), 'ArrowUp', HALVES, 'horizontal')).toEqual({ ratio: 0.1, collapsed: 'start' });
    expect(keyed(open(0.9), 'ArrowDown', HALVES, 'horizontal')).toEqual({ ratio: 0.9, collapsed: 'end' });
    expect(keyed(open(0.9), 'ArrowRight', INSPECTOR, 'vertical')).toEqual({ ratio: 0.9, collapsed: 'end' });
  });

  test('a pane that cannot collapse stops at the smallest share', () => {
    expect(keyed(open(0.1), 'ArrowLeft', INSPECTOR, 'vertical')).toEqual(open(0.1));
    expect(keyed(open(0.6), 'Home', INSPECTOR, 'vertical')).toEqual(open(0.1));
  });

  test('Home and End collapse the pane before and after it', () => {
    expect(keyed(open(0.4), 'Home', HALVES, 'horizontal')).toEqual({ ratio: 0.4, collapsed: 'start' });
    expect(keyed(open(0.4), 'End', HALVES, 'horizontal')).toEqual({ ratio: 0.4, collapsed: 'end' });
  });

  test('an arrow on a collapsed splitter moves it out from the edge', () => {
    expect(keyed({ ratio: 0.4, collapsed: 'start' }, 'ArrowDown', HALVES, 'horizontal')).toEqual(open(0.1));
    expect(keyed({ ratio: 0.4, collapsed: 'start' }, 'ArrowUp', HALVES, 'horizontal')).toEqual({ ratio: 0.4, collapsed: 'start' });
    expect(keyed({ ratio: 0.6, collapsed: 'end' }, 'ArrowLeft', INSPECTOR, 'vertical')).toEqual(open(0.9));
  });

  test('Enter collapses its first collapsible pane, and restores the kept ratio', () => {
    expect(keyed(open(0.4), 'Enter', HALVES, 'horizontal')).toEqual({ ratio: 0.4, collapsed: 'start' });
    expect(keyed(open(0.6), 'Enter', INSPECTOR, 'vertical')).toEqual({ ratio: 0.6, collapsed: 'end' });
    expect(keyed({ ratio: 0.4, collapsed: 'end' }, 'Enter', HALVES, 'horizontal')).toEqual(open(0.4));
  });
});

describe('a splitter by pointer', () => {
  test('sets the ratio where it is dropped, rounded to a percent', () => {
    expect(dragged(open(0.5), 0.3333, HALVES)).toEqual(open(0.33));
  });

  test('dropped near an edge, collapses that pane if it can, else stops at the smallest share', () => {
    expect(dragged(open(0.5), 0.02, HALVES)).toEqual({ ratio: 0.5, collapsed: 'start' });
    expect(dragged(open(0.5), 0.97, HALVES)).toEqual({ ratio: 0.5, collapsed: 'end' });
    expect(dragged(open(0.5), 0.02, INSPECTOR)).toEqual(open(0.1));
    expect(dragged(open(0.5), 0.97, { initial: 0.5, collapsible: ['start'] })).toEqual(open(0.9));
  });
});

describe('the share shown', () => {
  test('is the ratio, 0 with the start pane collapsed and 1 with the end pane collapsed', () => {
    expect(shown(open(0.4))).toBe(0.4);
    expect(shown({ ratio: 0.4, collapsed: 'start' })).toBe(0);
    expect(shown({ ratio: 0.4, collapsed: 'end' })).toBe(1);
  });
});

describe('a kept splitter read back', () => {
  test('is taken as kept', () => {
    expect(readSplit({ ratio: 0.3, collapsed: 'end' }, HALVES)).toEqual({ ratio: 0.3, collapsed: 'end' });
    expect(readSplit({ ratio: 0.3, collapsed: null }, INSPECTOR)).toEqual(open(0.3));
  });

  test('falls back to the initial ratio when it is missing, malformed or out of range', () => {
    for (const kept of [
      undefined,
      null,
      0.3,
      { ratio: '0.3', collapsed: null },
      { ratio: 0.05, collapsed: null },
      { ratio: 0.95, collapsed: null },
      { ratio: Number.NaN, collapsed: null },
      { ratio: 0.3, collapsed: 'middle' },
      { ratio: 0.3 },
      // the inspector cannot collapse its start pane
      { ratio: 0.3, collapsed: 'start' },
    ]) {
      expect(readSplit(kept, INSPECTOR), JSON.stringify(kept)).toEqual(open(0.7));
    }
  });
});
