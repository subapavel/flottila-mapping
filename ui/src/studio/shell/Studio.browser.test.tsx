import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ApiProblem, type ApiClient } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import type { MappingModel } from '../../generated/mapping-model';
import { Studio, studioStore } from './Studio';
import { StudioShell } from './StudioShell';

const ORDER = 'Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `/${ORDER}/OrderId`;
const NOTE = `/${ORDER}/Note`;
const LIST = '/?api=fake';
const TABS = ['Overview', 'Definition', 'Test', 'Signature', 'Functions'];

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(node);
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = undefined;
}

function renderStudio(api: ApiClient, mappingId: string, options: { browserState?: BrowserStateStore; startEditing?: boolean } = {}) {
  render(
    <Studio
      mappingId={mappingId}
      api={api}
      browserState={options.browserState ?? memoryBrowserState()}
      startEditing={options.startEditing}
      listHref={LIST}
    />,
  );
}

/** The shell over a store the test holds, wired to `api` as the studio wires it, so a test can edit through the store. */
async function renderShell(api: ApiClient, mappingId: string) {
  const store = studioStore(api, mappingId, await api.getMapping(mappingId));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <StudioShell mappingId={mappingId} api={api} store={store} browserState={memoryBrowserState()} listHref={LIST} />
    </QueryClientProvider>,
  );
  return store;
}

/** Whether the page asks before it unloads: a `beforeunload` listener cancelled the event. */
function asksBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const tab = (name: string) => page.getByRole('tab', { name });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const discardDialog = () => page.getByRole('dialog', { name: 'Discard changes?' });
const chooseMessages = () => page.getByRole('heading', { name: 'Choose the source and target messages' });

beforeEach(() => {
  history.replaceState(null, '', window.location.pathname);
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  unmount();
  history.replaceState(null, '', window.location.pathname);
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the studio shell (ADR-0028)', () => {
  test('opens a mapping in view mode under the masthead, on the Overview tab, with its name and Edit', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');

    await expect.element(page.getByRole('heading', { level: 1, name: 'order-id-copy' })).toBeVisible();
    await expect.element(page.getByRole('banner')).toHaveTextContent('FlottilaMapping studio');
    await expect.element(page.getByRole('link', { name: 'Flottila' })).toHaveAttribute('href', LIST);
    await expect.element(page.getByRole('tablist', { name: 'Editor views' }).getByRole('tab')).toHaveLength(5);
    for (const [i, name] of TABS.entries()) await expect.element(page.getByRole('tab').nth(i)).toHaveTextContent(name);
    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await expect.element(button('Edit')).toBeVisible();
    await expect.element(button('Save')).not.toBeInTheDocument();
    await expect.element(button('Cancel')).not.toBeInTheDocument();
  });

  test('shows the opening mapping and a mapping the service refuses with its problem and Retry', async () => {
    const fake = fakeApiClient();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const refused = new ApiProblem({ type: 'urn:flottila:mapping:problem:not-found', title: 'Not found', status: 404, detail: 'no mapping mappings/gone' });
    const getMapping = vi.fn(() => answered.then(() => Promise.reject(refused)));
    renderStudio({ ...fake, getMapping }, 'mappings/gone');

    await expect.element(page.getByText('Opening mappings/gone…')).toBeVisible();
    answer();
    await expect.element(page.getByRole('heading', { name: /Not found/ })).toBeVisible();
    await expect.element(page.getByText('no mapping mappings/gone')).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect.poll(() => getMapping.mock.calls.length).toBe(2);
  });

  test('a start in edit mode opens with Cancel and a disabled Save', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy', { startEditing: true });

    await expect.element(button('Save')).toBeDisabled();
    await expect.element(button('Cancel')).toBeVisible();
    await expect.element(button('Edit')).not.toBeInTheDocument();
  });

  test('Edit switches to edit mode', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');

    await button('Edit').click();

    await expect.element(button('Save')).toBeDisabled();
    await expect.element(button('Cancel')).toBeVisible();
  });
});

