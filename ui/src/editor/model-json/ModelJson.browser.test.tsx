import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

const MAPPING = 'mappings/order-id-copy';
const NOTE = '/Q{urn:flottila:corpus:skeleton}Order/Note';

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={MAPPING} api={fakeApiClient()} browserState={memoryBrowserState()} />);
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

const tab = (name: string) => page.getByRole('tab', { name });
const modelJson = page.getByRole('region', { name: 'Working copy in canonical form' });
/** The text the tab shows, exactly: toHaveTextContent would fold its whitespace. */
const shownText = () => modelJson.element().textContent;

describe('the Model JSON tab (spec #135)', () => {
  test('shows the working copy in canonical form, read-only: the corpus file it opened, byte for byte', async () => {
    // behind another tab the working copy is not serialised at all
    await expect.element(tab('Editor')).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByRole('region', { name: 'Working copy in canonical form', includeHidden: true })).not.toBeInTheDocument();

    await tab('Model JSON').click();

    await expect.element(modelJson).toBeVisible();
    expect(shownText()).toBe(corpusMappingText);
    await expect.element(modelJson.getByRole('textbox')).not.toBeInTheDocument();
  });

  test('an edit in the Editor tab changes the text', async () => {
    await tab('Model JSON').click();
    await expect.element(modelJson).toBeVisible();
    expect(shownText()).not.toContain(`"${NOTE}"`);

    await tab('Editor').click();
    await userEvent.dragAndDrop(page.getByTestId(`source-field:${NOTE}`), page.getByTestId(`target-field:${NOTE}`));
    await tab('Model JSON').click();

    await expect.poll(shownText).toContain(`"${NOTE}": {`);
    expect(shownText()).toContain(`"field": "${NOTE}",\n          "kind": "source"`);
  });
});
