import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ApiClient, FieldDto, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel, TargetFieldMapping } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

const DRAFT = 'drafts/inspector';
const ORDER = '/Order';
const ORDER_ID = `${ORDER}/OrderId`;
const ITEM = `${ORDER}/Item`;
const LINE = `${ITEM}/Line`;
const CODE = `${LINE}/Code`;

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

/** Order holds OrderId and Item; Item holds Line; Line holds Code: Code has three proper ancestors. */
const structure: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:00',
  root: field('Order', { type: 'order', valueType: undefined }),
  types: {
    order: [field('OrderId'), field('Item', { type: 'item', valueType: undefined })],
    item: [field('Line', { type: 'line', valueType: undefined })],
    line: [field('Code')],
  },
};

const ref = { bundle: ['order.xsd'] as [string], fingerprint: 'sha256:00', root: { element: 'Order' } };

/**
 * OrderId: Code (s1) into fixValues x1 (missing set to error) into concat f1, the result; formatNum n1, divide d1, a
 * constant c1, a UDF u1 reading OrderId (s2), and an unresolved box r1, none of them reached.
 */
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
        s2: { kind: 'source', field: ORDER_ID },
        x1: { kind: 'function', fn: 'fixValues', inputs: ['s1'], params: { missing: 'error' } },
        f1: { kind: 'function', fn: 'concat', inputs: ['x1'] },
        n1: { kind: 'function', fn: 'formatNum' },
        d1: { kind: 'function', fn: 'divide' },
        c1: { kind: 'function', fn: 'constant' },
        u1: { kind: 'udf', udf: 'shout', inputs: ['s2'], params: { loud: 'yes' } },
        r1: { kind: 'unresolved', name: 'FormatByExample', origin: 'po', params: { table: { A: 'B' } } },
      },
    },
  },
  udfs: { shout: { executionKind: 'single', inputs: ['text'], params: { loud: 'string' }, source: 'udf/Shout.java#shout' } },
};

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => structuredClone(values.get(key)), write: (key, value) => void values.set(key, structuredClone(value)) };
}