describe('the tabs on the URL hash', () => {
  test('the hash picks the tab at open, and a later hash change switches it', async () => {
    history.replaceState(null, '', '#test');
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');
    await expect.element(tab('Test')).toHaveAttribute('aria-selected', 'true');

    window.location.hash = '#signature';

    await expect.element(tab('Signature')).toHaveAttribute('aria-selected', 'true');
    await expect.element(tab('Test')).toHaveAttribute('aria-selected', 'false');
  });

  test('a hash that names no tab opens on Overview, and a later one is ignored', async () => {
    history.replaceState(null, '', '#nope');
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');
    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await tab('Functions').click();

    window.location.hash = '#other';

    await expect.element(tab('Functions')).toHaveAttribute('aria-selected', 'true');
  });

  test('choosing a tab writes its hash', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');

    await tab('Signature').click();

    await expect.element(tab('Signature')).toHaveAttribute('aria-selected', 'true');
    expect(window.location.hash).toBe('#signature');
  });

  test('without a hash the mapping opens on the tab it was last left on; a hash wins over it', async () => {
    const browserState = memoryBrowserState();
    renderStudio(fakeApiClient(), 'mappings/order-id-copy', { browserState });
    await tab('Functions').click();
    unmount();

    history.replaceState(null, '', window.location.pathname);
    renderStudio(fakeApiClient(), 'mappings/order-id-copy', { browserState });
    await expect.element(tab('Functions')).toHaveAttribute('aria-selected', 'true');
    unmount();

    history.replaceState(null, '', '#test');
    renderStudio(fakeApiClient(), 'mappings/order-id-copy', { browserState });
    await expect.element(tab('Test')).toHaveAttribute('aria-selected', 'true');
  });

  test('arrow keys, Home and End move between the tabs and choose them; another key does nothing', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');
    await expect.element(tab('Overview')).toBeVisible();
    (tab('Overview').element() as HTMLElement).focus();

    await userEvent.keyboard('{ArrowRight}');
    await expect.element(tab('Definition')).toHaveAttribute('aria-selected', 'true');
    await expect.element(tab('Definition')).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect.element(tab('Functions')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(tab('Functions')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Home}');
    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
    await expect.element(tab('Overview')).toHaveFocus();
  });

  test('a key on the tab bar outside a tab moves nothing', async () => {
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');
    const tabList = page.getByRole('tablist', { name: 'Editor views' });
    await expect.element(tabList).toBeVisible();

    tabList.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));

    await expect.element(tab('Overview')).toHaveAttribute('aria-selected', 'true');
  });

  test('Definition and Test of a mapping with both messages show no message prompt', async () => {
    history.replaceState(null, '', '#definition');
    renderStudio(fakeApiClient(), 'mappings/order-id-copy');
    await expect.element(tab('Definition')).toHaveAttribute('aria-selected', 'true');

    await expect.element(chooseMessages()).not.toBeInTheDocument();
    await tab('Test').click();
    await expect.element(chooseMessages()).not.toBeInTheDocument();
  });
});

describe('a mapping with neither source nor target (ADR-0029)', () => {
  const blank = (): Record<string, MappingModel> => ({ 'mappings/blank': { formatVersion: 1 } });

  test('opens and refreshes without an error, and Definition and Test ask for the messages with a link to Signature', async () => {
    const fake = fakeApiClient(blank());
    const refresh = vi.fn(fake.refresh);
    history.replaceState(null, '', '#definition');
    renderStudio({ ...fake, refresh }, 'mappings/blank');

    await expect.element(chooseMessages()).toBeVisible();
    await expect.poll(() => refresh.mock.calls.length).toBe(1);
    await tab('Test').click();
    await expect.element(chooseMessages()).toBeVisible();
    await tab('Overview').click();
    await expect.element(chooseMessages()).not.toBeInTheDocument();
    await tab('Test').click();

    await page.getByRole('link', { name: 'Choose them on the Signature tab' }).click();

    await expect.element(tab('Signature')).toHaveAttribute('aria-selected', 'true');
    await expect.element(chooseMessages()).not.toBeInTheDocument();
  });

  test('a mapping with a source but no target asks for the messages too', async () => {
    const withSource = fakeApiClient({ 'mappings/half': { formatVersion: 1, source: (await fakeApiClient().getMapping('mappings/order-id-copy')).model.source } });
    history.replaceState(null, '', '#definition');
    renderStudio(withSource, 'mappings/half');

    await expect.element(chooseMessages()).toBeVisible();
  });

  test('saves after an edit, and Save shows that it saved', async () => {
    const fake = fakeApiClient(blank());
    const store = await renderShell(fake, 'mappings/blank');
    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);

    await button('Save').click();

    await expect.element(page.getByRole('heading', { name: /Mapping blank saved/ })).toBeVisible();
    expect((await fake.getMapping('mappings/blank')).model.targetFieldMappings).toHaveProperty([ORDER_ID]);
  });
});

