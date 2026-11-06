import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './problems';

// The layout contract of spec #135: on a 1440 x 900 window the page fills the window and never scrolls; the Editor
// tab shows both trees, the canvas and the inspector, and the Test tab shows Run.
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

test.use({ viewport: { width: 1440, height: 900 } });

/** How far the document scrolls vertically: 0 when the page fits the window. */
const verticalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);

test('at 1440 x 900 the editor fills the window without a page scroll, on the Editor and on the Test tab', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto(`/?mapping=mappings/order-id-copy&field=${encodeURIComponent(ORDER_ID)}&api=fake`);

  await expect(page.getByRole('tab', { name: 'Editor' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tree', { name: 'Source structure' })).toBeInViewport();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeInViewport();
  await expect(page.getByTestId(`canvas:${ORDER_ID}`)).toBeInViewport();
  // the function editor fits its pane: the canvas's bottom-left controls are fully shown, not scrolled away
  await expect(page.getByRole('button', { name: 'Fit View' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeInViewport();
  expect(await verticalScroll(page)).toBe(0);

  await page.getByRole('tab', { name: 'Test' }).click();

  await expect(page.getByRole('button', { name: 'Run test' })).toBeInViewport();
  expect(await verticalScroll(page)).toBe(0);
  expect(problems).toEqual([]);
});
