import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ApiClient, FieldDto, StructureLoaded, TestResult } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

const DRAFT = 'drafts/display-queue';
const ORDER = '/Order';
const ORDER_ID = `${ORDER}/OrderId`;
const ITEM = `${ORDER}/Item`;
const CODE = `${ITEM}/Code`;

const field = (step: string, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: 'element',
  step,
  namespace: '',
  localName: step,
  min: 0,
  nillable: false,
  valueType: 'xs:string',
  ...extra,
});

/** Order holds OrderId and Item; Item holds Code. */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Order', { type: 'order', valueType: undefined }),
  types: { order: [field('OrderId'), field('Item', { type: 'item', valueType: undefined })], item: [field('Code')] },
};

const ref = { bundle: ['order.xsd'] as [string], fingerprint: 'sha256:00', root: { element: 'Order' } };

/** OrderId (mapping t1): Code (s1) and a constant c1 into concat f1, the result. */
const mapping: MappingModel = {
  formatVersion: 1,
  source: ref,
  target: ref,
  targetFieldMappings: {
    [ORDER_ID]: {
      id: 't1',
      result: 'f1',
      boxes: {
        s1: { kind: 'source', field: CODE },
        c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
        f1: { kind: 'function', fn: 'concat', inputs: ['s1', 'c1'] },
      },
    },
  },
};

/** A run whose trace holds f1's queue, c1's atomic value and t1's occurrences; s1 was never evaluated. */
const run: TestResult = {
  kind: 'output',
  output: '<Order/>',
  diagnostics: [],
  trace: {
    c1: { kind: 'atomic', type: 'xs:string', value: '-' },
    f1: { kind: 'queue', contexts: [['A-', ''], [null], []], capped: false, slotCount: 3, contextCount: 3 },
    t1: {
      kind: 'occurrences',
      min: 1,
      max: 1,
      capped: false,
      parents: [
        {
          parentSlot: 1,
          created: 1,
          slots: [
            { slot: 1, status: 'created' },
            { slot: 2, status: 'truncated' },
          ],
        },
        { parentSlot: 2, created: 0, slots: [{ slot: 3, status: 'suppressed' }] },
      ],
    },
  },
};

/** The same run cut by a trace limit of 2. */
const capped: TestResult = {
  kind: 'output',
  output: '<Order/>',
  diagnostics: [],
  trace: {
    f1: { kind: 'queue', contexts: [['A-', 'B-']], capped: true, slotCount: 40, contextCount: 12 },
    t1: {
      kind: 'occurrences',
      min: 0,
      capped: true,
      parents: [
        { parentSlot: 1, created: 2, slots: [{ slot: 1, status: 'created' }, { slot: 2, status: 'created' }] },
        { parentSlot: 12, created: 3, slots: [] },
      ],
    },
  },
};

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => structuredClone(values.get(key)), write: (key, value) => void values.set(key, structuredClone(value)) };
}

