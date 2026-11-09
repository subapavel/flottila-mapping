import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const artifact=new URL('../Mapping-studio.html',import.meta.url);
async function verifyEmptyInstanceSelect(select) {
  await select.waitFor({state:'visible'});
  assert.ok(await select.isDisabled());
  assert.equal(await select.inputValue(),'');
  assert.equal(await select.locator('option').count(),0);
}

async function verifyTestLayout(page) {
  const tab = name => page.getByRole('tab', {name, exact:true});
  const instances = page.getByRole('toolbar', {name:'Test instance actions'});
  const simulation = page.getByRole('toolbar', {name:'Simulation controls'});
  const docsButton = name => instances.getByRole('button', {name, exact:true});
  const logButton = name => simulation.getByRole('button', {name, exact:true});
  const input = page.locator('#test-input-pane');
  const result = page.locator('#test-result-pane');
  const log = page.getByRole('region', {name:'Processing log', exact:true});
  const divider = page.getByRole('separator', {name:'Resize processing log'});

  async function check(view) {
    await simulation.waitFor();
    assert.equal(await input.isVisible(), view !== 'log');
    assert.equal(await result.isVisible(), view !== 'log');
    assert.equal(await log.isVisible(), view !== 'documents');
    assert.equal(await divider.isVisible(), view === 'split');
    assert.equal(await docsButton('Restore split view').isVisible(), view !== 'split');
    assert.equal(await logButton('Restore split view').isVisible(), view !== 'split');
    assert.ok(await logButton('Run simulation').isVisible());
    assert.ok(await simulation.getByLabel('Trace Level').isVisible());
  }
  async function verifyPersistence(view) {
    await check(view);
    await tab('Definition').click();
    await page.getByRole('separator',{name:'Resize mapping area'}).waitFor();
    await tab('Test').click();
    await check(view);
    await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
    await check(view);
  }
  await tab('Test').click();
  for(const toolbar of [instances,simulation]){
    const controls=toolbar.getByRole('group',{name:/ layout$/});
    const bounds=await controls.boundingBox();
    const bar=await toolbar.boundingBox();
    assert.ok(bounds.x >= bar.x && bounds.x+bounds.width <= bar.x+bar.width+1);
  }
  await divider.press('ArrowUp');
  const share = await divider.getAttribute('aria-valuenow');
  const inputHeight = (await input.boundingBox()).height;
  const logHeight = (await log.boundingBox()).height;
  await docsButton('Maximize input and result').click();
  await verifyPersistence('documents');
  assert.ok((await input.boundingBox()).height >= inputHeight + logHeight);
  assert.equal((await input.boundingBox()).height, (await result.boundingBox()).height);
  await docsButton('Generate Instance').click();
  await logButton('Run simulation').click();
  await logButton('Maximize processing log').click();
  await log.getByText('Executed successfully', {exact:true}).waitFor();
  await verifyPersistence('log');
  assert.ok((await log.boundingBox()).height >= inputHeight + logHeight);
  await docsButton('Restore split view').click();
  await verifyPersistence('split');
  assert.equal(await divider.getAttribute('aria-valuenow'), share);
  assert.ok(Math.abs((await log.boundingBox()).height - logHeight) < 2);
  await docsButton('Minimize input and result').click();
  await check('log');
  await logButton('Minimize processing log').click();
  await check('documents');
  await logButton('Restore split view').click();
  await check('split');
  await tab('Definition').click();
}

