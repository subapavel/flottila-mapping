import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../corpus/mappings/order-id-copy.mapping.json?raw';
import type { ApiClient, Diagnostic } from '../api/client';
import { fakeApiClient } from '../api/fake/fake-api';
import type { MappingModel } from '../generated/mapping-model';
import type { BrowserStateStore } from './browser-state/browser-state';
import { MappingEditor } from './index';

// Refresh on open and on request, orphan marks, remap and the delete of an orphaned target field mapping (ADR-0027,
// spec #104 stories 45-49, 57 and 58, ticket #114), over the order structure of the fake ApiClient.
const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;
const GONE = `${ORDER}/Gone`;
const MISSING = `${ORDER}/Missing`;
const DRAFT = 'drafts/refresh';
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

/**
 * Saved before the source schema changed: its source fingerprint is stale. Note reads Gone, a field the source
 * structure lost, through toUpperCase f1; Missing is a target field the target structure lacks.
 */
const stale: MappingModel = {
  ...corpusMapping,
  source: { ...corpusMapping.source!, fingerprint: 'sha256:stale' },
  targetFieldMappings: {
    [NOTE]: {
      id: 't1',
      result: 'f1',
      boxes: { a1: { kind: 'source', field: GONE }, f1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] } },
    },
    [MISSING]: { id: 't2', result: 'a2', boxes: { a2: { kind: 'source', field: ORDER_ID } } },
  },
};
const orphanedAt = (authoringId: string): Diagnostic => ({
  severity: 'error',
  code: 'orphaned-reference',
  message: 'the structure has no such field',
  location: { kind: 'authoring-id', authoringId },
});
/** What the engine's refresh answers for it: the two orphaned references. */
const staleApi = () => fakeApiClient({ [DRAFT]: stale }, { refresh: { [DRAFT]: [orphanedAt('a1'), orphanedAt('t2')] } });

const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const box = (id: string) => page.getByTestId(`box:${id}`);
const orphanMark = (id: string) => page.getByTestId(`orphaned:${id}`);
const orphans = () => page.getByRole('list', { name: 'Orphaned target field mappings' });
const notice = () => page.getByText(/^Orphaned references: \d+$/);
const inspector = page.getByRole('complementary', { name: 'Inspector' });

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

/** A host that owns the selected target field (ADR-0013: controlled state). */
function Host({ api }: { api: ApiClient }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <MappingEditor mappingId={DRAFT} api={api} browserState={memoryBrowserState()} selectedField={selected} onSelectField={setSelected} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(api: ApiClient) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<Host api={api} />);
}

