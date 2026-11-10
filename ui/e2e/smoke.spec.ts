import { expect, test } from '@playwright/test';

// The default suite has no service behind the preview's /api proxy, and the dev host lists the mappings at start:
// over HTTP that answers 502, which Chromium logs as a console error. So the smoke test starts on the fake API.
test('the dev host loads without console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/?api=fake&host=dev');

  await expect(page.getByRole('heading', { name: 'Flottila Mapping' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mappings' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the start page loads without console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/?api=fake');

  await expect(page.getByRole('heading', { name: 'Mappings' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Mappings' }).getByRole('link', { name: 'Open in studio' })).toHaveCount(3);
  expect(problems).toEqual([]);
});
