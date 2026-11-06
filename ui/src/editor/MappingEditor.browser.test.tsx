import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import caseInput from '../../../corpus/cases/link/direct-copy/001/input.xml?raw';
import corpusMappingText from '../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { ApiProblem, type ApiClient, type Diagnostic } from '../api/client';
import { fakeApiClient } from '../api/fake/fake-api';
import type { MappingModel } from '../generated/mapping-model';
import type { BrowserStateStore } from './browser-state/browser-state';
import { MappingEditor } from './index';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(mappingId: string, api: ApiClient, browserState: BrowserStateStore = memoryBrowserState()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={mappingId} api={api} browserState={browserState} />);
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = undefined;
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  unmount();
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the structure overview', () => {
  test('shows the source tree and the target tree with types and effective occurrences', async () => {
    render('mappings/order-unmapped', fakeApiClient());

    await expect.element(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
    for (const row of [sourceRow, targetRow]) {
      await expect.element(row(ORDER)).toMatchTextContent(/Order1\.\.1$/);
      await expect.element(row(ORDER_ID)).toHaveTextContent('OrderIdxs:string1..1');
      await expect.element(row(`${ORDER}/@channel`)).toHaveTextContent('@channelxs:string0..1');
      await expect.element(row(NOTE)).toHaveTextContent('Notexs:string0..unbounded');
    }
  });

  test('collapsing a branch hides its fields, and the editor reopens with it collapsed', async () => {
    const browserState = memoryBrowserState();
    render('mappings/order-unmapped', fakeApiClient(), browserState);

    await page.getByRole('button', { name: 'Collapse source Order' }).click();

    await expect.element(sourceRow(ORDER_ID)).not.toBeInTheDocument();
    await expect.element(targetRow(ORDER_ID)).toBeVisible();

    unmount();
    render('mappings/order-unmapped', fakeApiClient(), browserState);

    await expect.element(targetRow(ORDER_ID)).toBeVisible();
    await expect.element(sourceRow(ORDER_ID)).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Expand source Order' }).click();
    await expect.element(sourceRow(ORDER_ID)).toBeVisible();
  });

  test('a structure the service refuses shows its diagnostics instead of the tree', async () => {
    const broken: MappingModel = { ...corpusMapping, source: { ...corpusMapping.source, bundle: ['missing.xsd'] } };
    render('drafts/broken', fakeApiClient({ 'drafts/broken': broken }));

    await expect.element(page.getByText('schema-unreadable')).toBeVisible();
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
  });

  test('a structure request that fails shows the error instead of the trees', async () => {
    render('mappings/order-unmapped', { ...fakeApiClient(), loadStructure: () => Promise.reject(new TypeError('Failed to fetch')) });

    await expect.element(page.getByRole('alert').first()).toHaveTextContent('Failed to fetch');
    await expect.element(page.getByRole('tree')).not.toBeInTheDocument();
  });
});

