import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import { MappingEditor } from '../index';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;
const DRAFT = 'drafts/keyboard';
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

/** OrderId and a constant into concat, which is the result; toUpperCase reads OrderId but feeds nothing. */
const graphMapping: MappingModel = {
  ...corpusMapping,
  targetFieldMappings: {
    [ORDER_ID]: {
      id: 't1',
      result: 'f1',
      boxes: {
        a1: { kind: 'source', field: ORDER_ID },
        c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
        f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] },
        u1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] },
      },
    },
  },
};

const box = (id: string) => page.getByTestId(`box:${id}`);
const node = (id: string) => page.getByTestId(`rf__node-${id}`);
const canvas = (field: string) => page.getByTestId(`canvas:${field}`);
const quickInsert = () => page.getByRole('combobox', { name: 'Quick insert' });
const option = (fn: string) => page.getByRole('option', { name: fn, exact: true });
const boxIdsShown = () => page.getByTestId(/^box:/).elements().map((e) => e.dataset.testid!.slice('box:'.length));
const edgeIds = () => page.getByTestId(/^rf__edge-/).elements().map((e) => e.dataset.testid!.slice('rf__edge-'.length)).sort();
const titleOf = (id: string) => box(id).element().querySelector('strong')!.textContent;
const activeTestId = () => (document.activeElement as HTMLElement | null)?.dataset.testid;
/** The x and y of a node's `translate(xpx, ypx)`. */
const xyOf = (id: string) => {
  const [, x, y] = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec((node(id).element() as HTMLElement).style.transform)!;
  return { x: Number(x), y: Number(y) };
};

/** Presses Tab until the element with `testId` has the focus, as a keyboard user would. */
async function tabTo(testId: string) {
  for (let i = 0; i < 200 && activeTestId() !== testId; i++) await userEvent.tab();
  expect(activeTestId()).toBe(testId);
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(model: MappingModel = graphMapping, field: string = ORDER_ID) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={DRAFT} api={fakeApiClient({ [DRAFT]: model })} browserState={{ read: () => undefined, write: () => {} }} selectedField={field} />);
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('quick insert', () => {
  test('/ on the canvas opens it; it searches by name and by family; Escape closes it, inserts nothing and gives the focus back', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    (canvas(ORDER_ID).element() as HTMLElement).focus();

    await userEvent.keyboard('/');

    await expect.element(quickInsert()).toHaveFocus();
    await expect.element(quickInsert()).toHaveValue('');
    await expect.element(option('abs')).toBeVisible();
    await userEvent.keyboard('UPPER');
    await expect.element(option('toUpperCase')).toBeVisible();
    await expect.element(option('abs')).not.toBeInTheDocument();
    await userEvent.fill(quickInsert(), 'statistic');
    await expect.poll(() => page.getByRole('option').elements().map((e) => e.textContent)).toEqual(['average', 'count', 'counter', 'index', 'sum']);
    await expect.element(page.getByRole('group', { name: 'statistic' }).getByRole('option', { name: 'sum' })).toBeVisible();

    await userEvent.keyboard('{Escape}');

    await expect.element(quickInsert()).not.toBeInTheDocument();
    expect(boxIdsShown()).toHaveLength(4);
    await expect.element(canvas(ORDER_ID)).toHaveFocus();
  });

  test('typing on the canvas opens it with what was typed; Enter inserts the active option, the arrows move it', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    (canvas(ORDER_ID).element() as HTMLElement).focus();

    await userEvent.keyboard('constant');

    await expect.element(quickInsert()).toHaveValue('constant');
    await expect.element(option('constant')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect.element(option('copyValue')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect.element(option('constant')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect.element(quickInsert()).not.toBeInTheDocument();
    await expect.poll(boxIdsShown).toHaveLength(5);
    const added = boxIdsShown().find((id) => !['a1', 'c1', 'f1', 'u1'].includes(id))!;
    expect(titleOf(added)).toBe('copyValue');
    await expect.element(canvas(ORDER_ID)).toHaveFocus();
    await expect.element(page.getByText('Unsaved')).toBeVisible();
  });

  test('Enter with no match inserts nothing and keeps it open; leaving it closes it; clicking an option inserts it', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    (canvas(ORDER_ID).element() as HTMLElement).focus();
    await userEvent.keyboard('/zzz{Enter}');
    await expect.element(quickInsert()).toBeVisible();
    await expect.element(quickInsert()).not.toHaveAttribute('aria-activedescendant');
    expect(boxIdsShown()).toHaveLength(4);

    await box('u1').click();
    await expect.element(quickInsert()).not.toBeInTheDocument();
    // the box clicked keeps the focus
    await expect.element(node('u1')).toHaveFocus();

    await userEvent.keyboard('/');
    await userEvent.fill(quickInsert(), 'trim');
    await option('trim').click();

    await expect.poll(boxIdsShown).toHaveLength(5);
    await expect.element(quickInsert()).not.toBeInTheDocument();
  });

  test('inserts the function left of the selected box', async () => {
    render();
    // a1 is the leftmost box: the spot left of it is free
    await box('a1').click();
    const selected = xyOf('a1');

    await userEvent.keyboard('/trim{Enter}');

    await expect.poll(boxIdsShown).toHaveLength(5);
    const added = boxIdsShown().find((id) => !['a1', 'c1', 'f1', 'u1'].includes(id))!;
    expect(xyOf(added).y).toBe(selected.y);
    expect(xyOf(added).x).toBeLessThan(selected.x);
  });

  test('Ctrl and Meta with a key, and Space, open nothing: Ctrl+Z still undoes', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    await box('c1').click();
    await userEvent.keyboard('{Delete}');
    await expect.element(box('c1')).not.toBeInTheDocument();

    await userEvent.keyboard('{Meta>}k{/Meta} ');
    await userEvent.keyboard('{Control>}z{/Control}');

    await expect.element(box('c1')).toBeVisible();
    expect(quickInsert().query()).toBeNull();
  });
});