function Host({ api }: { api: ApiClient }) {
  const [selected, setSelected] = useState<string | null>(ORDER_ID);
  const [browserState] = useState(memoryBrowserState);
  return <MappingEditor mappingId={DRAFT} api={api} browserState={browserState} selectedField={selected} onSelectField={setSelected} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(result: TestResult) {
  const api: ApiClient = { ...fakeApiClient({ [DRAFT]: mapping }, { test: { [DRAFT]: result } }), loadStructure: async () => structure };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<Host api={api} />);
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

const inspector = page.getByRole('complementary', { name: 'Inspector' });
const boxQueue = inspector.getByRole('region', { name: 'Display queue', exact: true });
const fieldQueue = inspector.getByRole('region', { name: 'Display queue of the target field' });
const node = (id: string) => page.getByTestId(`rf__node-${id}`);

async function inspect(id: string) {
  await expect.element(node(id)).toBeVisible();
  (node(id).element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(inspector.getByTestId(`inspector:${id}`)).toBeVisible();
}

/** Runs a test on the Test page tab (spec #135), then goes back to the Editor tab, whose inspector shows the trace. */
async function runTest() {
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect.element(page.getByRole('figure', { name: 'Target message' })).toBeVisible();
  await page.getByRole('tab', { name: 'Editor' }).click();
}

describe('the display queue', () => {
  test('shows no target field queue before a test run, and a box asks for one', async () => {
    render(run);
    await expect.element(node('f1')).toBeVisible();
    // the target field view shows its result box's display queue, which asks for a run
    await expect.element(boxQueue).toHaveTextContent('Display queueNo trace: run a test.');
    await expect.element(fieldQueue).not.toBeInTheDocument();

    await inspect('f1');

    await expect.element(boxQueue).toHaveTextContent('Display queueNo trace: run a test.');
  });

  test("shows a function box's contexts, with SUPPRESS, the empty value and an empty context told apart", async () => {
    render(run);
    await runTest();
    await inspect('f1');

    const contexts = boxQueue.getByRole('list', { name: 'Contexts' }).getByRole('listitem');
    await expect.element(contexts.nth(0)).toHaveTextContent('A-""');
    await expect.element(contexts.nth(0).getByText('""')).toHaveClass(/pf-v6-c-label/);
    await expect.element(contexts.nth(1)).toHaveTextContent('SUPPRESS');
    await expect.element(contexts.nth(2)).toHaveTextContent('no values');
    await expect.element(boxQueue.getByText('capped')).not.toBeInTheDocument();
  });

  test('shows an atomic value with its type, and says when a box was not evaluated', async () => {
    render(run);
    await runTest();

    await inspect('c1');
    await expect.element(boxQueue).toHaveTextContent('Display queue- xs:string');

    await inspect('s1');
    await expect.element(boxQueue).toHaveTextContent('Display queueNot evaluated in the last test run.');
  });

  test('shows the target field its result queue and its occurrences per parent slot, the po:MINOCCURS one marked', async () => {
    render(run);
    await runTest();

    await expect.element(fieldQueue.getByRole('heading', { name: 'Display queue of OrderId' })).toBeVisible();
    await expect.element(fieldQueue.getByRole('list', { name: 'Contexts' })).toHaveTextContent('A-""SUPPRESSno values');
    await expect.element(fieldQueue).toMatchTextContent('Occurs 1..1');
    await expect
      .element(fieldQueue.getByTestId('parent-slot:1'))
      .toHaveTextContent('parent slot 1: 1 createdslot 1 createdslot 2 truncated (maxOccurs)');
    await expect
      .element(fieldQueue.getByTestId('parent-slot:2'))
      .toHaveTextContent('parent slot 2: 0 created po:MINOCCURS fewer than 1slot 3 suppressed (SUPPRESS)');
  });

  test('a capped entry says what it shows of how many, keeps the last parent slot, and the field is unbounded', async () => {
    render(capped);
    await runTest();

    await expect.element(fieldQueue).toMatchTextContent('capped showing the first 2 of 40 values, in 1 of 12 contexts');
    await expect.element(fieldQueue).toMatchTextContent('capped showing 2 of 12 parent slots, the last one kept, with 2 slot records');
    await expect.element(fieldQueue).toMatchTextContent('Occurs 0..unbounded');
    await expect.element(fieldQueue).toMatchTextContent('parent slots 2–11 not in the trace');
    await expect.element(fieldQueue.getByTestId('parent-slot:12')).toHaveTextContent('parent slot 12: 3 created');
  });

  test('after an edit the display queue is marked stale and still shown, until the next run', async () => {
    render(run);
    await runTest();
    await inspect('f1');
    await expect.element(boxQueue.getByText('stale')).not.toBeInTheDocument();

    // unwire input b: an edit
    await inspector.getByRole('combobox', { name: 'Input b' }).selectOptions('');

    await expect.element(boxQueue.getByText('stale')).toBeVisible();
    await expect.element(boxQueue.getByRole('list', { name: 'Contexts' })).toBeVisible();

    await runTest();

    await expect.element(boxQueue.getByText('stale')).not.toBeInTheDocument();
  });
});
