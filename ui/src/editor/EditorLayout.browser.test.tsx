import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest';
import { page, userEvent, type Locator } from 'vitest/browser';
import { fakeApiClient } from '../api/fake/fake-api';
import { MappingEditor, storageBrowserState } from './index';

// The split view of ADR-0012, kept per user in the browser (ADR-0013, "Browser state"; spec #104 story 50). A reload
// is a new editor over the same localStorage.
const MAPPING = 'mappings/order-unmapped';
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

const halves = page.getByRole('separator', { name: 'Resize the structure overview and the function editor' });
const inspectorSplit = page.getByRole('separator', { name: 'Resize the function editor and the inspector' });
const sides = page.getByRole('separator', { name: 'Resize the source and the target structure' });
const targetTree = page.getByRole('tree', { name: 'Target structure', includeHidden: true });
// a collapsed half stays in the document, hidden
const sourceTree = page.getByRole('tree', { name: 'Source structure', includeHidden: true });
const functionEditor = page.getByRole('region', { name: 'Function editor', includeHidden: true });
const inspector = page.getByRole('complementary', { name: 'Inspector' });

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(mappingId = MAPPING, selectedField: string | null = null) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <MappingEditor
      mappingId={mappingId}
      api={fakeApiClient()}
      browserState={storageBrowserState(window.localStorage)}
      selectedField={selectedField}
    />,
  );
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = undefined;
}

function reload() {
  unmount();
  render();
}

async function press(separator: Locator, keys: string) {
  await expect.element(separator).toBeVisible();
  (separator.element() as HTMLElement).focus();
  await userEvent.keyboard(keys);
}

