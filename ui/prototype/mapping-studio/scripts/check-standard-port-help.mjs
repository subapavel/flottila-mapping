import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function checkStandardPortHelp(page,storage) {
  const catalogue=JSON.parse(await readFile(new URL('../src/standard-functions.json',import.meta.url),'utf8'));
  // Reopen a saved mapping: tooltips must work without re-inserting its functions.
  // Lookups can expose several selected columns/fields on either side.
  await page.evaluate(({catalogue,storage})=>{
    const workspace=JSON.parse(localStorage.getItem(storage)),map=workspace.maps[0];
    const graph=map.graphs['Doc/Grp/Row'];
    graph.edges=[];
    graph.nodes=graph.nodes.filter(n=>n.id==='target');
    catalogue.forEach((fn,i)=>{
      const lookup=['tableLookup','rfclookup'].includes(fn.key);
      const field=label=>({id:'field:'+label,label});
      const inputs=lookup?['CustomerId','Region'].map(field):fn.inputs.map((label,i)=>({id:'in'+i,label}));
      const outputs=lookup?['Name','Currency'].map(field):[{id:'out',label:'out'}];
      graph.nodes.push({id:fn.key,type:'mapping',position:{x:200*(i%8),y:70*Math.floor(i/8)},
        data:{kind:'function',name:fn.name,standardKey:fn.key,inputs,outputs,settings:fn.key==='TransformDate'?{iform:'dd.MM.yyyy',oform:'yyyyMMdd'}:{}}});
    });
    localStorage.setItem(storage,JSON.stringify(workspace));
  },{catalogue,storage});
  await page.reload();await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('.react-flow__node[data-id="isNil"]').waitFor({state:'attached'});
  const ports=await page.locator('.react-flow__node').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.id,
    [...n.querySelectorAll('.react-flow__handle')].map(p=>p.getAttribute('aria-label'))])));
  let total=0;
  for(const fn of catalogue){
    const labels=ports[fn.key],lookup=['tableLookup','rfclookup'].includes(fn.key);
    assert.equal(labels.length,lookup?4:fn.inputs.length+1,fn.key);
    for(const [i,label] of labels.entries()){
      const prefix=i<(lookup?2:fn.inputs.length)?'Input':'Output';
      const detail=label.split(' · ').slice(1).join(' · ');
      assert.ok(label.startsWith(prefix)&&detail.length>8&&detail!==fn.name&&!/[{}]|undefined/.test(detail),fn.key+': '+label);
      if(lookup)assert.ok(detail.includes(['CustomerId','Region','Name','Currency'][i]),detail);
    }
    total+=labels.length;
  }
  assert.match(ports.iF[1],/Boolean condition/);
  assert.match(ports.ifWithoutElse[0],/Boolean condition/);
  assert.match(ports.lastIndexOf3[2],/backward/);
  assert.match(ports.TransformDate[0],/dd\.MM\.yyyy/);
  assert.match(ports.TransformDate[1],/yyyyMMdd/);
  console.log(`Checked ${total} rendered port descriptions across ${catalogue.length} standard function variants, including configured lookup fields.`);
}
