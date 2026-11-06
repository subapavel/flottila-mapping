import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import caseInput from '../../../../corpus/cases/link/direct-copy/001/input.xml?raw';
import type { ApiClient, TestResult } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { FieldPath } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

const MAPPING = 'mappings/order-id-copy';
const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;

/** The corpus mapping `order-id-copy`: OrderId (mapping t1) reads source-field box a1. */
const output: TestResult = {
  kind: 'output',
  output: '<Order><OrderId>PO 4711</OrderId></Order>',
  diagnostics: [],
  trace: { a1: { kind: 'queue', contexts: [['PO 4711']], capped: false, slotCount: 1, contextCount: 1 } },
};

/** What the engine answers when OrderId (1..1) gets no occurrence: po:MINOCCURS at its target field mapping (#52). */
const minOccurs: TestResult = {
  kind: 'error',
  error: { code: 'po:MINOCCURS', message: 'OrderId occurs 0 times under parent slot 1, at least 1 required', authoringId: 't1' },
  diagnostics: [],
  trace: {
    a1: { kind: 'queue', contexts: [[null]], capped: false, slotCount: 1, contextCount: 1 },
    t1: { kind: 'occurrences', min: 1, max: 1, capped: false, parents: [{ parentSlot: 1, created: 0, slots: [{ slot: 1, status: 'suppressed' }] }] },
  },
};

const refused: TestResult = {
  kind: 'refused',
  diagnostics: [
    { severity: 'error', code: 'json-target-unsupported', message: 'a JSON target is not supported yet', location: { kind: 'pointer', pointer: '/target' } },
  ],
};

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

