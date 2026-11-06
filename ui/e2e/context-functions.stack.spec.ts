import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { stackWorkspace } from './stack-workspace';

const MAPPING = 'mappings/remove-contexts';
const corpus = (path: string) => new URL(`../../corpus/${path}`, import.meta.url);
const input = readFileSync(corpus('cases/fn/removeContexts/001/input.xml'), 'utf8');
const expected = readFileSync(corpus('cases/fn/removeContexts/001/expected.xml'), 'utf8');

test('@stack a mapping with a context function opens, saves through the API byte-identical and runs to the expected output', async ({ page, request }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  const original = readFileSync(corpus(`${MAPPING}.mapping.json`));
  const file = join(stackWorkspace, `${MAPPING}.mapping.json`);

  await page.goto(`/?mapping=${MAPPING}`);
  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
  // The editor has no control for a function box and no way to undo, so an unchanged mapping has nothing to save:
  // the button is disabled. What the editor's Save sends is the model it loaded; the scenario sends that same model.
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  const loaded = await request.get(`/api/mappings/${MAPPING}`);
  expect(loaded.ok()).toBe(true);
  const saved = await request.put(`/api/mappings/${MAPPING}`, { data: await loaded.json() });
  expect(saved.ok()).toBe(true);
  expect(readFileSync(file).equals(original)).toBe(true);
  expect(Buffer.from(await (await request.get(`/api/mappings/${MAPPING}`)).body()).equals(original)).toBe(true);

  await page.getByRole('tab', { name: 'Test' }).click();
  await page.getByRole('textbox', { name: 'Input message' }).fill(input);
  await page.getByRole('button', { name: 'Run test' }).click();
  const output = page.getByRole('figure', { name: 'Target message' });
  for (const line of expected.split('\n').filter((l) => l.includes('<All>'))) {
    await expect(output).toContainText(line.trim());
  }
  expect(problems).toEqual([]);
});
