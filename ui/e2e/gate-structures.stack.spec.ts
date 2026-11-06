import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// GATE check 1 (#100): the gate structures of corpus/structures/gate, read by the real service from its workspace.
const PO = 'Q{urn:flottila:corpus:gate:po}';
const INV = 'Q{urn:flottila:corpus:gate:invoice}';
const PTY = 'Q{urn:flottila:corpus:gate:party}';
const PURCHASE_ORDER = `/${PO}PurchaseOrder`;
const INVOICE = `/${INV}Invoice`;
const corpus = (path: string) => new URL(`../../corpus/${path}`, import.meta.url);

type Side = 'source' | 'target';

/** Opens a mapping in the editor and collects every console error and page error. */
async function open(page: Page, mapping: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto(`/?mapping=${mapping}`);
  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
  return problems;
}

/** The row of a field shows its value type (none for a structure field) and its effective occurrence. */
async function expectField(page: Page, side: Side, path: string, valueType: string, occurrence: string) {
  const texts = page.getByTestId(`${side}-field:${path}`).locator(':scope > span');
  await expect(texts.nth(1)).toHaveText(valueType);
  await expect(texts.nth(2)).toHaveText(occurrence);
}

async function expand(page: Page, side: Side, path: string) {
  await page.getByTestId(`${side}-field:${path}`).locator(':scope > button').click();
}

test('@stack the XSD gate structures show their types and effective occurrences, as source and as target', async ({ page }) => {
  const problems = await open(page, 'mappings/gate-po-invoice');

  // purchase-order: three files, an include and an import
  await expectField(page, 'source', PURCHASE_ORDER, '', '1..1');
  await expectField(page, 'source', `${PURCHASE_ORDER}/@issued`, 'xs:date', '0..1');
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}OrderId`, 'xs:string', '1..1');
  // the two branches of a choice, each declared 1..1
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Delivery`, '', '0..1');
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Pickup`, 'xs:string', '0..1');
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Line`, '', '1..unbounded');
  await expand(page, 'source', `${PURCHASE_ORDER}/${PO}Line`);
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Line/@no`, 'xs:integer', '1..1');
  // the substitution group of the abstract head Product: its two members
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Line/${PO}Article`, '', '0..1');
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Line/${PO}Service`, '', '0..1');
  // a simple-content leaf with attributes
  await expectField(page, 'source', `${PURCHASE_ORDER}/${PO}Line/${PO}Price`, 'xs:decimal', '1..1');

  // invoice: an element reference across files, and a recursive type
  await expectField(page, 'target', INVOICE, '', '1..1');
  await expectField(page, 'target', `${INVOICE}/${PTY}Party`, '', '1..1');
  await expectField(page, 'target', `${INVOICE}/${INV}Item`, '', '1..unbounded');
  await expectField(page, 'target', `${INVOICE}/${INV}Date`, 'xs:date', '0..1');
  await expand(page, 'target', `${INVOICE}/${INV}Section`);
  await expand(page, 'target', `${INVOICE}/${INV}Section/${INV}Section`);
  await expectField(page, 'target', `${INVOICE}/${INV}Section/${INV}Section/${INV}Section`, '', '0..unbounded');
  await expectField(page, 'target', `${INVOICE}/${INV}Section/${INV}Section/${INV}Title`, 'xs:string', '1..1');
  expect(problems).toEqual([]);
});

test('@stack the JSON gate structure as a source: its tree, then a test run shows the output', async ({ page }) => {
  const problems = await open(page, 'mappings/gate-order-po');

  await expectField(page, 'source', '/$', '', '1..1');
  await expectField(page, 'source', '/$/id', 'xs:string', '1..1');
  await expectField(page, 'source', '/$/issued', 'xs:date', '0..1');
  // an array of objects
  await expectField(page, 'source', '/$/lines', '', '1..unbounded');
  // a nullable type list
  await expectField(page, 'source', '/$/note', 'xs:string', '0..1');
  // allOf over a $ref
  await expand(page, 'source', '/$/customer');
  await expectField(page, 'source', '/$/customer/name', 'xs:string', '1..1');
  await expectField(page, 'source', '/$/customer/number', 'xs:string', '1..1');
  // the branches of a oneOf
  await expand(page, 'source', '/$/delivery');
  await expectField(page, 'source', '/$/delivery/address', '', '0..1');
  await expectField(page, 'source', '/$/delivery/pickup', 'xs:string', '0..1');
  await expectField(page, 'target', PURCHASE_ORDER, '', '1..1');

  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(readFileSync(corpus('cases/gate/jsonToXsd/001/input.json'), 'utf8'));
  await page.getByRole('button', { name: 'Run test' }).click();

  const output = page.getByRole('figure', { name: 'Target message' });
  await expect(output).toContainText('PurchaseOrder');
  for (const text of ['issued="2026-04-01"', '>J-200<', '>Grace Hopper<', '>Arlington<', 'no="2"', '>A-3<', 'currency="USD">1.50<']) {
    await expect(output).toContainText(text);
  }
  expect(problems).toEqual([]);
});

test('@stack the JSON gate structure loads as a target, and a test run gives json-target-unsupported', async ({ page }) => {
  const problems = await open(page, 'mappings/gate-invoice-order');

  await expectField(page, 'source', INVOICE, '', '1..1');
  await expectField(page, 'target', '/$', '', '1..1');
  await expectField(page, 'target', '/$/lines', '', '1..unbounded');

  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(readFileSync(corpus('cases/gate/jsonTarget/001/input.xml'), 'utf8'));
  await page.getByRole('button', { name: 'Run test' }).click();

  // a run that compile refuses fills the Diagnostics panel (#113) and opens its tab
  await expect(page.getByRole('tab', { name: /^Diagnostics/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('list', { name: 'Working copy diagnostics' })).toContainText('json-target-unsupported');
  await expect(page.getByRole('figure', { name: 'Target message' })).toBeHidden();
  expect(problems).toEqual([]);
});