describe('refresh on open (ADR-0027)', () => {
  test('a changed fingerprint shows how many references it orphaned, until the notice is dismissed', async () => {
    const corpus = (await fakeApiClient().getMapping('mappings/order-id-copy')).model;
    const stale: MappingModel = { ...corpus, source: { ...corpus.source!, fingerprint: 'sha256:stale' } };
    const orphan = { severity: 'error' as const, code: 'orphaned-reference', message: 'gone', location: { kind: 'authoring-id' as const, authoringId: 'x' } };
    renderStudio(fakeApiClient({ 'mappings/stale': stale }, { refresh: { 'mappings/stale': [orphan] } }), 'mappings/stale');

    const notice = page.getByRole('status').filter({ hasText: 'The structures changed' });
    await expect.element(notice).toHaveTextContent('The structures changed. Orphaned references: 1');

    await page.getByRole('button', { name: 'Dismiss message' }).click();

    await expect.element(notice).not.toBeInTheDocument();
  });

  test('an answer that comes after the studio closed changes nothing', async () => {
    const corpus = (await fakeApiClient().getMapping('mappings/order-id-copy')).model;
    const stale: MappingModel = { ...corpus, source: { ...corpus.source!, fingerprint: 'sha256:stale' } };
    const fake = fakeApiClient({ 'mappings/stale': stale });
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const refresh = vi.fn((id: string, model: MappingModel) => answered.then(() => fake.refresh(id, model)));
    const store = await renderShell({ ...fake, refresh }, 'mappings/stale');
    await expect.poll(() => refresh.mock.calls.length).toBe(1);
    unmount();

    answer();
    await refresh.mock.results[0]!.value;

    expect(store.getState().past).toEqual([]);
    expect(store.getState().workingCopy.source?.fingerprint).toBe('sha256:stale');
  });

  test('a refresh that fails says so', async () => {
    const problem = new ApiProblem({ type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'offline' });
    renderStudio({ ...fakeApiClient(), refresh: () => Promise.reject(problem) }, 'mappings/order-id-copy');

    await expect.element(page.getByRole('status')).toHaveTextContent('The structures could not be refreshed: Service Unavailable');
  });
});

