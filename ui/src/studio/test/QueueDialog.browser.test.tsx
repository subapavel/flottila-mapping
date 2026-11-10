import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { TestResult } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import type { WorkingCopyStore } from '../../editor/store/working-copy';
import { studioStore } from '../shell/Studio';
import { StudioShell } from '../shell/StudioShell';

const ORDER = 'Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `/${ORDER}/OrderId`;
const MAPPING = 'mappings/order-id-copy';

/** A run of order-id-copy: the source-field box a1 gave two contexts, the target field mapping t1 two OrderIds. */
const run: TestResult = {
  kind: 'output',
  output: '<Order/>',
  diagnostics: [],
  trace: {
    a1: { kind: 'queue', contexts: [['PO-1', ''], [null]], capped: false, slotCount: 3, contextCount: 2 },
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
      ],
    },
  },
};

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

/** The studio on the Definition tab with OrderId's mapping selected, after the run `last` when given. */
async function renderDefinition(last?: TestResult): Promise<WorkingCopyStore> {
  const api = fakeApiClient();
  const store = studioStore(api, MAPPING, await api.getMapping(MAPPING));
  store.getState().setTab('definition');
  store.getState().selectTarget(ORDER_ID);
  store.getState().startEditing();
  if (last) store.getState().recordRun(store.getState().workingCopy, last);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <QueryClientProvider client={queryClient}>
      <StudioShell mappingId={MAPPING} api={api} store={store} browserState={memoryBrowserState()} listHref="/" />
    </QueryClientProvider>,
  );
  return store;
}

const canvas = () => page.getByRole('group', { name: 'Mapping canvas' });
const node = (name: RegExp) => canvas().getByRole('group', { name });
const dialog = () => page.getByRole('dialog', { name: 'Display Queue' });

async function openQueue(name: RegExp) {
  await node(name).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Display Queue', exact: true }).click();
}