async function verify(format,width){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const button=(name,scope=page)=>scope.getByRole('button',{name,exact:true});
  const expr=page.getByRole('toolbar',{name:'Mapping expression',exact:true});
  const top=page.getByRole('toolbar',{name:'Definition actions',exact:true});
  const dlg=page.getByRole('dialog'),input=page.getByRole('combobox',{name:'Queue test input'});
  const trees=page.locator('.definition-split-layout > .split-upper'),canvas=page.getByRole('region',{name:'Field mapping canvas'});
  const sep=page.getByRole('separator',{name:'Resize mapping area'});
  const content=v=>format==='XML'?'<Orders><Order><Line><Sku>'+v+'</Sku></Line></Order></Orders>':JSON.stringify({Order:[{Line:[{Sku:v}]}]});
  const file=text=>({name:'orders.'+format.toLowerCase(),mimeType:'application/'+format.toLowerCase(),buffer:Buffer.from(text)});
  const tools=page.getByRole('toolbar',{name:'Mapping tools',exact:true});
  const queue=()=>button('Display Queue',tools).click();
  async function verifyLayoutPersists(view) {
    async function check() {
      await expr.waitFor();
      assert.equal(await trees.isVisible(),view!=='maximized');
      assert.equal(await canvas.isVisible(),view!=='minimized');
      assert.equal(await sep.isVisible(),view==='split');
      for(const toolbar of [top,expr]){
        assert.equal(await button('Restore split view',toolbar).isVisible(),view!=='split');
      }
    }
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    await button('Run simulation').waitFor();
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    await check();
    await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
    await check();
  }
  try{
    await page.goto(artifact.href);
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    const overview=page.getByRole('tab',{name:'Overview',exact:true});
    assert.equal(await overview.getAttribute('aria-selected'),'true');
    assert.equal(await page.getByRole('tab').first().innerText(),'Overview');
    const description=page.getByRole('textbox',{name:'Description',exact:true});
    const note='Orders to Doc\nMapping notes for '+format;
    await description.fill(note);
    await button('Save').click();
    await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await description.inputValue(),note);
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    assert.equal(await button('Generate Instance',expr).count(),0);
    assert.equal(await button('Display Queue',expr).count(),0);
    assert.equal(await expr.getByText('Test input',{exact:true}).count(),0);
    await verifyEmptyInstanceSelect(input);
    if(format==='JSON'){
      for(const side of ['source','target']){
        await button('Change '+side+' message').click();await dlg.getByRole('button',{name:/JSON/}).click();
      }
      await button('Save').click();
    }
    await sep.focus();await sep.press('ArrowUp');
    const upper=(await trees.boundingBox()).height;
    const splitCanvasHeight=(await canvas.boundingBox()).height;
    await button('Maximize mapping expression').click();
    assert.equal(await trees.isVisible(),false);assert.ok(await canvas.isVisible());
    assert.ok(await page.getByRole('toolbar',{name:'Definition actions'}).isVisible());
    for(const name of ['Overview','Definition','Test','Signature','Functions']){
      assert.ok(await page.getByRole('tab',{name,exact:true}).isVisible(),name+' tab is visible when maximized');
    }
    const workspace=await page.locator('.definition-split-layout').boundingBox();
    assert.ok(Math.abs((await expr.boundingBox()).y-workspace.y)<2);
    assert.ok((await canvas.boundingBox()).height>=splitCanvasHeight+upper-2);
    await verifyLayoutPersists('maximized');
    await button('Maximize message trees',top).click();
    assert.equal(await canvas.isVisible(),false);assert.ok((await trees.boundingBox()).height>upper+70);
    assert.ok(await expr.isVisible());
    await verifyLayoutPersists('minimized');
    await button('Restore split view',expr).click();
    await verifyLayoutPersists('split');
    assert.ok(Math.abs((await trees.boundingBox()).height-upper)<2);
    await button('Minimize message trees',top).click();
    assert.equal(await trees.isVisible(),false);
    await button('Minimize mapping expression',expr).click();
    assert.equal(await canvas.isVisible(),false);
    await button('Restore split view',top).click();
    await sep.waitFor();
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    const instances=page.getByLabel('Select test instance');
    await verifyEmptyInstanceSelect(instances);
    await button('Run simulation').click();
    await page.getByText('Executed successfully',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    await verifyEmptyInstanceSelect(input);
    await queue();await dlg.getByLabel('Test input file').setInputFiles(file('not a valid payload'));
    await dlg.getByRole('alert').waitFor();await button('Cancel',dlg).click();
    await queue();await dlg.getByLabel('Test input file').setInputFiles(file(content('from-file')));
    await dlg.getByLabel('removeContexts queue').waitFor();assert.ok((await dlg.innerText()).includes('[from-file]'));
    await page.keyboard.press('Escape');
    await verifyEmptyInstanceSelect(input);
    await button('Add Test Instance',expr).click();await dlg.getByLabel('Test instance name').fill('Queue fixture');await button('OK',dlg).click();
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    assert.deepEqual(await instances.locator('option').allTextContents(),['Queue fixture']);
    assert.equal(await instances.locator('option:checked').textContent(),'Queue fixture');
    const draft=page.getByRole('textbox',{name:'Input '+format});assert.equal(await draft.inputValue(),content('from-file'));
    const trace=page.getByLabel('Trace Level',{exact:true});
    const log=page.getByRole('region',{name:'Processing log',exact:true}).locator('.processing-lines');
    const output=page.locator('#test-result-pane pre');
    await trace.selectOption('All');
    await draft.fill(content('from-run'));await button('Run simulation').click();await page.getByText('Executed successfully',{exact:true}).waitFor();
    const originalOutput=await output.textContent(), originalLog=await log.innerText();
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    assert.deepEqual(await input.locator('option').allTextContents(),['Queue fixture']);
    assert.equal(await input.locator('option:checked').textContent(),'Queue fixture');
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    await trace.selectOption('No trace');
    await draft.fill(content('not-run'));await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();await output.waitFor();
    assert.equal(await draft.inputValue(),content('from-run'));
    assert.equal(await output.textContent(),originalOutput);
    assert.equal(await log.innerText(),originalLog);
    assert.equal(await trace.inputValue(),'All');
    await draft.fill('malformed');await button('Run simulation').click();
    await page.getByText(/before running the simulation/).waitFor();
    const failureLog=await log.innerText();
    await draft.fill(content('unrun-draft'));await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();await log.waitFor();
    assert.equal(await draft.inputValue(),'malformed');
    assert.equal(await log.innerText(),failureLog);
    assert.equal(await output.count(),0);
    await page.getByText('The simulation failed.',{exact:true}).waitFor();
    await draft.fill(content('from-second'));
    await button('Add Test Instance').click();await dlg.getByLabel('Test instance name').fill('Second fixture');await button('OK',dlg).click();
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    assert.deepEqual(await input.locator('option').allTextContents(),['Queue fixture','Second fixture']);
    assert.equal(await input.locator('option:checked').textContent(),'Second fixture');
    await button('Maximize mapping expression').click();
    await queue();await dlg.getByLabel('removeContexts queue').waitFor();
    assert.ok((await dlg.innerText()).includes('[from-second]'));
    await page.keyboard.press('Escape');
    await input.selectOption({label:'Queue fixture'});
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    assert.equal(await instances.locator('option:checked').textContent(),'Queue fixture');
    assert.equal(await draft.inputValue(),content('from-file'));
    await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await instances.locator('option:checked').textContent(),'Queue fixture');
    assert.equal(await draft.inputValue(),content('from-file'));
    await instances.selectOption({label:'Second fixture'});
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    assert.equal(await input.locator('option:checked').textContent(),'Second fixture');
    await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await input.locator('option:checked').textContent(),'Second fixture');
    assert.equal(await trees.isVisible(),false);
    await button('Restore split view',top).click();
    await page.locator('.react-flow__node[data-id="fn-remove"]').click({button:'right'});
    await page.getByRole('menuitem',{name:'Display Queue',exact:true}).click();
    await dlg.getByLabel('removeContexts queue').waitFor();assert.ok((await dlg.innerText()).includes('[from-second]'));await page.keyboard.press('Escape');
    await button('Delete Test Instance',expr).click();await button('Delete',dlg).click();
    assert.equal(await input.locator('option:checked').textContent(),'Queue fixture');
    await page.getByRole('tab',{name:'Test',exact:true}).click();
    assert.equal(await instances.locator('option:checked').textContent(),'Queue fixture');
    await button('Delete Test Instance').click();await button('Delete',dlg).click();
    await verifyEmptyInstanceSelect(instances);
    await page.getByRole('tab',{name:'Definition',exact:true}).click();
    await verifyEmptyInstanceSelect(input);
    await queue();await dlg.getByLabel('Test input file').waitFor();await button('Cancel',dlg).click();
    if(process.env.CAPTURE_EXPRESSION_TOOLBAR==='1'&&width>900){
      await expr.screenshot({path:fileURLToPath(new URL('../nahled-expression-toolbar.png',import.meta.url))});
    }
    await verifyTestLayout(page);
    await button('Change source message').click();await dlg.getByRole('button',{name:format==='XML'?/JSON/:/XML/}).click();
    await queue();await dlg.getByLabel('Test input file').waitFor();
    assert.deepEqual(errors,[]);
    console.log(format+' at '+width+' px: split, minimize, maximize, upload, shared library, last run, reload, context menu and format isolation passed.');
  }catch(e){console.error('Dialog:',await dlg.allTextContents(),'Page errors:',errors);throw e;}finally{await page.close();}
}
try{await verify('XML',1440);await verify('JSON',390);}finally{await browser.close();}