describe('linking, unsaved and save', () => {
  test('dragging a source field onto a target field links them and the working copy shows unsaved', async () => {
    render('mappings/order-unmapped', fakeApiClient());
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await expect.element(targetRow(ORDER_ID)).toHaveTextContent('OrderIdxs:string1..1← OrderId');
    await expect.element(page.getByText('Unsaved')).toBeVisible();
  });

  test('a target field whose result is null shows no link despite a leftover source-field box, and one once result reaches it', async () => {
    const unconnected = structuredClone(corpusMapping);
    unconnected.targetFieldMappings![ORDER_ID]!.result = null;
    render('drafts/try-it', fakeApiClient({ 'drafts/try-it': unconnected }));
    await expect.element(targetRow(ORDER_ID)).toMatchTextContent(/^OrderIdxs:string1\.\.1$/);

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await expect.element(targetRow(ORDER_ID)).toMatchTextContent(/^OrderIdxs:string1\.\.1← OrderId$/);
  });

  test('a target field whose result reaches a source-field box shows its link as loaded', async () => {
    render('mappings/order-id-copy', fakeApiClient());

    await expect.element(targetRow(ORDER_ID)).toMatchTextContent(/^OrderIdxs:string1\.\.1← OrderId$/);
    await expect.element(targetRow(NOTE)).toMatchTextContent(/^Notexs:string0\.\.unbounded$/);
  });

  test('the keyboard links too: Enter picks a source field, Enter on a target field links it', async () => {
    render('mappings/order-unmapped', fakeApiClient());

    await userEvent.click(sourceRow(ORDER_ID));
    await userEvent.keyboard('{Enter}');
    await expect.element(sourceRow(ORDER_ID)).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(targetRow(NOTE));
    await userEvent.keyboard('{Enter}');

    await expect.element(targetRow(NOTE)).toHaveTextContent('Notexs:string0..unbounded← OrderId');
    await expect.element(sourceRow(ORDER_ID)).toHaveAttribute('aria-selected', 'false');
  });

  test('Space picks and puts back a source field, other keys do nothing, and a target field without a pick links nothing', async () => {
    render('mappings/order-unmapped', fakeApiClient());

    await userEvent.click(sourceRow(ORDER_ID));
    await userEvent.keyboard('x');
    await expect.element(sourceRow(ORDER_ID)).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard(' ');
    await expect.element(sourceRow(ORDER_ID)).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard(' ');
    await expect.element(sourceRow(ORDER_ID)).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(targetRow(NOTE));
    await userEvent.keyboard('{Enter}');

    await expect.element(targetRow(NOTE)).toHaveTextContent('Notexs:string0..unbounded');
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
  });

  test('save sends the working copy, the saved mapping holds the link, and unsaved goes away', async () => {
    const api = fakeApiClient();
    render('mappings/order-unmapped', api);
    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await page.getByRole('button', { name: 'Save' }).click();

    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    const saved = await api.getMapping('mappings/order-unmapped');
    const mapping = saved.targetFieldMappings?.[ORDER_ID];
    expect(mapping?.result).not.toBeNull();
    expect(mapping?.boxes[mapping.result!]).toEqual({ kind: 'source', field: ORDER_ID });
  });

  test('a refused save shows the problem and its diagnostics, and the working copy stays unsaved', async () => {
    const refused = new ApiProblem({
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [
        { severity: 'error', code: 'box-cycle', message: 'a cycle', location: { kind: 'authoring-id', authoringId: 't1' } },
      ],
    });
    render('mappings/order-unmapped', { ...fakeApiClient(), saveMapping: () => Promise.reject(refused) });
    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await page.getByRole('button', { name: 'Save' }).click();

    await expect.element(page.getByRole('heading', { name: /Model refused/ })).toBeVisible();
    await expect.element(page.getByText('box-cycle')).toBeVisible();
    await expect.element(page.getByText('Unsaved')).toBeVisible();
  });

  test('a mapping that cannot be opened shows the problem', async () => {
    render('mappings/missing', fakeApiClient());

    await expect.element(page.getByRole('heading', { name: /Not found/ })).toBeVisible();
  });
});

describe('the test panel', () => {
  test('runs the unsaved working copy on the input message and shows the target message', async () => {
    render('mappings/order-unmapped', fakeApiClient());
    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await userEvent.fill(page.getByRole('textbox', { name: 'Input message' }), caseInput);
    await page.getByRole('button', { name: 'Run test' }).click();

    await expect
      .element(page.getByRole('figure', { name: 'Target message' }))
      .toMatchTextContent('<OrderId>PO 4711</OrderId>');
  });

  test('shows the diagnostics that refuse the working copy, and no target message', async () => {
    const unfinished = structuredClone(corpusMapping);
    unfinished.targetFieldMappings![ORDER_ID]!.result = null;
    render('drafts/unfinished', fakeApiClient({ 'drafts/unfinished': unfinished }));

    await userEvent.fill(page.getByRole('textbox', { name: 'Input message' }), caseInput);
    await page.getByRole('button', { name: 'Run test' }).click();

    const diagnostics = page.getByRole('list', { name: 'Diagnostics' });
    await expect
      .element(diagnostics)
      .toHaveTextContent("error unconnected-target-field: the target field mapping's result is not connected");
    await expect.element(page.getByRole('figure', { name: 'Target message' })).not.toBeInTheDocument();
  });

  test('shows the problem when the service refuses the request', async () => {
    render('mappings/order-id-copy', fakeApiClient());

    await userEvent.fill(page.getByRole('textbox', { name: 'Input message' }), '<other/>');
    await page.getByRole('button', { name: 'Run test' }).click();

    await expect.element(page.getByRole('heading', { name: /Invalid request/ })).toBeVisible();
  });
});

