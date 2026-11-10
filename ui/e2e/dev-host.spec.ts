import { expect, test } from '@playwright/test';

const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

test('the dev host lists the mappings on the fake API, opens one and goes back to the list', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  // the dev host and its editor stay on ?host=dev until the studio's tabs replace them (#154)
  await page.goto('/?api=fake&host=dev');

  const list = page.getByRole('table', { name: 'Mappings' });
  await expect(list.getByRole('button')).toHaveText(['mappings/order-id-copy', 'mappings/order-unmapped', 'mappings/tree-20128']);
  await list.getByRole('button', { name: 'mappings/order-id-copy' }).click();

  await expect(page.getByRole('heading', { name: 'mappings/order-id-copy' })).toBeVisible();
  await expect(page.getByTestId(`target-field:${ORDER_ID}`)).toContainText('← OrderId');
  await expect(list).toBeHidden();

  await page.getByRole('button', { name: 'All mappings' }).click();

  await expect(list).toBeVisible();
  await expect(page.getByRole('tree', { name: 'Target structure' })).toBeHidden();
  expect(problems).toEqual([]);
});

test('the start parameters open a mapping with a target field selected', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto(`/?mapping=mappings/order-id-copy&field=${encodeURIComponent(ORDER_ID)}&api=fake&host=dev`);

  await expect(page.getByRole('heading', { name: 'mappings/order-id-copy' })).toBeVisible();
  await expect(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();
  expect(problems).toEqual([]);
});