describe('the keyboard-only path', () => {
  test('inserts a function and a constant into a field without a mapping, selects a box and deletes it, with no pointer event', async () => {
    const pointers: string[] = [];
    const record = (event: Event) => void pointers.push(event.type);
    for (const type of ['pointerdown', 'mousedown', 'click']) document.addEventListener(type, record, true);
    try {
      render(corpusMapping, NOTE);
      await expect.element(page.getByText('Note has no function graph yet.')).toBeVisible();

      await tabTo(`canvas:${NOTE}`);
      await userEvent.keyboard('/concat');
      await expect.element(option('concat')).toBeVisible();
      await userEvent.keyboard('{Enter}');
      await expect.poll(boxIdsShown).toHaveLength(1);
      const [concat] = boxIdsShown();
      await userEvent.keyboard('constant');
      await expect.element(option('constant')).toBeVisible();
      await userEvent.keyboard('{Enter}');
      await expect.poll(boxIdsShown).toHaveLength(2);
      const constant = boxIdsShown().find((id) => id !== concat)!;
      expect(titleOf(concat!)).toBe('concat');
      expect(titleOf(constant)).toBe('constant');
      // the first box into the field became its result
      expect(edgeIds()).toEqual([`${concat}->:sink`]);

      await tabTo(`rf__node-${constant}`);
      await userEvent.keyboard('{Enter}');
      await expect.element(node(constant)).toHaveClass('selected');
      await userEvent.keyboard('{Delete}');

      await expect.element(box(constant)).not.toBeInTheDocument();
      expect(boxIdsShown()).toEqual([concat]);
      expect(pointers).toEqual([]);
    } finally {
      for (const type of ['pointerdown', 'mousedown', 'click']) document.removeEventListener(type, record, true);
    }
  });
});

describe('copy and paste', () => {
  test('Ctrl+C and Ctrl+V duplicate a two-box fragment with new ids; a wire inside it is kept, a wire from outside is not', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    await tabTo('rf__node-c1');
    await userEvent.keyboard('{Enter}');
    await tabTo('rf__node-f1');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await expect.element(node('c1')).toHaveClass('selected');
    await expect.element(node('f1')).toHaveClass('selected');

    await userEvent.keyboard('{Control>}c{/Control}{Control>}v{/Control}');

    await expect.poll(boxIdsShown).toHaveLength(6);
    const pasted = boxIdsShown().filter((id) => !['a1', 'c1', 'f1', 'u1'].includes(id));
    const constant = pasted.find((id) => titleOf(id) === 'constant')!;
    const concat = pasted.find((id) => titleOf(id) === 'concat')!;
    await expect.element(page.getByTestId(`value:${constant}`)).toHaveTextContent('"-"');
    expect(edgeIds()).toContain(`${constant}->${concat}#1`);
    expect(edgeIds().filter((id) => id.endsWith(`${concat}#0`))).toEqual([]);
    await expect.element(page.getByTestId(`unconnected:${concat}#0`)).toBeVisible();
    // the pasted boxes are the selection now
    await expect.element(node(constant)).toHaveClass('selected');
    await expect.element(node(concat)).toHaveClass('selected');
    await expect.element(node('c1')).not.toHaveClass('selected');
  });

  test('the Copy and Paste buttons do the same by mouse, with boxes selected by Ctrl+click', async () => {
    render();
    await expect.element(page.getByRole('button', { name: 'Copy' })).toBeDisabled();
    await expect.element(page.getByRole('button', { name: 'Paste' })).toBeDisabled();
    await box('a1').click();
    await userEvent.keyboard('{Control>}');
    await box('u1').click();
    await userEvent.keyboard('{/Control}');
    await expect.element(node('a1')).toHaveClass('selected');
    await expect.element(node('u1')).toHaveClass('selected');

    await page.getByRole('button', { name: 'Copy' }).click();
    await page.getByRole('button', { name: 'Paste' }).click();

    await expect.poll(boxIdsShown).toHaveLength(6);
    const pasted = boxIdsShown().filter((id) => !['a1', 'c1', 'f1', 'u1'].includes(id));
    const source = pasted.find((id) => titleOf(id) === 'OrderId')!;
    const upper = pasted.find((id) => titleOf(id) === 'toUpperCase')!;
    expect(edgeIds()).toContain(`${source}->${upper}#0`);
  });
});
