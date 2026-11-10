import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { fakeApiClient } from '../api/fake/fake-api';
import type { BrowserStateStore } from '../editor';
import { App } from './App';

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;
const path = window.location.pathname;

function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<App api={fakeApiClient()} browserState={memoryBrowserState()} />);
}

const table = () => page.getByRole('table', { name: 'Mappings' });
const modal = () => page.getByRole('dialog', { name: 'New mapping' });

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  history.replaceState(null, '', path);
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the page (ADR-0028)', () => {
  test('starts at the list; Open in studio leads to the mapping on Definition, keeping the page parameters', async () => {
    history.replaceState(null, '', `${path}?api=fake`);
    render();

    const row = table().getByRole('row').filter({ hasText: 'order-id-copy' });
    await expect.element(row.getByRole('link', { name: 'Open in studio' })).toHaveAttribute('href', '?api=fake&mapping=mappings%2Forder-id-copy#definition');
    await expect.element(page.getByRole('link', { name: 'Flottila' })).toHaveAttribute('href', '?api=fake');
  });

  test('list, New mapping, Create: the new mapping opens in the studio in edit mode on Signature; Back returns to the list, which has it', async () => {
    history.replaceState(null, '', `${path}?api=fake`);
    render();
    await page.getByRole('button', { name: 'New mapping' }).click();
    await modal().getByRole('textbox', { name: 'Name' }).fill('order-to-invoice');
    await modal().getByRole('textbox', { name: 'Package' }).fill('orders');

    await modal().getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('heading', { level: 1, name: 'order-to-invoice' })).toBeVisible();
    await expect.element(page.getByRole('tab', { name: 'Signature' })).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await expect.element(page.getByRole('link', { name: 'Flottila' })).toHaveAttribute('href', '?api=fake');
    expect(window.location.search).toBe('?api=fake&mapping=orders%2Forder-to-invoice');
    expect(window.location.hash).toBe('#signature');

    history.back();

    await expect.element(table().getByRole('row').filter({ hasText: 'order-to-invoice' })).toBeVisible();
    expect(window.location.search).toBe('?api=fake');
  });

  test('a mapping named at start opens in the studio in view mode on the hash tab', async () => {
    history.replaceState(null, '', `${path}?mapping=mappings/order-id-copy&api=fake#overview`);
    render();

    await expect.element(page.getByRole('heading', { level: 1, name: 'order-id-copy' })).toBeVisible();
    await expect.element(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect.element(table()).not.toBeInTheDocument();
  });
});
