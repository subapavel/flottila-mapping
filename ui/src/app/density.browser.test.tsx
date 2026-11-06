import '@patternfly/react-core/dist/styles/base.css';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { fakeApiClient } from '../api/fake/fake-api';
import type { BrowserStateStore } from '../editor';
import { DevHost } from './DevHost';

// The prototype's base density (spec #145, ticket #146): body 13 px (prototype.css @ 3a5ed86), measured at 1440×900
// with PatternFly's base css, whose own body size is 14 px.
function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(() => page.viewport(1440, 900));
afterAll(() => page.viewport(414, 896));

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

describe('the dev host page (spec #145, "Density")', () => {
  test('its body text is 13 px', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    root.render(<DevHost api={fakeApiClient()} browserState={memoryBrowserState()} start={{ mapping: 'mappings/order-id-copy' }} />);

    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();

    expect(getComputedStyle(document.body).fontSize).toBe('13px');
  });
});
