import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined
});

try {
  const page = await browser.newPage({viewport: {width: 1600, height: 1100}});
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', {name, exact: true});
  const menuItem = name => page.getByRole('menuitem', {name, exact: true});
  const canvas = page.getByRole('group', {name: 'Mapping canvas', exact: true});
  const fields = {Grp: 'Doc/Grp', Row: 'Doc/Grp/Row', Val: 'Doc/Grp/Row/Val'};
  const fieldRow = name => page.locator('#target-message-pane [data-field-path="' + fields[name] + '"]');
  const field = name => fieldRow(name).locator('.field-name');
  const node = name => canvas.locator('.react-flow__node').filter({
    has: page.locator('.node-caption strong').getByText(name, {exact: true})
  });
  const targets = canvas.locator('.map-node.target .node-caption strong');
  const edges = canvas.locator('.react-flow__edge');

  async function verifyGraph(targetNames, connections) {
    await node(targetNames[0]).waitFor();
    assert.deepEqual((await targets.allTextContents()).sort(), [...targetNames].sort(), 'target nodes in the expression');
    const edgeNames = [];
    for (const [from, to] of connections) {
      const source = await node(from).getAttribute('data-id');
      const target = await node(to).getAttribute('data-id');
      edgeNames.push('Edge from ' + source + ' to ' + target);
    }
    if (edgeNames.length) await edges.first().waitFor({state: 'attached'});
    assert.deepEqual((await edges.evaluateAll(items => items.map(edge => edge.getAttribute('aria-label')))).sort(),
      edgeNames.sort(), 'visible graph connections');
  }

  async function nodeMenu(name) {
    await node(name).press('Shift+F10');
  }

  async function addFromMenu(name) {
    await field(name).click({button: 'right'});
    await menuItem('Add target to expression').click();
  }

  async function ungroup(name) {
    await nodeMenu(name);
    await menuItem('Ungroup').click();
    assert.equal(await field(name).getAttribute('aria-pressed'), 'true', 'focus the separated target expression');
  }

  const rowInputs = [['Sku', 'removeContexts'], ['removeContexts', 'Row']];
  const valInputs = [['Sku', 'removeContexts'], ['removeContexts', 'Val']];
  const bothInputs = [...rowInputs, ['removeContexts', 'Val']];
  const groupInput = ['Id', 'Grp'];
  await page.goto(new URL('../Mapping-studio.html#definition', import.meta.url).href);
  await field('Row').click();
  await verifyGraph(['Row'], rowInputs);
  await button('Edit').click();
  await nodeMenu('Row');
  assert.ok(await menuItem('Ungroup').isDisabled(), 'a standalone target has no group');
  await page.keyboard.press('Escape');

  await field('Val').dragTo(canvas.locator('.react-flow__pane'), {targetPosition: {x: 100, y: 45}});
  await node('Val').waitFor();
  await verifyGraph(['Row', 'Val'], rowInputs);
  assert.equal(await fieldRow('Val').getByLabel('Connected').count(), 0);
  await nodeMenu('removeContexts');
  await menuItem('Connect to').press('ArrowRight');
  await menuItem('Val · in0').press('Enter');
  await verifyGraph(['Row', 'Val'], bothInputs);
  for (const name of ['Row', 'Val']) {
    assert.equal(await node(name).locator('.map-node').getAttribute('data-state'), 'complete');
    assert.ok(await fieldRow(name).getByLabel('Connected').isVisible());
    await field(name).click();
    await verifyGraph(['Row', 'Val'], bothInputs);
  }

  await button('Save').click();
  await page.reload();
  await verifyGraph(['Row', 'Val'], bothInputs);
  await nodeMenu('Val');
  assert.ok(await menuItem('Ungroup').isDisabled(), 'read-only group cannot be split');
  await page.keyboard.press('Escape');
  await field('Grp').click({button: 'right'});
  assert.ok(await menuItem('Add target to expression').isDisabled(), 'read-only expression cannot gain a target');
  await page.keyboard.press('Escape');

  await button('Edit').click();
  await ungroup('Val');
  await verifyGraph(['Val'], valInputs);
  await nodeMenu('Sku');
  await menuItem('Disconnect').click();
  await verifyGraph(['Val'], [['removeContexts', 'Val']]);
  assert.equal(await node('Val').locator('.map-node').getAttribute('data-state'), 'incomplete');
  await field('Row').click();
  await verifyGraph(['Row'], rowInputs);
  assert.equal(await node('Row').locator('.map-node').getAttribute('data-state'), 'complete');
  await button('Cancel').click();
  await page.getByRole('dialog', {name: 'Discard changes?'}).getByRole('button', {name: 'Discard changes'}).click();
  await verifyGraph(['Row', 'Val'], bothInputs);

  await button('Edit').click();
  await field('Row').click();
  await addFromMenu('Grp');
  await verifyGraph(['Grp', 'Row', 'Val'], [...bothInputs, groupInput]);
  await button('Text Preview').click();
  const preview = page.locator('.preview-lines');
  for (const [name, expression] of [
    ['Grp', '/Orders/Order/Id'],
    ['Row', 'removeContexts(/Orders/Order/Line/Sku)'],
    ['Val', 'removeContexts(/Orders/Order/Line/Sku)']
  ]) {
    await preview.getByRole('button', {name: '/' + fields[name] + ' = ' + expression, exact: true}).waitFor();
  }
  await button('Data Flow Editor').click();
  await ungroup('Row');
  await verifyGraph(['Row'], rowInputs);
  await field('Grp').click();
  await verifyGraph(['Grp', 'Val'], [...valInputs, groupInput]);
  await nodeMenu('Val');
  await menuItem('Disconnect').click();
  await verifyGraph(['Grp', 'Val'], [valInputs[0], groupInput]);
  await button('Save').click();
  await page.reload();
  await verifyGraph(['Row'], rowInputs);
  assert.equal(await node('Row').locator('.map-node').getAttribute('data-state'), 'complete');
  await field('Val').click();
  await verifyGraph(['Grp', 'Val'], [valInputs[0], groupInput]);
  assert.equal(await node('Grp').locator('.map-node').getAttribute('data-state'), 'complete');
  assert.equal(await fieldRow('Val').getByLabel('Connected').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Grouped expression drag, menus, existing mappings, shared inputs, independent splits, discard and save/reload passed.');
} finally {
  await browser.close();
}