function Host({ api }: { api: ApiClient }) {
  const [selected, setSelected] = useState<string | null>(ORDER_ID);
  return <MappingEditor mappingId={DRAFT} api={api} browserState={memoryBrowserState()} selectedField={selected} onSelectField={setSelected} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(model: MappingModel = mapping, overrides: Partial<ApiClient> = {}): ApiClient {
  const api: ApiClient = { ...fakeApiClient({ [DRAFT]: model }), loadStructure: async () => structure, ...overrides };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<Host api={api} />);
  return api;
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
const node = (id: string) => page.getByTestId(`rf__node-${id}`);

/** Selects a box on the canvas by keyboard, Enter on its node, and waits for the inspector to show it. */
async function inspect(id: string) {
  // React Flow shows a node once it is measured
  await expect.element(node(id)).toBeVisible();
  (node(id).element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(inspector.getByTestId(`inspector:${id}`)).toBeVisible();
}

/** Saves the working copy and gives back the target field mapping the fake service stored. */
async function saved(api: ApiClient): Promise<TargetFieldMapping> {
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
  return (await api.getMapping(DRAFT)).model.targetFieldMappings![ORDER_ID]!;
}

describe('the inspector', () => {
  test('asks for a box until one is selected, and collapses and opens again', async () => {
    render();
    await expect.element(inspector).toHaveTextContent('Select a box to inspect it.');

    await page.getByRole('button', { name: 'Hide inspector' }).click();
    await expect.element(inspector).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await expect.element(inspector).toBeVisible();
  });

  test("shows a function box's catalogue documentation, its execution kind and fidelity, with its badges", async () => {
    const api = render();
    const catalogue = await api.getCatalogue();
    await inspect('x1');

    const documentation = inspector.getByRole('region', { name: 'Documentation' });
    await expect
      .element(documentation)
      .toHaveTextContent('FamilyconversionsExecution kindsingle valueInputskeyFidelityassumedPortableyesassumed');

    await inspect('d1');
    const deviation = catalogue.divide!.fidelity;
    expect(deviation.level).toBe('deviation');
    await expect.element(documentation).toMatchTextContent(/^FamilyarithmeticExecution kindsingle valueInputsdividend, divisorFidelitydeviationPortableyes/);
    await expect.element(documentation.getByRole('paragraph')).toHaveTextContent(`deviation ${deviation.level === 'deviation' ? deviation.text : ''}`);
    await expect.element(documentation.getByText('not portable')).not.toBeInTheDocument();
  });

  test('shows no box while the catalogue cannot be read, even when a diagnostic selects one', async () => {
    render(mapping, {
      getCatalogue: () => Promise.reject(new TypeError('Failed to fetch')),
      compile: async () => ({
        diagnostics: [{ severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 'x1' } }],
      }),
    });
    await page.getByRole('tab', { name: /^Diagnostics/ }).click();

    await page.getByRole('button', { name: 'x1', exact: true }).click();

    await expect.element(page.getByRole('region', { name: 'Function editor' }).getByRole('alert')).toHaveTextContent('Failed to fetch');
    await expect.element(inspector).toHaveTextContent('Select a box to inspect it.');
  });

  test('shows "not portable" for an entry whose export is not portable', async () => {
    const catalogue = await fakeApiClient().getCatalogue();
    render(mapping, { getCatalogue: async () => ({ ...catalogue, divide: { ...catalogue.divide!, portable: false } }) });
    await inspect('d1');

    await expect.element(inspector.getByText('not portable')).toBeVisible();
    await expect.element(inspector.getByRole('region', { name: 'Documentation' })).toMatchTextContent('Portableno');
  });
});

describe('the parameter editors', () => {
  test('a param with values is a select; its choice round-trips, and the default is left out of the model', async () => {
    const api = render();
    await inspect('x1');
    const missing = inspector.getByRole('combobox', { name: 'missing' });
    await expect.element(missing).toHaveValue('error');

    await userEvent.selectOptions(missing, 'default');
    expect((await saved(api)).boxes.x1).toEqual({ kind: 'function', fn: 'fixValues', inputs: ['s1'], params: { missing: 'default' } });

    await userEvent.selectOptions(missing, 'key');
    expect((await saved(api)).boxes.x1).toEqual({ kind: 'function', fn: 'fixValues', inputs: ['s1'] });
  });

  test('a syntax param is text, committed on Enter, said to be checked by compile', async () => {
    const api = render();
    await inspect('n1');
    const pattern = inspector.getByRole('textbox', { name: 'pattern' });
    await expect.element(pattern).toHaveValue('0');
    await expect.element(inspector.getByText('A numberPattern, checked by compile.')).toBeVisible();

    await pattern.fill('#,##0.00');
    await userEvent.keyboard('{Enter}');

    expect((await saved(api)).boxes.n1).toEqual({ kind: 'function', fn: 'formatNum', params: { pattern: '#,##0.00' } });
  });

  test("a constant's value is typed in the inspector, committed when the field loses the focus, and shown on its box", async () => {
    const api = render();
    await inspect('c1');
    // a param without a syntax is plain text
    await expect.element(inspector.getByText(/checked by compile/)).not.toBeInTheDocument();

    await inspector.getByRole('textbox', { name: 'value' }).fill('ACME');
    await userEvent.tab();

    await expect.element(page.getByTestId('value:c1')).toHaveTextContent('"ACME"');
    expect((await saved(api)).boxes.c1).toEqual({ kind: 'function', fn: 'constant', params: { value: 'ACME' } });
  });

  test('undo shows the model value in a text param again', async () => {
    render();
    await inspect('c1');
    const value = inspector.getByRole('textbox', { name: 'value' });
    await value.fill('ACME');
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByTestId('value:c1')).toHaveTextContent('"ACME"');

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect.element(value).toHaveValue('');
  });

  test('a table param is a key–value editor that refuses a duplicate key and round-trips its rows', async () => {
    const api = render();
    await inspect('x1');
    const table = inspector.getByRole('group', { name: 'table' });

    await table.getByRole('button', { name: 'Add row to table' }).click();
    await table.getByRole('textbox', { name: 'table key 1' }).fill('A');
    await table.getByRole('textbox', { name: 'table value 1' }).fill('Alpha');
    await userEvent.keyboard('{Enter}');
    await table.getByRole('button', { name: 'Add row to table' }).click();
    await table.getByRole('textbox', { name: 'table key 2' }).fill('A');
    await userEvent.keyboard('{Enter}');

    await expect.element(table.getByRole('alert')).toHaveTextContent('The key "A" is already in the table.');
    expect((await saved(api)).boxes.x1).toMatchObject({ params: { table: { A: 'Alpha' } } });

    await table.getByRole('textbox', { name: 'table key 2' }).fill('B');
    await table.getByRole('textbox', { name: 'table value 2' }).fill('Beta');
    await userEvent.keyboard('{Enter}');
    await expect.element(table.getByRole('alert')).not.toBeInTheDocument();
    expect((await saved(api)).boxes.x1).toMatchObject({ params: { table: { A: 'Alpha', B: 'Beta' } } });

    await table.getByRole('button', { name: 'Remove table row 1' }).click();
    expect((await saved(api)).boxes.x1).toMatchObject({ params: { table: { B: 'Beta' } } });

    // undo changes the table under the editor, which shows the model's rows again
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(table.getByRole('textbox', { name: 'table key 1' })).toHaveValue('A');
    await expect.element(table.getByRole('textbox', { name: 'table key 2' })).toHaveValue('B');
  });

  test('the params of a udf and an unresolved box are read-only, and their inputs stay wirable', async () => {
    render();
    await inspect('u1');

    await expect.element(inspector).toMatchTextContent('A UDF: its parameters are read-only.');
    await expect.element(inspector.getByTestId('param:loud')).toHaveTextContent('loudyes');
    await expect.element(inspector.getByRole('textbox')).not.toBeInTheDocument();
    await expect.element(inspector.getByRole('combobox', { name: 'Input text' })).toHaveValue('s2');

    await inspect('r1');

    await expect.element(inspector).toMatchTextContent('An unresolved function from po: its parameters are read-only.');
    await expect.element(inspector.getByTestId('param:table')).toHaveTextContent('tableA = B');
    await expect.element(inspector.getByRole('textbox')).not.toBeInTheDocument();
  });

  test('the params of a function the catalogue lacks are read-only', async () => {
    const unknown: MappingModel = structuredClone(mapping);
    unknown.targetFieldMappings![ORDER_ID]!.boxes.n1 = { kind: 'function', fn: 'noSuchFunction', params: { pattern: 'x' } };
    render(unknown);
    await inspect('n1');

    await expect.element(inspector).toMatchTextContent('Not in the function catalogue: its parameters are read-only.');
    await expect.element(inspector.getByRole('region', { name: 'Documentation' })).not.toBeInTheDocument();
    await expect.element(inspector.getByTestId('param:pattern')).toHaveTextContent('patternx');
  });
});

