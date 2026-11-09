import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {checkStandardPortHelp} from './check-standard-port-help.mjs';
import {checkExpressionActions} from './check-expression-actions.mjs';

const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}});
  page.setDefaultTimeout(5000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('../Mapping-studio.html#definition',import.meta.url).href);
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  const button=name=>page.getByRole('button',{name,exact:true});
  await button('Maximize mapping expression').click();
  const graph=page.locator('.flow-host'),node=id=>graph.locator('.react-flow__node[data-id="'+id+'"]');
  const edge=id=>graph.locator('.react-flow__edge[data-id="'+id+'"]');
  const port=(id,handle)=>node(id).locator('.react-flow__handle[data-handleid="'+handle+'"]');
  const box=async el=>{await el.waitFor();return el.boundingBox();};
  const center=async el=>{const b=await box(el);return {x:b.x+b.width/2,y:b.y+b.height/2};};
  async function drag(from,to){
    const a=await center(from),b=await center(to);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:18});await page.mouse.up();
  }
  const storage='flottila-mapping-studio.v1';
  async function saved(){
    if(await button('Save').isEnabled())await button('Save').click();
    return page.evaluate(k=>JSON.parse(localStorage.getItem(k)).maps[0].graphs['Doc/Grp/Row'],storage);
  }
  const cat=page.getByRole('region',{name:'Function catalogue'});
  for (const id of ['src-sku','target','fn-remove']) {
    await node(id).locator('.node-caption').dblclick();
    assert.equal(await graph.locator('.react-flow__node.selected').getAttribute('data-id'),id);
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('region',{name:'Node inspector'}).count(),0);
  }
  await cat.getByRole('searchbox').fill('useOneAsMany');
  await cat.getByRole('button',{name:'useOneAsMany',exact:true}).click();
  const many=await graph.locator('.react-flow__node.selected').getAttribute('data-id');
  const height=async id=>(await box(node(id))).height;
  const base=await height('src-sku');
  assert.equal(await height(many),base);
  assert.equal(await page.getByRole('toolbar',{name:'Mapping tools'}).getByRole('button',{name:/zoom/i}).count(),0);
  const pitch=async(id,a,b)=>(await center(port(id,b))).y-(await center(port(id,a))).y;
  assert.ok(Math.abs(await pitch(many,'in0','in1')-await pitch(many,'in1','in2'))<1);
  await port(many,'in1').hover();
  await page.getByRole('tooltip').filter({hasText:'number of repetitions'}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="tooltip"]')].some(el=>Number(getComputedStyle(el).opacity)>.95));
  await port('fn-remove','out').focus();
  await page.getByRole('tooltip').filter({hasText:'in a single context'}).waitFor();
  await node('src-sku').press('Shift+F10');
  await page.getByRole('menuitem',{name:'Connect to',exact:true}).press('ArrowRight');
  await page.getByRole('menuitem',{name:'useOneAsMany · a',exact:true}).press('Enter');
  let g=await saved();
  assert.equal(g.edges.length,3,'fan out an existing source');
  const wire=g.edges.find(e=>e.target===many);
  assert.equal(wire.targetHandle,'in0');
  await drag(port(many,'in0'),port(many,'in2'));
  g=await saved();assert.equal(g.edges.length,3);
  assert.equal(g.edges.find(e=>e.id===wire.id).targetHandle,'in2','move the occupied input directly');
  await drag(edge(wire.id).locator('.react-flow__edgeupdater-source'),port('fn-remove','out'));
  g=await saved();assert.equal(g.edges.find(e=>e.id===wire.id).source,'fn-remove','move source end');
  await drag(edge(wire.id).locator('.react-flow__edgeupdater-target'),port(many,'in1'));
  g=await saved();assert.equal(g.edges.find(e=>e.id===wire.id).targetHandle,'in1','move target end');
  await drag(port('src-sku','out'),port(many,'in0'));
  const occupied=(await saved()).edges.find(e=>e.target===many&&e.targetHandle==='in0');
  await drag(port('fn-remove','out'),port(many,'in0'));
  let next=await saved();
  assert.equal(next.edges.length,4,'creating a wire on an occupied input replaces it');
  assert.ok(!next.edges.some(e=>e.id===occupied.id));
  assert.equal(next.edges.find(e=>e.target===many&&e.targetHandle==='in0').source,'fn-remove');
  for(const e of g.edges)assert.deepEqual(next.edges.find(item=>item.id===e.id),e,'other inputs and branches survive');
  await drag(edge(wire.id).locator('.react-flow__edgeupdater-target'),port(many,'in0'));
  next=await saved();assert.equal(next.edges.length,3);
  assert.equal(next.edges.find(e=>e.id===wire.id).targetHandle,'in0','endpoint drag displaces the old owner');
  await drag(port('src-sku','out'),port(many,'in2'));
  await drag(port(many,'in0'),port(many,'in2'));
  g=await saved();assert.equal(g.edges.length,3);
  assert.equal(g.edges.find(e=>e.id===wire.id).targetHandle,'in2','occupied input can move onto another occupied input');
  await drag(port('fn-remove','out'),port(many,'in2'));
  assert.deepEqual((await saved()).edges,g.edges,'repeating the same connection is a no-op');
  await drag(port(many,'out'),port('fn-remove','in0'));
  assert.deepEqual((await saved()).edges,g.edges,'invalid drop leaves graph intact');
  await drag(edge('sku-remove').locator('.react-flow__edgeupdater-source'),port(many,'out'));
  assert.deepEqual((await saved()).edges,g.edges,'a cycle cannot replace the original connection');
  const before=await center(node(many));
  await page.mouse.move(before.x,before.y);await page.mouse.down();await page.mouse.move(before.x+72,before.y+22,{steps:8});await page.mouse.up();
  const moved=await saved();
  assert.deepEqual(moved.edges,g.edges,'moving a connected node preserves its wires');
  assert.notDeepEqual(moved.nodes.find(n=>n.id===many).position,g.nodes.find(n=>n.id===many).position);
  await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await height(many),base);
  const line=edge(wire.id).locator('.react-flow__edge-path');
  const point=await line.evaluate(p=>{const loc=p.getPointAtLength(p.getTotalLength()*.60).matrixTransform(p.getScreenCTM());return {x:loc.x,y:loc.y};});
  await page.mouse.click(point.x,point.y,{button:'right'});
  await page.getByRole('menuitem',{name:'Disconnect',exact:true}).click();
  assert.equal((await saved()).edges.length,2);
  await node(many).click({button:'right'});await page.getByRole('menuitem',{name:'Delete',exact:true}).click();
  await node(many).waitFor({state:'detached'});

  await page.getByRole('toolbar',{name:'Mapping expression',exact:true}).getByRole('button',{name:'Restore split view'}).click();
  await page.locator('#source-message-pane [data-field-path="Orders/Order/Line/Sku"] [draggable=true]')
    .dragTo(page.locator('#target-message-pane [data-field-path="Doc/Grp/Row"]'));
  const direct=await saved();
  assert.equal(direct.nodes.length,3,'direct replacement reuses the source and preserves the function');
  assert.deepEqual(direct.edges.map(e=>[e.source,e.target]),[['src-sku','fn-remove'],['src-sku','target']]);
  await button('Maximize mapping expression').click();

  // Exercise high arities on both sides with a saved custom function and a lookup.
  await saved();
  await page.evaluate(k=>{
    const workspace=JSON.parse(localStorage.getItem(k)),map=workspace.maps[0],g=map.graphs['Doc/Grp/Row'];
    const ports=n=>Array.from({length:n},(_,i)=>({id:'p'+i,label:'Field '+i}));
    for(const [id,count,x,y,out] of [['two',2,10,185,false],['four',4,220,185,false],['seven',7,450,185,true]]){
      const data={kind:'function',name:id,inputs:out?[]:ports(count),outputs:out?ports(count):[{id:'out',label:'out'}]};
      if(id==='four'){
        map.customFunctions=[{id,name:id,title:id,category:'User-Defined',execution:'Single Values',description:'Converts amounts.',
          variables:ports(count).map(p=>({kind:'Argument',id:p.id,name:p.id,javaType:'int',title:p.label,description:'Amount in cents.'}))}];
        data.functionId=id;
      }
      g.nodes.push({id,type:'mapping',position:{x,y},data});
    }
    localStorage.setItem(k,JSON.stringify(workspace));
  },storage);
  await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();await button('Layout mapping').click();
  assert.equal(await height('two'),base);
  assert.equal(await height('four'),2*base);
  assert.equal(await height('seven'),3*base);
  assert.equal((await box(node('seven'))).width,(await box(node('two'))).width);
  assert.ok(Math.abs(await pitch('two','p0','p1')-await pitch('four','p0','p1'))<1);
  await port('four','p1').hover();await page.getByRole('tooltip').filter({hasText:'Amount in cents.'}).waitFor();
  await port('four','out').focus();await page.getByRole('tooltip').filter({hasText:'Converts amounts.'}).waitFor();
  const origin=await center(node('seven'));
  await page.mouse.move(origin.x,origin.y);await page.mouse.wheel(0,140);
  assert.equal(await height('seven'),3*base,'wheel cannot zoom');
  await page.setViewportSize({width:900,height:850});await button('Layout mapping').click();
  assert.equal(await height('seven'),3*base,'layout and resize preserve scale');
  await page.setViewportSize({width:1500,height:950});
  await checkExpressionActions(page,storage);
  await checkStandardPortHelp(page,storage);
  assert.deepEqual(errors,[]);
  console.log('Canvas: fixed node sizes, individual port hints, mouse wiring, endpoint reconnection, invalid drops, disconnect, delete and save/reload passed.');
}finally{await browser.close();}