beforeEach(() => {
  window.localStorage.clear();
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  unmount();
  window.localStorage.clear();
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the editor layout', () => {
  test('a splitter ratio, a collapsed half and the closed inspector survive a reload', async () => {
    render();
    await expect.element(halves).toHaveAttribute('aria-valuenow', '50');
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '70');

    await press(halves, '{ArrowUp}{ArrowUp}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '40');
    await press(inspectorSplit, '{ArrowLeft}{Enter}');
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '100');
    await expect.element(inspector).not.toBeInTheDocument();

    reload();
    await expect.element(halves).toHaveAttribute('aria-valuenow', '40');
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '100');
    await expect.element(inspector).not.toBeInTheDocument();
    await press(inspectorSplit, '{Enter}');
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '65');
    await expect.element(inspector).toBeVisible();

    await press(halves, '{End}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '100');
    await expect.element(functionEditor).not.toBeVisible();

    reload();
    await expect.element(halves).toHaveAttribute('aria-valuenow', '100');
    await expect.element(sourceTree).toBeVisible();
    await expect.element(functionEditor).not.toBeVisible();
    await press(halves, '{Enter}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '40');
    await expect.element(functionEditor).toBeVisible();

    await press(halves, '{Home}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '0');
    reload();
    await expect.element(halves).toHaveAttribute('aria-valuenow', '0');
    await expect.element(functionEditor).toBeVisible();
    await expect.element(sourceTree).not.toBeVisible();
  });

  test('the trees fill the top half: moving the splitter down, then collapsing the bottom half, makes them taller', async () => {
    render();
    await expect.element(sourceTree).toBeVisible();
    const height = () => (sourceTree.element() as HTMLElement).clientHeight;
    const before = height();

    await press(halves, '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '70');
    await expect.poll(height).toBeGreaterThan(before + 100);
    const moved = height();

    await press(halves, '{End}');
    await expect.element(halves).toHaveAttribute('aria-valuenow', '100');
    await expect.poll(height).toBeGreaterThan(moved + 100);
  });

  test('the canvas fills the bottom half: collapsing the top half makes it taller', async () => {
    // wide enough for the palette and the canvas side by side
    await page.viewport(1280, 900);
    onTestFinished(() => page.viewport(414, 896));
    render('mappings/order-id-copy', ORDER_ID);
    const canvas = page.getByTestId(`canvas:${ORDER_ID}`);
    await expect.element(canvas).toBeVisible();
    const height = () => (canvas.element().querySelector('.react-flow') as HTMLElement).clientHeight;
    const before = height();

    await press(halves, '{Home}');

    await expect.element(halves).toHaveAttribute('aria-valuenow', '0');
    await expect.poll(height).toBeGreaterThan(before + 200);
  });

  test('dragging a splitter sets its ratio, dragging it to an edge collapses that half, and a double-click resets it', async () => {
    render();
    await expect.element(halves).toBeVisible();
    const separator = halves.element() as HTMLElement;
    const area = separator.parentElement!.getBoundingClientRect();
    const drag = (fraction: number, button = 0) => {
      separator.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: area.top + fraction * area.height }));
      window.dispatchEvent(new PointerEvent('pointerup'));
    };

    drag(0.3);
    await expect.element(halves).toHaveAttribute('aria-valuenow', '30');
    await expect.element(halves).toHaveFocus();
    // only the main button drags
    drag(0.6, 2);
    await expect.element(halves).toHaveAttribute('aria-valuenow', '30');
    drag(0.02);
    await expect.element(halves).toHaveAttribute('aria-valuenow', '0');
    await expect.element(sourceTree).not.toBeVisible();

    await userEvent.dblClick(halves);
    await expect.element(halves).toHaveAttribute('aria-valuenow', '50');
    await expect.element(sourceTree).toBeVisible();
    reload();
    await expect.element(halves).toHaveAttribute('aria-valuenow', '50');
  });

  test('a drag cut off by closing the editor leaves no listener behind to change the kept ratio', async () => {
    render();
    await expect.element(halves).toBeVisible();
    const area = (halves.element() as HTMLElement).parentElement!.getBoundingClientRect();
    halves.element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));

    reload();
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: area.top + 0.3 * area.height }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    reload();

    await expect.element(halves).toHaveAttribute('aria-valuenow', '50');
  });

  test('the source and target splitter: its ratio and a collapsed side survive a reload, and a double-click resets it', async () => {
    render();
    await expect.element(sides).toHaveAttribute('aria-valuenow', '50');
    await expect.element(sourceTree).toBeVisible();
    const width = () => (sourceTree.element() as HTMLElement).clientWidth;
    const before = width();

    await press(sides, '{ArrowRight}{ArrowRight}');
    await expect.element(sides).toHaveAttribute('aria-valuenow', '60');
    await expect.poll(width).toBeGreaterThan(before);

    reload();
    await expect.element(sides).toHaveAttribute('aria-valuenow', '60');
    await press(sides, '{End}');
    await expect.element(sides).toHaveAttribute('aria-valuenow', '100');
    await expect.element(targetTree).not.toBeVisible();
    await expect.element(sourceTree).toBeVisible();

    reload();
    await expect.element(sides).toHaveAttribute('aria-valuenow', '100');
    await expect.element(targetTree).not.toBeVisible();
    await press(sides, '{Enter}');
    await expect.element(sides).toHaveAttribute('aria-valuenow', '60');
    await press(sides, '{Home}');
    await expect.element(sourceTree).not.toBeVisible();
    await expect.element(targetTree).toBeVisible();

    await userEvent.dblClick(sides);
    await expect.element(sides).toHaveAttribute('aria-valuenow', '50');
    await expect.element(sourceTree).toBeVisible();
    await expect.element(targetTree).toBeVisible();
  });

  test('with one side collapsed the link gutter draws nothing, neither links nor counts; restored, it draws again', async () => {
    render('mappings/order-id-copy');
    const link = page.getByTestId(`field-link:${ORDER_ID}->${ORDER_ID}`);
    await expect.element(link).toBeInTheDocument();

    await press(sides, '{Home}');
    await expect.element(page.getByLabelText('Field links')).not.toBeInTheDocument();
    await press(sides, '{Enter}');
    await expect.element(link).toBeInTheDocument();
    await press(sides, '{End}');
    await expect.element(page.getByLabelText('Field links')).not.toBeInTheDocument();
  });

  test('the inspector button closes and opens the inspector, and its state is kept', async () => {
    render();
    await expect.element(inspector).toBeVisible();
    const width = () => (functionEditor.element() as HTMLElement).clientWidth;
    const before = width();

    await page.getByRole('button', { name: 'Hide inspector' }).click();
    await expect.element(inspector).not.toBeInTheDocument();
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '100');
    // the function editor takes the inspector's width
    await expect.poll(width).toBeGreaterThan(before + 0.2 * before);

    reload();
    await expect.element(inspector).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await expect.element(inspector).toBeVisible();
    await expect.element(inspectorSplit).toHaveAttribute('aria-valuenow', '70');
  });
});
