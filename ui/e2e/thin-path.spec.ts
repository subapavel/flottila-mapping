import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';
const input = readFileSync(new URL('../../corpus/cases/link/direct-copy/001/input.xml', import.meta.url), 'utf8');

test('the dev host opens a mapping on the fake API, links a field, saves and runs a test', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/?mapping=mappings/order-unmapped&api=fake');

  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
  await page.getByTestId(`source-field:${ORDER_ID}`).dragTo(page.getByTestId(`target-field:${ORDER_ID}`));
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Unsaved')).toBeHidden();
  await page.getByRole('textbox', { name: 'Input message' }).fill(input);
  await page.getByRole('button', { name: 'Run test' }).click();

  await expect(page.getByRole('figure', { name: 'Target message' })).toContainText('<OrderId>PO 4711</OrderId>');
  expect(problems).toEqual([]);
});
