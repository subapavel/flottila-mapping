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

  test('the tool rail opens the queue of the selected node', async () => {
    await renderDefinition(run);
    const rail = page.getByRole('toolbar', { name: 'Mapping tools' }).getByRole('button', { name: 'Display Queue', exact: true });
    await expect.element(rail).toBeDisabled();

    await node(/^Source field OrderId/).click();
    await rail.click();

    await expect.element(dialog().getByRole('table', { name: 'OrderId queue' })).toBeVisible();
  });
});
