import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { stackWorkspace } from './stack-workspace';

const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';
const input = readFileSync(new URL('../../corpus/cases/link/direct-copy/001/input.xml', import.meta.url), 'utf8');

test('@stack the real service: open, link, save, run a test, and the saved file is canonical', async ({ page, request }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/?mapping=mappings/order-id-copy&host=dev');

  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
  await page.getByTestId(`source-field:${ORDER_ID}`).dragTo(page.getByTestId(`target-field:${ORDER_ID}`));
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Unsaved')).toBeHidden();
  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(input);
  await page.getByRole('button', { name: 'Run test' }).click();

  await expect(page.getByRole('figure', { name: 'Target message' })).toContainText('<OrderId>PO 4711</OrderId>');
  expect(problems).toEqual([]);

  const saved = readFileSync(join(stackWorkspace, 'mappings', 'order-id-copy.mapping.json'));
  expect(saved.toString('utf8')).toContain('"result"');
  const response = await request.get('/api/mappings/mappings/order-id-copy');
  expect(response.ok()).toBe(true);
  expect(Buffer.from(await response.body()).equals(saved)).toBe(true);
});
