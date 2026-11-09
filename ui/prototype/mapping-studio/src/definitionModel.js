import {fieldName,targetFields,emptyGraph,inputPorts} from './model';
import {isVariablePath} from './mappingVariables';
import {graphForPath,standaloneExpression,targetNode} from './groupedExpressions';

function inputs(graph,node) {
  return inputPorts(node).map(port=>{
    const edge=graph.edges.find(e=>e.target===node.id && (e.targetHandle||'in0')===port.id);
    return edge && graph.nodes.find(n=>n.id===edge.source);
  });
}
export function mappingPath(graph,path) {
  const nodes=[],seen=new Set();
  function walk(node){
    if(!node||seen.has(node.id))return;
    seen.add(node.id);
    inputs(graph,node).forEach(walk);
    if(node.data.kind!=='target')nodes.push(node);
  }
  walk(targetNode(graph,path));
  return nodes;
}
export function sourceLinks(graph,target) {
  const links=[];
  function walk(node,chain,seen){
    if(!node||seen.has(node.id))return;
    if(node.data.kind==='source'){links.push({target,source:node.data.path,functions:chain});return;}
    const next=node.data.kind==='target'?chain:[node.data.title||node.data.name,...chain];
    for(const parent of inputs(graph,node))walk(parent,next,new Set([...seen,node.id]));
  }
  walk(targetNode(graph,target),[],new Set());
  return links;
}
export function expression(graph,path) {
  function render(node,seen){
    if(!node || seen.has(node.id))return '';
    if(node.data.kind==='source')return '/'+node.data.path;
    const args=inputs(graph,node).map(parent=>render(parent,new Set([...seen,node.id])));
    return node.data.kind==='target' ? args[0]||'' : node.data.name+'('+args.join(', ')+')';
  }
  return render(targetNode(graph,path),new Set());
}
export function targetRows(map) {return map.targetRows || targetFields;}
export const under=(path,parent)=>path===parent || path.startsWith(parent+'/');
export function duplicateBranch(map,path) {
  const rows=targetRows(map);
  const branch=rows.filter(([p])=>under(p,path));
  if(!branch.length)return map;
  let index=2;
  const base=path.replace(/\[\d+\]$/,'');
  while(graphForPath(map,base+'['+index+']'))index++;
  const replace=p=>base+'['+index+']'+p.slice(path.length);
  const copies=branch.map(([p,...properties])=>[replace(p),...properties]);
  const graphs={...map.graphs};
  for(const [p] of branch) {
    const clone=standaloneExpression(graphForPath(map,p)||emptyGraph(p),p);
    const target=clone.nodes.find(n=>n.id==='target');
    target.data={...target.data,path:replace(p),name:fieldName(replace(p))};
    for(const {data} of clone.nodes)if(data.kind==='source'&&isVariablePath(data.path)&&under(data.path,path))data.path=replace(data.path);
    graphs[replace(p)]=clone;
  }
  const after=rows.findLastIndex(([p])=>under(p,path))+1;
  return {...map,graphs,targetRows:[...rows.slice(0,after),...copies,...rows.slice(after)]};
}
