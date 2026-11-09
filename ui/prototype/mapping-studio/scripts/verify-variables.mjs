import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {availableVariables,restoreVariableOrder,variableTargets} from '../src/mappingVariables.js';

const legacyRows=['Doc','Doc/A','Doc/A/Leaf','Doc/A/$Earlier','Doc/A/$Later','Doc/B','Doc/$Root'].map(path=>[path,'0..1']);
const restored=restoreVariableOrder(legacyRows);
assert.deepEqual(availableVariables(restored,'Doc/A/$Later').map(([p])=>p),['Doc/$Root','Doc/A/$Earlier']);
assert.deepEqual(variableTargets(restored,'Doc/A/$Earlier').map(([p])=>p),['Doc/A/$Later','Doc/A/Leaf']);
assert.deepEqual(variableTargets(restored,'Doc/$Missing'),[]);

const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const dialog=page.getByRole('dialog');
  const row=path=>page.locator('#target-message-pane tr[data-field-path="'+path+'"]');
  const node=id=>page.locator('.react-flow__node[data-id="'+id+'"]');
  const tip=page.getByRole('tooltip');
  const grp='Doc/Grp', first=grp+'/$GroupValue', second=grp+'/$SecondValue';
  const order=()=>page.locator('#target-message-pane tbody tr').evaluateAll(els=>els.map(e=>e.dataset.fieldPath));
  const expected=['Doc',grp,second,first,grp+'/Row',grp+'/Row/Val'];
  async function checkQueue(format,expectedValues,boundaries) {
    await button('Display Queue').click();
    const file=dialog.getByLabel('Test input file');
    await dialog.waitFor();
    if(await file.count()){
      const text=format==='XML'
        ? '<Orders><Order><Line><Sku>first</Sku></Line><Line><Sku>second</Sku></Line></Order></Orders>'
        : JSON.stringify({Order:[{Line:[{Sku:'first'},{Sku:'second'}]}]});
      await file.setInputFiles({name:'variables.'+format.toLowerCase(),mimeType:'application/'+format.toLowerCase(),buffer:Buffer.from(text)});
    }
    await dialog.locator('.queue-table').waitFor();
    assert.deepEqual(await dialog.locator('td.q-value code').allTextContents(),expectedValues);
    if(!expectedValues.length)assert.match(await dialog.innerText(),/Unavailable/);
    if(boundaries!==undefined)assert.equal(await dialog.locator('.q-boundary').count(),boundaries);
    await page.keyboard.press('Escape');
  }
  await page.goto(new URL('../Mapping-studio.html#definition',import.meta.url).href);
  await node('src-sku').locator('.node-caption').hover();
  await tip.filter({hasText:'/Orders/Order/Line/Sku'}).waitFor();
  assert.match(await tip.innerText(),/Context · Line[\s\S]*Complete:/);
  await node('src-sku').locator('.mapping-state-mark').hover();
  assert.equal(await tip.count(),1);
  assert.equal(await page.locator('.map-node[title],.map-node [title]').count(),0);
  assert.equal(await node('src-sku').locator('.node-meta').count(),0);
  await row(grp).getByRole('button',{name:'Grp',exact:true}).click();
  assert.equal(await node('src-id').locator('.changed-context').innerText(),'Id');
  assert.equal(await node('src-id').locator('.node-meta').innerText(),'Context · Orders');
  await button('Edit').click();
  await button('Collapse '+grp).click();
  for(const name of ['GroupValue','SecondValue']){
    await row(grp).click({button:'right'});
    await page.getByRole('menuitem',{name:'Add Variable',exact:true}).click();
    await page.getByLabel('Variable name').fill(name);
    await button('Create').click();
    await button('Variable '+name).waitFor();
  }
  assert.deepEqual(await order(),expected);
  if(process.env.MAPPING_VARIABLES_SCREENSHOT){
    await node('src-id').locator('.node-caption').hover();
    await tip.filter({hasText:'Context · Orders'}).waitFor();
    await page.waitForFunction(()=>{const el=document.querySelector('[role="tooltip"]');return el && Number(getComputedStyle(el).opacity)>.95;});
    await page.screenshot({path:process.env.MAPPING_VARIABLES_SCREENSHOT});
  }
  assert.equal(await row(first).locator('.field-type-column').innerText(),'');
  await button('Variable GroupValue').click();
  assert.equal(await node('target').locator('[data-field-type="variable"]').count(),1);
  await node('target').focus();
  await tip.filter({hasText:'Mapping variable'}).waitFor();
  assert.match(await tip.innerText(),/Incomplete:/);
  await row(grp+'/Row/Val').getByRole('button',{name:'Val',exact:true}).click();
  const canvas=page.getByRole('group',{name:'Mapping canvas',exact:true});
  await row(first).locator('td.occurs').dragTo(canvas,{targetPosition:{x:100,y:90}});
  assert.equal(await page.locator('.map-node.source [data-field-type="variable"]').count(),1);
  assert.equal(await row(grp+'/Row/Val').locator('.field-name').getAttribute('aria-pressed'),'true');
  await checkQueue('XML',[]);

  // Map the earlier variable from a payload field, then use it in the later variable.
  const sku=page.locator('#source-message-pane tr[data-field-path="Orders/Order/Line/Sku"]');
  await sku.locator('td.occurs').dragTo(row(second));
  await row(second).locator('td.occurs').dragTo(row(first));
  await button('Variable SecondValue').click();
  await button('Add node').click();
  await button('Variables').click();
  assert.equal(await dialog.locator('.palette-items button').count(),0);
  await page.keyboard.press('Escape');
  await button('Variable GroupValue').click();
  await button('Add node').click();
  await button('Variables').click();
  assert.deepEqual(await dialog.locator('.palette-items b').allTextContents(),['SecondValue']);
  await dialog.getByRole('button',{name:/SecondValue/}).click();
  assert.equal(await page.locator('.map-node.source [data-field-type="variable"]').count(),2);
  // Starting on the variable's own expression still offers eligible destinations.
  await button('Variable GroupValue').press('Shift+F10');
  await page.getByRole('menuitem',{name:'Add variable to expression',exact:true}).press('ArrowRight');
  await page.getByRole('menuitem',{name:'/Doc/Grp/Row/Val',exact:true}).press('Enter');
  assert.equal(await row(grp+'/Row/Val').locator('.field-name').getAttribute('aria-pressed'),'true');
  await checkQueue('XML',['[first]','[second]'],2);

  // The existing removeContexts mapping becomes the earlier variable's definition.
  await row(grp+'/Row').locator('.field-name').click();
  await node('fn-remove').click();
  await button('Copy').click();
  await button('Variable SecondValue').click();
  await button('Paste').click();
  await canvas.locator('.react-flow__node:has(.map-node.function)').press('Shift+F10');
  await page.getByRole('menuitem',{name:'Connect to',exact:true}).press('ArrowRight');
  await page.getByRole('menuitem',{name:/SecondValue · in0$/}).press('Enter');
  await row(grp+'/Row/Val').locator('.field-name').click();
  await checkQueue('XML',['[first]','[second]'],1);
  await button('Save').click();
  await page.reload();
  assert.deepEqual(await order(),expected);
  assert.equal(await row(first).evaluate(el=>el.draggable),false);
  assert.equal(await button('Add node').isDisabled(),true);
  await button('Edit').click();
  await button('Change target message').click();
  await page.getByRole('dialog').getByRole('button',{name:/JSON_tgt_nested/}).click();
  await button('Change source message').click();
  await dialog.getByRole('button',{name:/JSON/}).click();
  await row(grp+'/Row/Val').locator('.field-name').click();
  await checkQueue('JSON',['[first]','[second]'],1);
  assert.deepEqual(await order(),expected);
  assert.equal(await row(first).locator('[data-field-type="variable"]').count(),1);
  await button('Save').click();

  // A legacy workspace can contain references that the editor now rejects.
  await page.evaluate(({first,second})=>{
    const key='flottila-mapping-studio.v1';
    const saved=JSON.parse(localStorage.getItem(key)),map=saved.maps.find(m=>m.id===saved.active);
    for(const node of map.graphs[second].nodes)if(node.data.kind==='source')node.data.path=first;
    const variables=map.targetRows.filter(([path])=>path===first || path===second);
    map.targetRows=[...map.targetRows.filter(row=>!variables.includes(row)),...variables];
    localStorage.setItem(key,JSON.stringify(saved));
  },{first,second});
  await page.reload();
  assert.deepEqual(await order(),expected);
  await button('Edit').click();
  await row(grp+'/Row/Val').locator('.field-name').click();
  await checkQueue('JSON',[]);
  assert.deepEqual(errors,[]);
  console.log('XML and JSON: full-row variable drag, palette scope, nested queues, read-only mode, reload and tooltips passed.');
} finally {await browser.close();}
