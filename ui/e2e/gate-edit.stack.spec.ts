import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems } from './problems';
import { stackWorkspace } from './stack-workspace';

// GATE check 2 (#117): editing in the editor over the real service, and an attribute field mapped and run (#102).
// Both mappings are workspace copies of order-id-copy without target field mappings, made by the server command.
const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const CHANNEL = `${ORDER}/@channel`;
const corpus = (path: string) => new URL(`../../corpus/${path}`, import.meta.url);

async function open(page: Page, mapping: string) {
  await page.goto(`/?mapping=${mapping}`);
  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
}

/** Drags a source field onto a target field: a field link. */
async function link(page: Page, source: string, target: string) {
  await page.getByTestId(`source-field:${source}`).dragTo(page.getByTestId(`target-field:${target}`));
}

/** The authoring id of the one box on `canvas` that shows `title`. */
async function boxId(canvas: Locator, title: string): Promise<string> {
  const testId = await canvas.getByTestId(/^box:/).filter({ hasText: title }).getAttribute('data-testid');
  return testId!.slice('box:'.length);
}

test('@stack GATE 2: a field link by drag and drop, a function and a constant are saved to the canonical file; a save over a changed file answers 409', async ({ page, request }) => {
  const problems = collectProblems(page);
  const mapping = 'mappings/e2e-edit';
  const file = join(stackWorkspace, `${mapping}.mapping.json`);
  await open(page, mapping);

  await link(page, ORDER_ID, ORDER_ID);
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByTestId(`target-field:${ORDER_ID}`).click();
  const canvas = page.getByTestId(`canvas:${ORDER_ID}`);
  await canvas.scrollIntoViewIfNeeded();
  await page.getByTestId('palette:concat').dragTo(canvas);
  await page.getByTestId('palette:constant').dragTo(canvas);
  await expect(canvas.getByTestId(/^box:/)).toHaveCount(3);
  const [source, concat, constant] = [await boxId(canvas, 'OrderId'), await boxId(canvas, 'concat'), await boxId(canvas, 'constant')];

  // the constant's value is its box parameter, set in the inspector
  await page.getByTestId(`box:${constant}`).click();
  await page.getByRole('textbox', { name: 'value' }).fill('-X');
  await page.getByRole('textbox', { name: 'value' }).press('Enter');
  await expect(page.getByTestId(`value:${constant}`)).toHaveText('"-X"');
  // dropped boxes may overlap: lay the graph out and fit it into the canvas, then wire OrderId and the constant into
  // concat, and concat into the target field
  await canvas.getByRole('button', { name: 'Arrange' }).click();
  await canvas.getByRole('button', { name: 'Fit View' }).click();
  await page.getByTestId(`out:${source}`).dragTo(page.getByTestId(`in:${concat}#0`));
  await page.getByTestId(`out:${constant}`).dragTo(page.getByTestId(`in:${concat}#1`));
  await page.getByTestId(`out:${concat}`).dragTo(page.getByTestId('in:sink'));
  await expect(page.getByTestId('unconnected:sink')).toBeHidden();
  await expect(page.getByTestId(`unconnected:${concat}#0`)).toBeHidden();
  await expect(page.getByTestId(`unconnected:${concat}#1`)).toBeHidden();

  const put = page.waitForResponse((response) => response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save' }).click();
  const answer = await put;
  await expect(page.getByText('Unsaved')).toBeHidden();

  // the file on disk is the canonical form the service answered the save with, and the one it serves
  const saved = readFileSync(file);
  expect(answer.status()).toBe(200);
  expect(Buffer.from(await answer.body()).equals(saved)).toBe(true);
  expect(Buffer.from(await (await request.get(`/api/mappings/${mapping}`)).body()).equals(saved)).toBe(true);
  const boxes = JSON.parse(saved.toString('utf8')).targetFieldMappings[ORDER_ID].boxes;
  expect(boxes[concat]).toEqual({ kind: 'function', fn: 'concat', inputs: [source, constant] });
  expect(boxes[constant]).toEqual({ kind: 'function', fn: 'constant', params: { value: '-X' } });

  // the saved graph runs
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(readFileSync(corpus('cases/link/direct-copy/001/input.xml'), 'utf8'));
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByRole('figure', { name: 'Target message' })).toContainText('<OrderId>PO 4711-X</OrderId>');

  // the file changes on disk; the next save is refused with 409, writes nothing, and the dialog offers Reload
  const changed = saved.toString('utf8').replace('"-X"', '"-DISK"');
  writeFileSync(file, changed);
  await page.getByRole('tab', { name: 'Editor' }).click();
  await page.getByRole('textbox', { name: 'value' }).fill('-Y');
  await page.getByRole('textbox', { name: 'value' }).press('Enter');
  const refused = page.waitForResponse((response) => response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Save' }).click();
  expect((await refused).status()).toBe(409);
  const dialog = page.getByRole('dialog', { name: 'Save conflict' });
  await expect(dialog).toBeVisible();
  expect(readFileSync(file, 'utf8')).toBe(changed);

  await dialog.getByRole('button', { name: 'Reload' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Unsaved')).toBeHidden();
  await expect(page.getByTestId(`value:${constant}`)).toHaveText('"-DISK"');
  // Chromium logs the refused PUT itself as a console error; that one line, and nothing else, is expected
  expect(problems).toEqual(['Failed to load resource: the server responded with a status of 409 (Conflict)']);
});

test('@stack a schema changed on disk: opening the mapping refreshes it, marks the orphaned reference, and a remap fixes it', async ({ page }) => {
  const problems = collectProblems(page);
  // e2e-refresh is order-id-copy (box a1 reads OrderId) over a source schema of its own; OrderId becomes OrderNumber
  const schema = join(stackWorkspace, 'structures', 'e2e-refresh', 'order.xsd');
  writeFileSync(schema, readFileSync(schema, 'utf8').replace('name="OrderId"', 'name="OrderNumber"'));
  await open(page, 'mappings/e2e-refresh');

  await expect(page.getByRole('heading', { name: /The structures changed/ })).toBeVisible();
  await expect(page.getByText('Orphaned references: 1')).toBeVisible();
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByTestId(`target-field:${ORDER_ID}`).click();
  await expect(page.getByTestId('orphaned:a1')).toBeVisible();

  // a source row dropped on the orphaned box remaps it; the box keeps its id and its place in the graph. An HTML drag
  // that scrolls the page on its way is lost, so the page is made tall enough to hold the tree and the canvas.
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.getByTestId(`source-field:${ORDER}/OrderNumber`).dragTo(page.getByTestId('box:a1'));
  await expect(page.getByTestId('orphaned:a1')).toBeHidden();
  await expect(page.getByTestId('box:a1')).toContainText('OrderNumber');

  const input = readFileSync(corpus('cases/link/direct-copy/001/input.xml'), 'utf8').replaceAll('OrderId>', 'OrderNumber>');
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(input);
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByRole('figure', { name: 'Target message' })).toContainText('<OrderId>PO 4711</OrderId>');
  expect(problems).toEqual([]);
});

test('@stack an attribute source field and an attribute target field map by drag and drop and run (#102)', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, 'mappings/e2e-attribute');

  await link(page, ORDER_ID, ORDER_ID);
  await link(page, CHANNEL, CHANNEL);
  await expect(page.getByTestId(`target-field:${CHANNEL}`)).toContainText('← @channel');
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(readFileSync(corpus('cases/link/attribute/001/input.xml'), 'utf8'));
  await page.getByRole('button', { name: 'Run test' }).click();

  const output = page.getByRole('figure', { name: 'Target message' });
  await expect(output).toContainText('channel="web"');
  await expect(output).toContainText('<OrderId>PO 4711</OrderId>');
  expect(problems).toEqual([]);
});