beforeEach(async () => {
  await page.viewport(1440, 900);
  history.replaceState(null, '', window.location.pathname);
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  history.replaceState(null, '', window.location.pathname);
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the Display Queue of a box (#158)', () => {
  test('shows the queue the last test run traced for the box, by its authoring id, a row per value and context end', async () => {
    await renderDefinition(run);

    await openQueue(/^Source field OrderId/);

    const table = dialog().getByRole('table', { name: 'OrderId queue' });
    await expect.element(table.getByRole('columnheader', { name: 'OrderId:out' })).toBeVisible();
    const rows = table.getByRole('row');
    await expect.element(rows.nth(1)).toHaveTextContent('PO-1');
    await expect.element(rows.nth(2)).toHaveTextContent('""');
    await expect.element(rows.nth(3)).toHaveTextContent('Boundary');
    await expect.element(rows.nth(4)).toHaveTextContent('SUPPRESS');
    await expect.element(rows.nth(5)).toHaveTextContent('End');
    await expect.element(dialog()).toMatchTextContent('2 contexts, 3 slots');
    await expect.element(dialog()).not.toMatchTextContent(/stale/);
  });

  test("the target field's queue shows its result box's queue and its occurrences", async () => {
    await renderDefinition(run);

    await openQueue(/^Target field OrderId/);

    const table = dialog().getByRole('table', { name: 'OrderId queue' });
    await expect.element(table.getByRole('columnheader', { name: /^OrderId:/ })).toBeVisible();
    await expect.element(table.getByRole('row').nth(1)).toHaveTextContent('PO-1');
    await expect.element(dialog()).toMatchTextContent('parent slot 1: 1 created');
    await expect.element(dialog()).toMatchTextContent('slot 2 truncated (maxOccurs)');
  });

  test('after an edit the trace is marked stale until the next run', async () => {
    const store = await renderDefinition(run);
    await openQueue(/^Source field OrderId/);
    await expect.element(dialog().getByRole('table', { name: 'OrderId queue' })).toBeVisible();

    store.getState().setDescription('An edit after the run');

    await expect.element(dialog()).toMatchTextContent('stale');
    await expect.element(dialog()).toMatchTextContent('The working copy changed since this run.');
    await expect.element(dialog().getByRole('table', { name: 'OrderId queue' }).getByRole('row').nth(1)).toHaveTextContent('PO-1');
  });

  test('before a run there is no trace to show', async () => {
    await renderDefinition();

    await openQueue(/^Source field OrderId/);

    await expect.element(dialog()).toMatchTextContent('No trace: run the simulation on the Test tab.');
  });

  test('a function shows a column per input and its output; an untraced one says so, a capped one what it cut', async () => {
    const store = await renderDefinition();
    const mapping = store.getState().workingCopy.targetFieldMappings![ORDER_ID]!;
    // OrderId through toUpperCase into the target: a1 -> f1 -> target
    store.setState((s) => ({
      workingCopy: {
        ...s.workingCopy,
        targetFieldMappings: {
          [ORDER_ID]: { ...mapping, result: 'f1', boxes: { ...mapping.boxes, f1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] } } },
        },
      },
    }));
    const many = Array.from({ length: 501 }, (_, i) => `v${i}`);
    store.getState().recordRun(store.getState().workingCopy, {
      kind: 'output',
      output: '<Order/>',
      diagnostics: [],
      trace: {
        a1: { kind: 'queue', contexts: [many], capped: true, slotCount: 900, contextCount: 3 },
        t1: {
          kind: 'occurrences',
          min: 1,
          capped: true,
          parents: [
            { parentSlot: 1, created: 0, slots: [] },
            { parentSlot: 4, created: 1, slots: [{ slot: 1, status: 'suppressed' }] },
          ],
        },
      },
    });

    await openQueue(/^Node function toUpperCase/);
    const table = dialog().getByRole('table', { name: 'toUpperCase queue' });
    await expect.element(table.getByRole('columnheader', { name: 'toUpperCase:out' })).toBeVisible();
    await expect.element(table.getByRole('row').nth(1)).toHaveTextContent('v0Not evaluated in the last test run');
    await expect.element(dialog()).toMatchTextContent('capped: showing the first 501 of 900 values, in 1 of 3 contexts');
    await expect.element(dialog()).toMatchTextContent('Showing the first 500 of 502 rows.');
    await expect.poll(() => table.getByRole('row').length).toBe(501);

    await dialog().getByText('Row numbers').click();
    await expect.element(table.getByRole('columnheader', { name: '#' })).toBeVisible();
    await expect.element(table.getByRole('row').nth(1)).toHaveTextContent('0v0Not evaluated in the last test run');
  });

  test("the target's occurrences mark a parent slot below the minimum, slots left out of the trace and a cap", async () => {
    const store = await renderDefinition();
    store.getState().recordRun(store.getState().workingCopy, {
      kind: 'output',
      output: '<Order/>',
      diagnostics: [],
      trace: {
        a1: { kind: 'atomic', type: 'xs:string', value: 'one' },
        t1: {
          kind: 'occurrences',
          min: 1,
          capped: true,
          parents: [
            { parentSlot: 1, created: 0, slots: [] },
            { parentSlot: 4, created: 1, slots: [{ slot: 1, status: 'suppressed' }] },
          ],
        },
      },
    });

    await openQueue(/^Target field OrderId/);

    await expect.element(dialog().getByRole('table', { name: 'OrderId queue' }).getByRole('row').nth(1)).toHaveTextContent('one');
    const slots = dialog().getByRole('list', { name: 'Parent slots' });
    await expect.element(dialog()).toMatchTextContent('Occurrences of OrderId, 1..unbounded');
    await expect.element(slots).toMatchTextContent('parent slot 1: 0 created · po:MINOCCURS, fewer than 1');
    await expect.element(slots).toMatchTextContent('parent slots 2–3 not in the trace');
    await expect.element(slots).toMatchTextContent('slot 1 suppressed (SUPPRESS)');
    await expect.element(dialog()).toMatchTextContent('capped: showing 2 of 4 parent slots');
  });

  test('undo that removes the box whose queue is open closes the dialog', async () => {
    const store = await renderDefinition(run);
    store.getState().insertBox(ORDER_ID, 'toUpperCase', { x: 300, y: 200 });
    await openQueue(/^Node function toUpperCase/);
    await expect.element(dialog().getByRole('table', { name: 'toUpperCase queue' })).toBeVisible();

    store.getState().undo();

    await expect.element(dialog()).not.toBeInTheDocument();
    await expect.element(node(/^Source field OrderId/)).toBeVisible();
  });

  test('the tool rail opens the queue of the selected node', async () => {
    await renderDefinition(run);
    const rail = page.getByRole('toolbar', { name: 'Mapping tools' }).getByRole('button', { name: 'Display Queue', exact: true });
    await expect.element(rail).toBeDisabled();

    await node(/^Source field OrderId/).click();
    await rail.click();

    await expect.element(dialog().getByRole('table', { name: 'OrderId queue' })).toBeVisible();
  });
});