describe('the Diagnostics panel', () => {
  /** What the engine answers for an unmapped OrderId (1..1): `unmapped-mandatory-leaf` at its absent member. */
  const pointer = '/targetFieldMappings/~1Q{urn:flottila:corpus:skeleton}Order~1OrderId';
  const unmappedOrderId: Diagnostic = {
    severity: 'error',
    code: 'unmapped-mandatory-leaf',
    message: 'the mandatory target leaf has no target field mapping',
    location: { kind: 'pointer', pointer },
  };
  const diagnosticsTab = () => page.getByRole('tab', { name: /^Diagnostics/ });

  test('the working copy is compiled on open, and the drawer tab lists its diagnostics', async () => {
    render('mappings/order-unmapped', fakeApiClient(undefined, { compile: { 'mappings/order-unmapped': [unmappedOrderId] } }));

    await expect.element(diagnosticsTab()).toHaveTextContent('Diagnostics (1)');
    await diagnosticsTab().click();

    await expect
      .element(page.getByRole('list', { name: 'Working copy diagnostics' }))
      .toHaveTextContent(`error unmapped-mandatory-leaf ${pointer}: ${unmappedOrderId.message}`);
  });

  test('an edit compiles the working copy again and its diagnostics replace the previous ones', async () => {
    const compiled: MappingModel[] = [];
    render('mappings/order-unmapped', {
      ...fakeApiClient(),
      compile: async (_id, model) => {
        compiled.push(model);
        return { diagnostics: model.targetFieldMappings?.[ORDER_ID] ? [] : [unmappedOrderId] };
      },
    });
    await expect.element(diagnosticsTab()).toHaveTextContent('Diagnostics (1)');

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await expect.element(diagnosticsTab()).toHaveTextContent('Diagnostics (0)');
    expect(compiled).toHaveLength(2);
  });

  test('a pointer leads to its target row, expanding a collapsed branch, and the row takes the focus', async () => {
    render('mappings/order-unmapped', fakeApiClient(undefined, { compile: { 'mappings/order-unmapped': [unmappedOrderId] } }));
    await page.getByRole('button', { name: 'Collapse target Order' }).click();
    await expect.element(targetRow(ORDER_ID)).not.toBeInTheDocument();

    await diagnosticsTab().click();
    await page.getByRole('button', { name: pointer }).click();

    await expect.element(targetRow(ORDER_ID)).toHaveFocus();
    await expect.element(sourceRow(ORDER_ID)).toBeVisible();
  });

  test("an authoring id leads to its target field mapping's row", async () => {
    const unfinished = structuredClone(corpusMapping);
    unfinished.targetFieldMappings![ORDER_ID]!.result = null;
    // what the service answers for it (CompileResourceTest)
    const answer: Diagnostic[] = [
      { severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 'a1' } },
      { severity: 'error', code: 'unconnected-target-field', message: 'not connected', location: { kind: 'authoring-id', authoringId: 't1' } },
    ];
    render('drafts/unfinished', fakeApiClient({ 'drafts/unfinished': unfinished }, { compile: { 'drafts/unfinished': answer } }));

    await diagnosticsTab().click();
    await page.getByRole('button', { name: 'a1' }).click();

    await expect.element(targetRow(ORDER_ID)).toHaveFocus();
  });

  test('a target field the structure lacks leads nowhere, and the focus stays on the link', async () => {
    const orphaned = structuredClone(corpusMapping);
    orphaned.targetFieldMappings = { [`${ORDER}/Missing`]: orphaned.targetFieldMappings![ORDER_ID]! };
    const answer: Diagnostic[] = [
      { severity: 'error', code: 'orphaned-reference', message: 'no such field', location: { kind: 'authoring-id', authoringId: 't1' } },
    ];
    render('drafts/orphaned', fakeApiClient({ 'drafts/orphaned': orphaned }, { compile: { 'drafts/orphaned': answer } }));

    await diagnosticsTab().click();
    const link = page.getByRole('button', { name: 't1' });
    await link.click();

    await expect.element(link).toHaveFocus();
  });

  test('a diagnostic at the root leads to the root row and leaves the root expanded', async () => {
    const atRoot = structuredClone(corpusMapping);
    atRoot.targetFieldMappings = { [ORDER]: atRoot.targetFieldMappings![ORDER_ID]! };
    const answer: Diagnostic[] = [
      { severity: 'error', code: 'unsupported-field', message: 'the root', location: { kind: 'authoring-id', authoringId: 't1' } },
    ];
    render('drafts/at-root', fakeApiClient({ 'drafts/at-root': atRoot }, { compile: { 'drafts/at-root': answer } }));

    await diagnosticsTab().click();
    await page.getByRole('button', { name: 't1' }).click();

    await expect.element(targetRow(ORDER)).toHaveFocus();
    await expect.element(targetRow(ORDER_ID)).toBeVisible();
  });

  test("a refused save's diagnostics replace the panel's until the next compile", async () => {
    const refused = new ApiProblem({
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [{ severity: 'error', code: 'box-cycle', message: 'a cycle', location: { kind: 'authoring-id', authoringId: 't1' } }],
    });
    render('mappings/order-unmapped', { ...fakeApiClient(), saveMapping: () => Promise.reject(refused) });
    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await page.getByRole('button', { name: 'Save' }).click();
    await diagnosticsTab().click();

    await expect
      .element(page.getByRole('list', { name: 'Working copy diagnostics' }))
      .toHaveTextContent('error box-cycle t1: a cycle');
  });
});