describe('Edit, Save and Discard', () => {
  test('Cancel after a change asks; Keep editing keeps the change, Discard changes restores the baseline in view mode', async () => {
    const store = await renderShell(fakeApiClient(), 'mappings/order-unmapped');
    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);
    await expect.element(button('Save')).toBeEnabled();

    await button('Cancel').click();
    await expect.element(discardDialog()).toMatchTextContent(/Discard your unsaved changes to order-unmapped and return to view mode\?/);
    await discardDialog().getByRole('button', { name: 'Keep editing' }).click();
    await expect.element(discardDialog()).not.toBeInTheDocument();
    expect(store.getState().workingCopy.targetFieldMappings).toHaveProperty([ORDER_ID]);

    await button('Cancel').click();
    await discardDialog().getByRole('button', { name: 'Discard changes' }).click();

    await expect.element(discardDialog()).not.toBeInTheDocument();
    await expect.element(button('Edit')).toHaveFocus();
    expect(store.getState().workingCopy).toBe(store.getState().baseline);
    expect(store.getState().past).toEqual([]);
  });

  test('Cancel without a change returns to view mode without asking', async () => {
    await renderShell(fakeApiClient(), 'mappings/order-unmapped');
    await button('Edit').click();

    await button('Cancel').click();

    await expect.element(button('Edit')).toBeVisible();
    await expect.element(discardDialog()).not.toBeInTheDocument();
  });

  test('Save sends the working copy with If-Match, takes the canonical model as the baseline and stays in edit mode', async () => {
    const fake = fakeApiClient();
    const saveMapping = vi.fn(fake.saveMapping);
    const { etag } = await fake.getMapping('mappings/order-unmapped');
    const store = await renderShell({ ...fake, saveMapping }, 'mappings/order-unmapped');
    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);

    await button('Save').click();

    await expect.element(page.getByRole('heading', { name: /Mapping order-unmapped saved/ })).toBeVisible();
    await expect.element(button('Save')).toBeDisabled();
    await expect.element(button('Cancel')).toBeVisible();
    expect(saveMapping.mock.calls[0]![2]).toBe(etag);
    expect(store.getState().baseline.targetFieldMappings).toHaveProperty([ORDER_ID]);

    await page.getByRole('button', { name: 'Dismiss save notification' }).click();
    await expect.element(page.getByRole('heading', { name: /saved/ })).not.toBeInTheDocument();
  });

  test('the saved notice goes by itself after 8 s, and the next save shows it again', async () => {
    const original = window.setTimeout;
    // PatternFly's alert timeout: the test runs it after 300 ms
    const timers = vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, delay?: number, ...rest: unknown[]) =>
      original(fn, delay === 8000 ? 300 : delay, ...rest)) as typeof window.setTimeout);
    try {
      const store = await renderShell(fakeApiClient(), 'mappings/order-unmapped');
      await button('Edit').click();
      store.getState().link(ORDER_ID, ORDER_ID);
      await button('Save').click();
      await expect.element(page.getByRole('heading', { name: /Mapping order-unmapped saved/ })).toBeVisible();
      await expect.element(page.getByRole('heading', { name: /saved/ })).not.toBeInTheDocument();

      store.getState().link(NOTE, NOTE);
      await button('Save').click();

      await expect.element(page.getByRole('heading', { name: /Mapping order-unmapped saved/ })).toBeVisible();
      expect(timers.mock.calls.filter(([, delay]) => delay === 8000)).toHaveLength(2);
    } finally {
      timers.mockRestore();
    }
  });

  test('Save is disabled while the service has not answered', async () => {
    const fake = fakeApiClient();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    const saveMapping = vi.fn((...args: Parameters<ApiClient['saveMapping']>) => answered.then(() => fake.saveMapping(...args)));
    const store = await renderShell({ ...fake, saveMapping }, 'mappings/order-unmapped');
    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);

    await button('Save').click();

    await expect.element(button('Save')).toBeDisabled();
    answer();
    await expect.element(page.getByRole('heading', { name: /Mapping order-unmapped saved/ })).toBeVisible();
    expect(saveMapping).toHaveBeenCalledTimes(1);
  });

  test('Save of a file changed on disk shows the save conflict and no saved notice', async () => {
    const fake = fakeApiClient();
    const store = await renderShell(fake, 'mappings/order-unmapped');
    // another writer changes the file after it was opened
    const stored = await fake.getMapping('mappings/order-unmapped');
    await fake.saveMapping('mappings/order-unmapped', stored.model, stored.etag);
    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);

    await button('Save').click();

    await expect.element(page.getByRole('dialog', { name: 'Save conflict' })).toBeVisible();
    await expect.element(page.getByRole('heading', { name: /saved/ })).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect.element(button('Save')).toBeEnabled();
  });

  test('a save the service refuses shows the problem and its diagnostics', async () => {
    const refused = new ApiProblem({
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [{ severity: 'error', code: 'unknown-function', message: 'no such function', location: { kind: 'pointer', pointer: '/x' } }],
    });
    const store = await renderShell({ ...fakeApiClient(), saveMapping: () => Promise.reject(refused) }, 'mappings/order-unmapped');
    await button('Edit').click();
    store.getState().link(NOTE, NOTE);

    await button('Save').click();

    await expect.element(page.getByRole('heading', { name: /Model refused/ })).toBeVisible();
    await expect.element(page.getByRole('list', { name: 'Save diagnostics' })).toHaveTextContent('error unknown-function: no such function');
    await expect.element(page.getByRole('heading', { name: /saved/ })).not.toBeInTheDocument();
  });

  test('the page asks before unloading only while the working copy has unsaved changes', async () => {
    const store = await renderShell(fakeApiClient(), 'mappings/order-unmapped');
    await expect.element(button('Edit')).toBeVisible();
    expect(asksBeforeUnload()).toBe(false);

    await button('Edit').click();
    store.getState().link(ORDER_ID, ORDER_ID);
    await expect.element(button('Save')).toBeEnabled();
    expect(asksBeforeUnload()).toBe(true);

    await button('Cancel').click();
    await discardDialog().getByRole('button', { name: 'Discard changes' }).click();
    await expect.element(button('Edit')).toBeVisible();
    expect(asksBeforeUnload()).toBe(false);
  });
});