/** A host that keeps the selected target field, as the dev host does. */
function Host({ api }: { api: ApiClient }) {
  const [selected, setSelected] = useState<FieldPath | null>(null);
  const [browserState] = useState(memoryBrowserState);
  return <MappingEditor mappingId={MAPPING} api={api} browserState={browserState} selectedField={selected} onSelectField={setSelected} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

/** Opens the corpus mapping over a fake whose test run answers `result`, or runs the corpus case when there is none. */
function render(result: TestResult | undefined, overrides: Partial<ApiClient> = {}) {
  const api: ApiClient = { ...fakeApiClient(undefined, { test: result ? { [MAPPING]: result } : {} }), ...overrides };
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

const testPanel = page.getByRole('region', { name: 'Test panel' });
const targetMessage = page.getByRole('figure', { name: 'Target message' });
/** A page tab (spec #135); the test panel is the Test tab's. */
const tab = (name: string) => page.getByRole('tab', { name });
async function runTest() {
  await tab('Test').click();
  await page.getByRole('button', { name: 'Run test' }).click();
}

const generatedTarget = page.getByRole('region', { name: 'Generated target' });
const errors = page.getByRole('region', { name: 'Errors' });

describe('the Test tab (spec #135)', () => {
  test('runs the working copy on the input, and the Generated target region shows the target message', async () => {
    render(undefined);
    await tab('Test').click();
    await expect.element(generatedTarget).toMatchTextContent('No run yet');

    await page.getByRole('textbox', { name: 'Input message' }).fill(caseInput);
    await page.getByRole('button', { name: 'Run test' }).click();

    // the fake runs the corpus case link/direct-copy/001 for this mapping and input
    await expect.element(generatedTarget.getByRole('figure', { name: 'Target message' })).toMatchTextContent('<OrderId>PO 4711</OrderId>');
    await expect.element(testPanel.getByText('live', { exact: true })).toBeVisible();
    await expect.element(errors.getByRole('heading', { name: 'Errors (0)' })).toBeVisible();
  });

  test("lists the run's error diagnostics with links to their authoring ids, and leaves its warnings to the Diagnostics tab", async () => {
    render({
      ...output,
      diagnostics: [
        { severity: 'error', code: 'unconnected-input', message: 'input 2 of concat is not connected', location: { kind: 'authoring-id', authoringId: 't1' } },
        { severity: 'warning', code: 'unreachable-box', message: 'box x9 is not reached', location: { kind: 'authoring-id', authoringId: 'a1' } },
        { severity: 'error', code: 'fingerprint-mismatch', message: 'the source changed', location: { kind: 'pointer', pointer: '/source/fingerprint' } },
      ],
    });
    await runTest();

    await expect.element(errors.getByRole('heading', { name: 'Errors (2)' })).toBeVisible();
    await expect.element(errors.getByRole('listitem').first()).toHaveTextContent('unconnected-input input 2 of concat is not connected · Show t1');
    await expect.element(errors.getByRole('listitem').nth(1)).toHaveTextContent('fingerprint-mismatch the source changed');
    await expect.element(errors.getByText('unreachable-box')).not.toBeInTheDocument();

    await errors.getByRole('button', { name: 'Show t1' }).click();

    await expect.element(tab('Editor')).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();
  });
});

describe('the test panel', () => {
  test('shows the target message of a run', async () => {
    render(output);
    await runTest();

    await expect.element(targetMessage).toHaveTextContent('<Order><OrderId>PO 4711</OrderId></Order>');
    await expect.element(testPanel.getByText('stale')).not.toBeInTheDocument();
  });

  test('shows a runtime error with its QName and message, and its link selects the target field mapping', async () => {
    render(minOccurs);
    await runTest();

    const error = testPanel.getByRole('heading', { name: /po:MINOCCURS/ });
    await expect.element(error).toBeVisible();
    // the runtime error counts as one of the run's errors
    await expect.element(errors.getByRole('heading', { name: 'Errors (1)' })).toBeVisible();
    await expect.element(testPanel.getByText('OrderId occurs 0 times under parent slot 1, at least 1 required')).toBeVisible();
    await expect.element(targetMessage).not.toBeInTheDocument();

    await testPanel.getByRole('button', { name: 'Show t1' }).click();

    // the target field is selected: the Editor tab opens, and the function editor shows its graph
    await expect.element(tab('Editor')).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();
    // the target field mapping, no box: the inspector shows the target field's display queue
    const queue = page.getByRole('region', { name: 'Display queue of the target field' });
    await expect.element(queue).toMatchTextContent('parent slot 1: 0 created po:MINOCCURS fewer than 1');
  });

  test('a runtime error without an authoring id has no link', async () => {
    render({ kind: 'error', error: { code: 'flottila:TIMEOUT', message: 'the run took too long' }, diagnostics: [], trace: {} });
    await runTest();

    await expect.element(testPanel.getByRole('heading', { name: /flottila:TIMEOUT/ })).toBeVisible();
    await expect.element(testPanel.getByRole('button', { name: /^Show/ })).not.toBeInTheDocument();
  });

  test('a run that compile refuses shows no target message and fills the Diagnostics panel', async () => {
    let compiled = false;
    render(refused, {
      compile: async () => {
        compiled = true;
        return { diagnostics: [] };
      },
    });
    // the compile on open has answered: what the panel then lists comes from the run
    await expect.poll(() => compiled).toBe(true);
    await runTest();

    await expect.element(page.getByRole('tab', { name: 'Diagnostics (1)' })).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByRole('list', { name: 'Working copy diagnostics' })).toMatchTextContent('json-target-unsupported');
    await expect.element(targetMessage).not.toBeInTheDocument();
    await tab('Test').click();
    await expect.element(testPanel).toMatchTextContent('Compile refused the working copy: nothing ran.');
  });

  test('after an edit the run is marked stale and still shown, until the next run', async () => {
    render(output);
    await runTest();
    await expect.element(targetMessage).toBeVisible();

    await tab('Editor').click();
    await userEvent.dragAndDrop(page.getByTestId(`source-field:${NOTE}`), page.getByTestId(`target-field:${NOTE}`));
    await tab('Test').click();

    await expect.element(testPanel.getByText('stale')).toBeVisible();
    await expect.element(targetMessage).toMatchTextContent('PO 4711');

    await runTest();

    await expect.element(testPanel.getByText('stale')).not.toBeInTheDocument();
  });

  test('uploading a file fills the input message', async () => {
    render(output);
    await tab('Test').click();

    await userEvent.upload(page.getByLabelText('Upload input message'), new File([caseInput], 'input.xml', { type: 'application/xml' }));

    await expect.element(page.getByRole('textbox', { name: 'Input message' })).toHaveValue(caseInput);

    // a choice cancelled leaves no file: the input stays
    await userEvent.upload(page.getByLabelText('Upload input message'), []);
    await expect.element(page.getByRole('textbox', { name: 'Input message' })).toHaveValue(caseInput);
  });
});