beforeEach(async () => {
  // a source row and a canvas box are dragged between: both must be on screen
  await page.viewport(1280, 1400);
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

/** Opens Note's graph and waits for its orphaned source-field box. */
async function openNote() {
  await expect.element(notice()).toBeVisible();
  await targetRow(NOTE).click();
  await expect.element(orphanMark('a1')).toBeVisible();
}

describe('refresh on open (ADR-0027, story 57)', () => {
  test('a changed fingerprint is one undo step: the mapping is unsaved, a notice names the orphaned references, and they are marked', async () => {
    render(staleApi());

    await expect.element(notice()).toHaveTextContent('Orphaned references: 2');
    await expect.element(page.getByText('Unsaved')).toBeVisible();
    await expect.element(targetRow(NOTE).getByRole('img', { name: 'Orphaned' })).toBeVisible();
    await expect.element(orphans()).toHaveTextContent(MISSING);
    await targetRow(NOTE).click();
    await expect.element(orphanMark('a1')).toBeVisible();
    await expect.element(box('f1')).toBeVisible();
    await expect.element(orphanMark('f1')).not.toBeInTheDocument();

    await page.getByRole('button', { name: 'Undo' }).click();

    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  test('unchanged fingerprints leave the working copy as it is and show no notice', async () => {
    render(fakeApiClient({ [DRAFT]: corpusMapping }));
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();

    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    await expect.element(notice()).not.toBeInTheDocument();
  });

  test('a load failure on one side shows its file:line:column diagnostics and keeps that side’s fingerprint', async () => {
    const broken: MappingModel = {
      ...corpusMapping,
      source: { ...corpusMapping.source!, fingerprint: 'sha256:stale' },
      target: { ...corpusMapping.target!, bundle: ['missing.xsd'], fingerprint: 'sha256:kept' },
    };
    // no compile answers, so the panel holds the refresh's diagnostics
    const api: ApiClient = { ...fakeApiClient({ [DRAFT]: broken }), compile: () => new Promise(() => {}) };
    render(api);
    await expect.element(notice()).toHaveTextContent('Orphaned references: 0');

    await page.getByRole('tab', { name: /^Diagnostics/ }).click();

    await expect
      .element(page.getByRole('list', { name: 'Working copy diagnostics' }))
      .toHaveTextContent('error schema-unreadable missing.xsd:1:1: the fake API has no structure for drafts/missing.xsd');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    const saved = (await api.getMapping(DRAFT)).model;
    expect(saved.source!.fingerprint).toBe(corpusMapping.source!.fingerprint);
    expect(saved.target!.fingerprint).toBe('sha256:kept');
  });

  test('a refresh that fails shows its problem and leaves the working copy', async () => {
    render({ ...staleApi(), refresh: () => Promise.reject(new TypeError('Failed to fetch')) });

    await expect.element(page.getByRole('heading', { name: /The structures could not be refreshed: Failed to fetch/ })).toBeVisible();
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
  });
});

describe('Refresh structures (story 58)', () => {
  test('refreshes again and reloads the structures; unchanged fingerprints add no undo step, and the notice closes', async () => {
    const fake = staleApi();
    let refreshes = 0;
    let loads = 0;
    render({
      ...fake,
      refresh: (id, model) => {
        refreshes++;
        return fake.refresh(id, model);
      },
      loadStructure: (request) => {
        loads++;
        return fake.loadStructure(request);
      },
    });
    await expect.element(notice()).toHaveTextContent('Orphaned references: 2');
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
    const loadsBefore = loads;

    await page.getByRole('button', { name: 'Refresh structures' }).click();

    await expect.poll(() => refreshes).toBe(2);
    await expect.poll(() => loads).toBeGreaterThan(loadsBefore);
    await expect.element(notice()).toHaveTextContent('Orphaned references: 2');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();

    await page.getByRole('button', { name: /^Close .*The structures changed/ }).click();
    await expect.element(notice()).not.toBeInTheDocument();
  });
});

describe('remap (GLOSSARY, stories 48 and 49)', () => {
  test('a source row dropped on an orphaned source-field box points it at that field, keeping its id and its wire', async () => {
    render(staleApi());
    await openNote();

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), box('a1'));

    await expect.element(orphanMark('a1')).not.toBeInTheDocument();
    await expect.element(box('a1')).toMatchTextContent('OrderId');
    // the link is drawn only when result reaches the source field: f1 still reads a1
    await expect.element(page.getByTestId(`field-link:${ORDER_ID}->${NOTE}`)).toBeInTheDocument();
    await expect.element(targetRow(NOTE).getByRole('img', { name: 'Mapped' })).toBeVisible();
  });

  test('an orphaned box takes a source row only: a palette entry dropped on it inserts a box, and other drags are not let in', async () => {
    render(staleApi());
    await openNote();

    await userEvent.dragAndDrop(page.getByTestId('palette:constant'), box('a1'));

    await expect.poll(() => page.getByTestId(/^box:/).elements().length).toBe(3);
    await expect.element(orphanMark('a1')).toBeVisible();
    const dragOver = (type: string) => {
      const data = new DataTransfer();
      data.setData(type, 'x');
      const event = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data });
      box('a1').element().dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(dragOver('text/plain')).toBe(false);
    expect(dragOver('application/x-flottila-source-field')).toBe(true);
  });

  test('a box that is not orphaned takes no source row', async () => {
    render(staleApi());
    await openNote();

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), box('f1'));

    await expect.element(orphanMark('a1')).toBeVisible();
    await expect.element(page.getByText('Unsaved')).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
  });

  test('a refused source field is refused as a link to it is (ADR-0027), and the box stays orphaned', async () => {
    // the same-step structure of #116: Doc's two Note fields are refused, Code is not
    const sameStep: MappingModel = {
      ...corpusMapping,
      source: {
        bundle: ['../structures/refused/same-step.xsd'],
        fingerprint: 'sha256:d26971c5a6f2df7fa0bf9f7287ae22f1e93ef12dd6ea4ac8ce748990ba0ec32e',
        root: { element: 'Doc' },
      },
      targetFieldMappings: { [NOTE]: { id: 't1', result: 'a1', boxes: { a1: { kind: 'source', field: '/Doc/Gone' } } } },
    };
    render(fakeApiClient({ [DRAFT]: sameStep }));
    await targetRow(NOTE).click();
    await expect.element(orphanMark('a1')).toBeVisible();

    await userEvent.dragAndDrop(sourceRow('/Doc/Note').first(), box('a1'));

    await expect.element(page.getByRole('heading', { name: /The source field \/Doc\/Note is refused: ambiguous-field-path/ })).toBeVisible();
    await expect.element(orphanMark('a1')).toBeVisible();
    await userEvent.dragAndDrop(sourceRow('/Doc/Code'), box('a1'));
    await expect.element(orphanMark('a1')).not.toBeInTheDocument();
  });

  test('picking a field in the inspector remaps the orphaned box; a box that is not orphaned offers no remap', async () => {
    render(staleApi());
    await openNote();
    (page.getByTestId('rf__node-a1').element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const remapTo = inspector.getByRole('combobox', { name: 'Remap to' });
    await expect.element(remapTo).toBeVisible();

    await userEvent.selectOptions(remapTo, '/Order/OrderId');

    await expect.element(box('a1')).toMatchTextContent('OrderId');
    await expect.element(orphanMark('a1')).not.toBeInTheDocument();
    await expect.element(page.getByTestId(`field-link:${ORDER_ID}->${NOTE}`)).toBeInTheDocument();
    await expect.element(remapTo).not.toBeInTheDocument();
    await expect.element(inspector.getByRole('combobox', { name: 'Context' })).toBeVisible();
  });
});

describe('an orphaned target field mapping (story 47)', () => {
  const remove = () => page.getByRole('button', { name: 'Delete the selected orphaned target field mapping' });

  test('opened from its group can be deleted, and undo brings it back', async () => {
    render(staleApi());
    await expect.element(orphans()).toHaveTextContent(MISSING);
    await targetRow(NOTE).click();
    await expect.element(remove()).not.toBeInTheDocument();

    await orphans().getByRole('button', { name: MISSING }).click();
    await expect.element(box('a2')).toBeVisible();
    await remove().click();

    await expect.element(orphans()).not.toBeInTheDocument();
    await expect.element(box('a2')).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(orphans()).toHaveTextContent(MISSING);
  });
});
