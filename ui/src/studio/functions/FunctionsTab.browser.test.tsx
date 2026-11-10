import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { ApiClient } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import { functionsKey } from '../mock/functions-store';
import { Studio, studioStore } from '../shell/Studio';
import { StudioShell } from '../shell/StudioShell';
import { emptyFunctions, newFunction, type FunctionsState } from './function-model';

const MAPPING = 'mappings/order-id-copy';
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

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

/** The studio on the Functions tab, as a page load with `#functions` opens it. */
function openFunctions(options: { api?: ApiClient; browserState?: BrowserStateStore; startEditing?: boolean; mappingId?: string } = {}) {
  history.replaceState(null, '', `${window.location.pathname}#functions`);
  render(
    <Studio
      mappingId={options.mappingId ?? MAPPING}
      api={options.api ?? fakeApiClient()}
      browserState={options.browserState ?? memoryBrowserState()}
      startEditing={options.startEditing}
      listHref="/?api=fake"
    />,
  );
}

/** A browser state that already holds `state` for the mapping. */
function keeping(state: FunctionsState, mappingId = MAPPING): BrowserStateStore {
  const browserState = memoryBrowserState();
  browserState.write(functionsKey(mappingId), state);
  return browserState;
}

const button = (name: string) => page.getByRole('button', { name, exact: true });
const functionActions = () => page.getByRole('toolbar', { name: 'Function actions' });
const source = (name: string) => page.getByRole('textbox', { name: `Source code for ${name}` });

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  unmount();
  history.replaceState(null, '', window.location.pathname);
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the Functions tab, a preview kept in the browser (ADR-0028, ADR-0030, #169)', () => {
  test('a function added in edit mode survives a reload of the studio', async () => {
    const browserState = memoryBrowserState();
    openFunctions({ browserState, startEditing: true });

    await functionActions().getByRole('button', { name: 'Insert row' }).click();
    await expect.element(button('Select function calculate1')).toHaveAttribute('aria-pressed', 'true');
    await source('calculate1').fill('return in0;');
    unmount();
    openFunctions({ browserState });

    await button('Select function calculate1').click();
    await expect.element(source('calculate1')).toHaveValue('return in0;');
  });

  test('Save sends the model without the functions', async () => {
    const fake = fakeApiClient();
    const saveMapping = vi.fn(fake.saveMapping);
    const api = { ...fake, saveMapping };
    const opened = await api.getMapping('mappings/order-unmapped');
    const store = studioStore(api, 'mappings/order-unmapped', opened);
    store.getState().setTab('functions');
    store.getState().startEditing();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StudioShell mappingId="mappings/order-unmapped" api={api} store={store} browserState={memoryBrowserState()} listHref="/?api=fake" />
      </QueryClientProvider>,
    );
    await functionActions().getByRole('button', { name: 'Insert row' }).click();
    await source('calculate1').fill('return "kept in the browser";');
    await expect.element(button('Save')).toBeDisabled();
    // an edit of the mapping, so that Save has something to send
    store.getState().link(ORDER_ID, ORDER_ID);

    await button('Save').click();

    await expect.element(page.getByRole('heading', { name: /Mapping order-unmapped saved/ })).toBeVisible();
    const [, sent] = saveMapping.mock.calls[0]!;
    expect(sent).toEqual(store.getState().workingCopy);
    expect(sent.udfs).toEqual(opened.model.udfs);
    expect(JSON.stringify(sent)).not.toMatch(/calculate1|kept in the browser/);
  });

  test('view mode is read-only: only Export Source Text works', async () => {
    const fn = { ...newFunction('calculate1', 'f1'), body: 'return in0;' };
    openFunctions({ browserState: keeping({ ...emptyFunctions(), imports: [...emptyFunctions().imports, 'java.util.function.*'], functions: [fn] }) });

    await expect.element(page.getByRole('heading', { name: 'Functions and Java Areas' })).toBeVisible();
    for (const name of ['Insert row', 'Delete row', 'Move up', 'Move down']) {
      await expect.element(functionActions().getByRole('button', { name })).toBeDisabled();
      await expect.element(page.getByRole('toolbar', { name: 'Import actions' }).getByRole('button', { name })).toBeDisabled();
    }
    await expect.element(button('Import Source Text')).toBeDisabled();
    await expect.element(button('Export Source Text')).toBeEnabled();
    await expect.element(page.getByRole('combobox', { name: 'JDK Compliance' })).toBeDisabled();
    await expect.element(page.getByRole('textbox', { name: 'Import instruction 7' })).toHaveAttribute('readonly');
    await expect.element(source('Attributes and Methods')).toHaveAttribute('readonly');

    await button('Select function calculate1').click();
    await expect.element(source('calculate1')).toHaveAttribute('readonly');
    await expect.element(page.getByRole('textbox', { name: 'Method name' })).not.toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: 'Title' })).toBeDisabled();
    await expect.element(page.getByRole('combobox', { name: 'Execution Kind' })).toBeDisabled();
    await expect.element(page.getByRole('toolbar', { name: 'Variable actions' }).getByRole('button', { name: 'Insert row' })).toBeDisabled();
  });
});