describe('the context picker', () => {
  test("lists exactly the source field's proper ancestors, the parent first and selected by default", async () => {
    render();
    await inspect('s1');
    const context = inspector.getByRole('combobox', { name: 'Context' });

    await expect.element(context).toHaveValue(LINE);
    expect([...(context.element() as HTMLSelectElement).options].map((o) => [o.value, o.text])).toEqual([
      [LINE, 'Line (parent)'],
      [ITEM, 'Item'],
      [ORDER, 'Order'],
    ]);
    // a source-field box has no input slot
    await expect.element(inspector.getByRole('region', { name: 'Inputs' })).not.toBeInTheDocument();
  });

  test('a context that is not the parent marks the field link and round-trips; the parent again leaves it out', async () => {
    const api = render();
    await inspect('s1');
    const link = `${CODE}->${ORDER_ID}`;
    await expect.element(page.getByTestId(`field-link:${link}`)).toBeInTheDocument();
    await expect.element(page.getByTestId(`link-context:${link}`)).not.toBeInTheDocument();

    await userEvent.selectOptions(inspector.getByRole('combobox', { name: 'Context' }), ITEM);

    await expect.element(inspector.getByRole('combobox', { name: 'Context' })).toHaveValue(ITEM);
    await expect.element(page.getByTestId(`link-context:${link}`)).toBeInTheDocument();
    expect((await saved(api)).boxes.s1).toEqual({ kind: 'source', field: CODE, context: ITEM });

    await userEvent.selectOptions(inspector.getByRole('combobox', { name: 'Context' }), LINE);

    await expect.element(page.getByTestId(`link-context:${link}`)).not.toBeInTheDocument();
    expect((await saved(api)).boxes.s1).toEqual({ kind: 'source', field: CODE });
  });
});

describe('the input slot pickers', () => {
  test('wire a slot by keyboard from another box of the same target field mapping, and unconnect it', async () => {
    render();
    await inspect('f1');
    const b = inspector.getByRole('combobox', { name: 'Input b' });
    await expect.element(b).toHaveValue('');
    expect([...(b.element() as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'c1', 'd1', 'n1', 'r1', 's1', 's2', 'u1', 'x1']);

    (b.element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');

    await expect.element(b).toHaveValue('c1');
    await expect.element(page.getByTestId('rf__edge-c1->f1#1')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowUp}');

    await expect.element(b).toHaveValue('');
    await expect.element(page.getByTestId('rf__edge-c1->f1#1')).not.toBeInTheDocument();
  });

  test('a slot wired into a cycle is refused and says why, and the slot keeps what it read', async () => {
    render();
    await inspect('x1');
    const key = inspector.getByRole('combobox', { name: 'Input key' });

    await userEvent.selectOptions(key, 'f1');

    await expect.element(page.getByRole('heading', { name: /The wire would close a cycle: box x1 already feeds/ })).toBeVisible();
    await expect.element(key).toHaveValue('s1');
  });
});
