import { readFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import { collectProblems } from './problems';

// The editor's author path on the fake API (#117, ADR-0013). The fake runs no engine: a run answers the corpus case
// link/direct-copy/001 when the field links match it, with an empty trace, so the display queues show that nothing
// was traced; the @stack suite shows their contents.
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';
const input = readFileSync(new URL('../../corpus/cases/link/direct-copy/001/input.xml', import.meta.url), 'utf8');

/** The authoring id of the one box on `canvas` that shows `title`. */
async function boxId(canvas: Locator, title: string): Promise<string> {
  const testId = await canvas.getByTestId(/^box:/).filter({ hasText: title }).getAttribute('data-testid');
  return testId!.slice('box:'.length);
}

test('the author path: list, open, link by drag and drop, a function, a constant and a parameter, save, run, display queues', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/?api=fake');

  await page.getByRole('list', { name: 'Mappings' }).getByRole('button', { name: 'mappings/order-unmapped' }).click();
  await expect(page.getByRole('heading', { name: 'mappings/order-unmapped' })).toBeVisible();
  await page.getByTestId(`source-field:${ORDER_ID}`).dragTo(page.getByTestId(`target-field:${ORDER_ID}`));
  await expect(page.getByTestId(`target-field:${ORDER_ID}`)).toContainText('← OrderId');

  // a function and a constant from the palette, beside the link's source box; the result stays the link
  await page.getByTestId(`target-field:${ORDER_ID}`).click();
  const canvas = page.getByTestId(`canvas:${ORDER_ID}`);
  await canvas.scrollIntoViewIfNeeded();
  await page.getByTestId('palette:substring').dragTo(canvas);
  await page.getByTestId('palette:constant').dragTo(canvas);
  await expect(canvas.getByTestId(/^box:/)).toHaveCount(3);
  await canvas.getByRole('button', { name: 'Arrange' }).click();
  await canvas.getByRole('button', { name: 'Fit View' }).click();
  const [substring, constant] = [await boxId(canvas, 'substring'), await boxId(canvas, 'constant')];

  // a box parameter and the constant's value, in the inspector
  await page.getByTestId(`box:${substring}`).click();
  await page.getByRole('textbox', { name: 'start' }).fill('3');
  await page.getByRole('textbox', { name: 'start' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'start' })).toHaveValue('3');
  await page.getByTestId(`box:${constant}`).click();
  await page.getByRole('textbox', { name: 'value' }).fill('X');
  await page.getByRole('textbox', { name: 'value' }).press('Enter');
  await expect(page.getByTestId(`value:${constant}`)).toHaveText('"X"');

  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Unsaved')).toBeHidden();

  await page.getByRole('textbox', { name: 'Input message' }).fill(input);
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByRole('figure', { name: 'Target message' })).toContainText('<OrderId>PO 4711</OrderId>');

  // the display queue of the function box, then of the target field once no box is selected
  await page.getByTestId(`box:${substring}`).click();
  const boxQueue = page.getByRole('region', { name: 'Display queue', exact: true });
  await expect(boxQueue).toContainText('Not evaluated in the last test run.');
  await page.getByTestId(`box:${substring}`).click({ modifiers: ['Control'] });
  const fieldQueue = page.getByRole('region', { name: 'Display queue of the target field' });
  await expect(fieldQueue.getByRole('heading', { name: 'Display queue of OrderId' })).toBeVisible();
  await expect(fieldQueue.getByRole('heading', { name: 'Result queue' })).toBeVisible();
  await expect(fieldQueue.getByRole('heading', { name: 'Occurrences' })).toBeVisible();
  await expect(boxQueue).toBeHidden();
  expect(problems).toEqual([]);
});
