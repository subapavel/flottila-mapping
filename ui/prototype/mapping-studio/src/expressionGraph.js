import {inputPorts,outputPorts} from './model';
import {standardFunction} from './standardFunctions';

export const nodeWidth=164;
export const nodeHeight=n=>48*Math.max(1,Math.ceil(Math.max(inputPorts(n).length,outputPorts(n).length)/3));

export function inspectExpression({nodes,edges}) {
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const inputs=new Map(nodes.map(n=>[n.id,new Map()]));
  const wired=new Set();
  for(const e of edges){
    if(!byId.has(e.source)||!byId.has(e.target))continue;
    inputs.get(e.target).set(e.targetHandle||'in0',e.source);
    wired.add(e.source);wired.add(e.target);
  }
  const states=new Map(),visiting=new Set();
  function visit(id) {
    if(states.has(id))return states.get(id);
    if(visiting.has(id))return {kind:'incomplete'}; // Also tolerate an invalid imported cycle.
    visiting.add(id);
    const n=byId.get(id),wires=inputs.get(id),ports=inputPorts(n);
    const missing=ports.filter(p=>!wires.has(p.id));
    const upstream=[...wires.values()].filter(src=>visit(src).kind!=='complete');
    const fn=standardFunction(n.data.standardKey);
    const missingSettings=(fn?.parameters||[]).filter(p=>
      (Object.hasOwn(n.data.settings||{},p.key)?n.data.settings[p.key]:p.initial)==null);
    const reason=missing.length?'Connect '+missing.map(p=>p.label).join(', ')+'.':
      missingSettings.length?'Set '+missingSettings.map(p=>p.label||p.key).join(', ')+'.':
      upstream.length?'Complete the input from '+byId.get(upstream[0]).data.name+'.':'';
    const state={kind:reason?'incomplete':'complete',description:reason?'Incomplete: '+reason:'Complete: all inputs on this path are connected.',missing:missing.map(p=>p.id)};
    visiting.delete(id);states.set(id,state);return state;
  }
  nodes.filter(n=>n.data.kind==='target').forEach(n=>visit(n.id));
  const floating=[];
  for(const n of nodes)if(!states.has(n.id)){
    const hasWire=wired.has(n.id);
    states.set(n.id,{kind:'detached',description:hasWire?'Detached: this branch has no path to the target.':'Detached: this object has no connections.',missing:[]});
    if(n.deletable!==false)floating.push(n.id);
  }
  return {states,floating};
}

// Layer each connected component from left to right. Walk inputs in port order
// so a function's first argument is placed above its subsequent arguments.
export function layoutExpression({nodes,edges}){
  const positions=new Map(),byId=new Map(nodes.map(n=>[n.id,n]));
  const ins=new Map(nodes.map(n=>[n.id,[]])),outs=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges)if(byId.has(e.source)&&byId.has(e.target)){
    ins.get(e.target).push(e);outs.get(e.source).push(e.target);
  }
  for(const n of nodes){
    const ports=inputPorts(n).map(p=>p.id);
    ins.get(n.id).sort((a,b)=>ports.indexOf(a.targetHandle||'in0')-ports.indexOf(b.targetHandle||'in0'));
  }
  const dx=nodeWidth+64,gap=24,seen=new Set(),loose=[];
  let top=0,right=0,bottom=0;
  function place(id,col,y){
    const x=col*dx;positions.set(id,{x,y});
    right=Math.max(right,x+nodeWidth);bottom=Math.max(bottom,y+nodeHeight(byId.get(id)));
  }
  for(const start of [...nodes.filter(n=>n.data.kind==='target'),...nodes]){
    if(seen.has(start.id))continue;
    const component=[],stack=[start.id];
    while(stack.length){
      const id=stack.pop();
      if(seen.has(id))continue;
      seen.add(id);component.push(id);
      stack.push(...outs.get(id),...ins.get(id).map(e=>e.source));
    }
    if(component.length===1 && start.data.kind!=='target'){loose.push(start.id);continue;}
    const ranks=new Map(),active=new Set(),columns=[];
    function rank(id){
      if(ranks.has(id))return ranks.get(id);
      if(active.has(id))return -1;
      active.add(id);
      const col=ins.get(id).reduce((v,e)=>Math.max(v,rank(e.source)+1),0);
      active.delete(id);ranks.set(id,col);(columns[col]??=[]).push(id);return col;
    }
    component.filter(id=>!outs.get(id).length).forEach(rank);
    component.forEach(rank);
    const heights=columns.map(col=>col.reduce((h,id)=>h+nodeHeight(byId.get(id))+gap,-gap));
    const height=Math.max(...heights);
    columns.forEach((col,i)=>{
      let y=top+(height-heights[i])/2;
      for(const id of col){place(id,i,y);y+=nodeHeight(byId.get(id))+gap;}
    });
    top+=height+gap*2;
  }
  for(let i=0;i<loose.length;i+=3){
    const row=loose.slice(i,i+3);
    row.forEach((id,col)=>place(id,col,top));
    top+=Math.max(...row.map(id=>nodeHeight(byId.get(id))))+gap;
  }
  return {positions,center:{x:right/2,y:bottom/2}};
}
