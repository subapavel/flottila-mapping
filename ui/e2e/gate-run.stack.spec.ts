import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './problems';
import { stackWorkspace } from './stack-workspace';

// GATE check 3 (#117): test runs in the editor over the real service, and their display queues.
const corpus = (path: string) => new URL(`../../corpus/${path}`, import.meta.url);

async function open(page: Page, mapping: string) {
  await page.goto(`/?mapping=${mapping}`);
  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
}

/** Runs a test on the Test tab (spec #135), which stays open. */
async function run(page: Page, input: string) {
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(readFileSync(corpus(input), 'utf8'));
  await page.getByRole('button', { name: 'Run test' }).click();
}

test('@stack GATE 3: a test run of the unsaved working copy, and the display queues of a function and of target fields', async ({ page }) => {
  const problems = collectProblems(page);
  // ifWithoutElse(Sku, createIf(Qty)) onto Item, V reads Qty (fn/ifWithoutElse/005)
  const mapping = 'mappings/boolean-ifWithoutElse-suppress';
  await open(page, mapping);

  // an unsaved edit: keepSuppressValues makes the false condition of line 3 a SUPPRESS slot
  await page.getByTestId('target-field:/Out/Item').click();
  await page.getByTestId('box:X1').click();
  await page.getByRole('combobox', { name: 'keepSuppressValues' }).selectOption('true');
  await expect(page.getByText('Unsaved')).toBeVisible();
  await run(page, 'cases/fn/ifWithoutElse/005/input.xml');

  // the saved file gives V 1 and TRUE (lines 1 and 3); the working copy gives the Qty of lines 1 and 4
  const output = page.getByRole('figure', { name: 'Target message' });
  await expect(output).toContainText('<V>1</V>');
  await expect(output).toContainText('<V>true</V>');
  await expect(output).not.toContainText('<V>TRUE</V>');
  await expect(page.getByText('Unsaved')).toBeVisible();
  expect(readFileSync(join(stackWorkspace, `${mapping}.mapping.json`)).equals(readFileSync(corpus(`${mapping}.mapping.json`)))).toBe(true);

  // the function box: one context, with createIf's SUPPRESS of line 2 and the kept SUPPRESS of line 3
  await page.getByRole('tab', { name: 'Editor' }).click();
  const boxQueue = page.getByRole('region', { name: 'Display queue', exact: true });
  await expect(boxQueue.getByRole('list', { name: 'Contexts' }).getByRole('listitem')).toHaveText(['""SUPPRESSSUPPRESS""']);

  // the target field Item: its parent slot, the root, creates two of four slots and suppresses two
  await page.getByTestId('box:X1').click({ modifiers: ['Control'] });
  const itemQueue = page.getByRole('region', { name: 'Display queue of the target field' });
  await expect(itemQueue.getByRole('heading', { name: 'Display queue of Item' })).toBeVisible();
  await expect(itemQueue.getByTestId('parent-slot:1')).toContainText('parent slot 1: 2 created');
  await expect(itemQueue.getByTestId('parent-slot:1').getByRole('listitem')).toHaveText([
    'slot 1 created',
    'slot 2 suppressed (SUPPRESS)',
    'slot 3 suppressed (SUPPRESS)',
    'slot 4 created',
  ]);

  // the target field V: one V in each Item, by the Item's slot; the suppressed slots 2 and 3 made no Item
  await page.getByRole('button', { name: 'Expand target Item' }).click();
  await page.getByTestId('target-field:/Out/Item/V').click();
  const vQueue = page.getByRole('region', { name: 'Display queue of the target field' });
  await expect(vQueue.getByRole('heading', { name: 'Display queue of V' })).toBeVisible();
  await expect(vQueue.getByRole('list', { name: 'Parent slots' }).getByTestId(/^parent-slot:/)).toHaveText([
    /^parent slot 1: 1 created/,
    /^parent slot 4: 1 created/,
  ]);
  expect(problems).toEqual([]);
});

test('@stack GATE 3: a po:MINOCCURS run shows its QName and authoring id, which leads to the target field', async ({ page }) => {
  const problems = collectProblems(page);
  // Row is 1..2 and createIf gives it no value (target/minOccurs/001)
  await open(page, 'mappings/create-if-row');
  await run(page, 'cases/target/minOccurs/001/input.xml');

  await expect(page.getByRole('heading', { name: /Runtime error po:MINOCCURS/ })).toBeVisible();
  await page.getByRole('button', { name: 'Show T1' }).click();

  // the target field mapping T1 is Row's: its display queue marks the parent slot that raised the error
  const rowQueue = page.getByRole('region', { name: 'Display queue of the target field' });
  await expect(rowQueue.getByRole('heading', { name: 'Display queue of Row' })).toBeVisible();
  await expect(rowQueue.getByTestId('parent-slot:1')).toContainText('po:MINOCCURS');
  expect(problems).toEqual([]);
});

test('@stack a mapping with a JSON source runs and shows its output (#98)', async ({ page }) => {
  const problems = collectProblems(page);
  // $/lines/sku through removeContexts and toUpperCase onto All (structure/jsonFunctions/001)
  await open(page, 'mappings/json-functions');
  await run(page, 'cases/structure/jsonFunctions/001/input.json');

  const output = page.getByRole('figure', { name: 'Target message' });
  for (const line of ['<All>A</All>', '<All>B</All>', '<All>C</All>']) {
    await expect(output).toContainText(line);
  }
  expect(problems).toEqual([]);
});
