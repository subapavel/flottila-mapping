import {inputPorts,outputPorts} from './model';
import {parsePayload} from './testData';
import {isVariablePath} from './mappingVariables';

// Keep each occurrence of the selected context separate until removeContexts flattens it.
function sourceGroups(document,format,{path,context}){
  const names=path.split('/'),groups=[];
  const xml=format==='XML';
  const root=xml?document.documentElement:document;
  if(xml&&root.localName!==names[0])return groups;
  function visit(value,level,group){
    if(names[level]===context||!group){group=[];groups.push(group);}
    if(level===names.length-1){
      const label=xml?(value.children.length?value.localName:value.textContent)
        :value!==null&&typeof value==='object'?names[level]:String(value);
      group.push(label);return;
    }
    const key=names[level+1];
    if(xml){for(const child of value.children)if(child.localName===key)visit(child,level+1,group);}
    else if(value&&typeof value==='object'&&Object.hasOwn(value,key)){
      const child=value[key];for(const item of Array.isArray(child)?child:[child])visit(item,level+1,group);
    }
  }
  visit(root,0,null);
  return groups.filter(group=>group.length);
}
function queueCells(groups){
  if(!groups?.length)return [];
  const cells=[['<null>','boundary']];
  for(const [index,group] of groups.entries()){
    for(const value of group)cells.push(['['+value+']','value']);
    cells.push(['['+group.at(-1)+']',index===groups.length-1?'end':'boundary']);
  }
  return cells;
}
export function previewQueue(graph,id,input,format,graphForPath){
  const node=graph.nodes.find(n=>n.id===id);
  if(!node)return {name:'Queue',columns:[],note:'Select a node to display its queue.'};
  const name=node.data.title||node.data.name;
  let document;
  try{document=parsePayload(input.text,format);}
  catch{return {name,columns:[],note:'The selected input is not valid '+format+'. Choose another test input.'};}
  function incoming(expression,n,port,seen){
    const edge=expression.edges.find(e=>e.target===n.id&&(e.targetHandle||'in0')===port);
    return edge?output(expression,expression.nodes.find(s=>s.id===edge.source),seen):null;
  }
  function output(expression,n,seen){
    if(!n||seen.has(n))return null;
    seen.add(n);
    if(n.data.kind==='source'){
      const path=n.data.path;
      if(!isVariablePath(path))return sourceGroups(document,format,n.data);
      if(seen.has(path))return null;
      seen.add(path);
      const definition=graphForPath?.(path);
      const target=definition?.nodes.find(node=>node.data.kind==='target' && node.data.path===path);
      return target?incoming(definition,target,'in0',seen):null;
    }
    if(n.data.standardKey==='removeContexts'||(!n.data.functionId&&n.data.name==='removeContexts')){
      const groups=incoming(expression,n,'in0',seen);
      return groups===null?null:groups.length?[groups.flat()]:[];
    }
    return null;
  }
  const column=(port,groups)=>({label:name+':'+port.id,known:groups!==null,cells:queueCells(groups)});
  const columns=[...inputPorts(node).map(port=>column(port,incoming(graph,node,port.id,new Set()))),
    ...outputPorts(node).map(port=>column(port,output(graph,node,new Set())))];
  const note=columns.some(c=>!c.known)?'Queue preview supports source fields, variables and removeContexts. Values require a connected expression using supported functions.':
    columns.every(c=>!c.cells.length)?'No matching values in this input.':'';
  return {name,columns,note};
}
