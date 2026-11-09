import {standardFunctions,standardFunction,standardNodeData} from './standardFunctions';
import {availableVariables,isVariablePath,restoreVariableOrder} from './mappingVariables';
import {graphForPath,targetNode,targetsOf,upstreamIds} from './groupedExpressions';

export const sourceFields = [
  ['Orders', '1..1'], ['Orders/Order', '0..∞'], ['Orders/Order/Id', '0..1'],
  ['Orders/Order/Tag', '0..∞'], ['Orders/Order/Line', '0..∞'], ['Orders/Order/Line/Sku', '0..1'],
  ['Orders/Order/Line/Qty', '0..1', {JSON:'number'}], ['Orders/Order/Memo', '0..1'], ['Orders/Order/Memo/Text', '0..1'],
];
export const targetFields = [['Doc', '1..1'], ['Doc/Grp', '0..∞'], ['Doc/Grp/Row', '1..2'], ['Doc/Grp/Row/Val', '0..1']];
export const fieldName = path => path.split('/').at(-1);
export const contexts = path => path.split('/').slice(0,-1).reverse();
export function schemaLines(fields) {
  const lines = [];
  function line(level, text, path) { lines.push({content: '  '.repeat(level) + text, path}); }
  function element(path, occurs, level, types) {
    const children = fields.filter(([p]) => p.substring(0, p.lastIndexOf('/')) === path);
    const [min, max] = occurs.replace('∞', 'unbounded').split('..');
    const cardinality = (min === '1' ? '' : ' minOccurs="' + min + '"') + (max === '1' ? '' : ' maxOccurs="' + max + '"');
    const name = '<xsd:element name="' + fieldName(path) + '"';
    if (!children.length) {
      line(level, name + ' type="xsd:' + (types?.XML || 'string') + '"' + cardinality + '/>', path);
      return;
    }
    line(level, name + cardinality + '>', path);
    line(level + 1, '<xsd:complexType>');
    line(level + 2, '<xsd:sequence>');
    children.forEach(([p, occ, childTypes]) => element(p, occ, level + 3, childTypes));
    line(level + 2, '</xsd:sequence>');
    line(level + 1, '</xsd:complexType>');
    line(level, '</xsd:element>');
  }
  line(0, '<?xml version="1.0" encoding="UTF-8"?>');
  line(0, '<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">');
  element(fields[0][0], fields[0][1], 1, fields[0][2]);
  line(0, '</xsd:schema>');
  return lines;
}
export const nodeNames = [...new Set(standardFunctions.flatMap(fn=>[fn.key,fn.name]))];
export const inputXml = `<?xml version="1.0" encoding="UTF-8"?>
<Orders>
  <Order>
    <Id>o1</Id>
    <Line><Sku>a</Sku></Line>
  </Order>
  <Order>
    <Id>o2</Id>
    <Line><Sku>b</Sku></Line>
  </Order>
</Orders>`;
export const outputXml = `<?xml version="1.0" encoding="UTF-8"?>
<Doc><Grp><Row>a</Row><Row>b</Row></Grp><Grp><Row>b</Row></Grp></Doc>`;
export function makeNode(kind, name, position, path = '', id = crypto.randomUUID()) {
  return { id, type:'mapping', position, data:{ kind, name, path, context:contexts(path)[0] || '' }, deletable:kind !== 'target' };
}
export function emptyGraph(path) {
  return { nodes:[makeNode('target',fieldName(path),{x:510,y:80},path,'target')], edges:[] };
}
function newMapping(name) {
  return { id:crypto.randomUUID(),name,title:name,source:false,target:false,graphs:Object.fromEntries(targetFields.map(([path])=>[path,emptyGraph(path)])) };
}
function referenceMapping() {
  const map = newMapping('nested_grp_row_remove_contexts_3');
  Object.assign(map,{id:'reference',title:'Orders to Doc',source:true,target:true});
  const grp = map.graphs['Doc/Grp'];
  const id = makeNode('source','Id',{x:10,y:80},'Orders/Order/Id','src-id');
  id.data.context = 'Orders';
  grp.nodes.push(id);
  grp.edges.push({id:'id-grp',source:id.id,target:'target'});
  const row = map.graphs['Doc/Grp/Row'];
  row.nodes.push(makeNode('source','Sku',{x:10,y:80},'Orders/Order/Line/Sku','src-sku'));
  row.nodes.push(makeNode('function','removeContexts',{x:260,y:80},'','fn-remove'));
  Object.assign(row.nodes.at(-1).data,standardNodeData(standardFunction('removeContexts')));
  row.edges.push({id:'sku-remove',source:'src-sku',target:'fn-remove'}, {id:'remove-row',source:'fn-remove',target:'target'});
  return map;
}
export function inputPorts(node) {
  if (!node || node.data.kind === 'source') return [];
  return node.data.inputs ?? [{id:'in0',label:'in0'}];
}
export function outputPorts(node) {
  if (!node || node.data.kind==='target') return [];
  return node.data.outputs ?? [{id:'out',label:'out'}];
}
const feedsInput=(edge,node,port)=>edge.target===node && (edge.targetHandle||'in0')===port;
export function validWire(graph, from, to, handle = 'in0', sourceHandle = 'out', replacing) {
  if (!from || !to || from === to) return false;
  const source = graph.nodes.find(n=>n.id===from), target=graph.nodes.find(n=>n.id===to);
  if (!source || !target || source.data.kind==='target' || target.data.kind==='source') return false;
  const outputs=outputPorts(source);
  if(!outputs.some(port=>port.id===sourceHandle))return false;
  if (!inputPorts(target).some(port=>port.id===handle)) return false;
  if(replacing && !graph.edges.some(e=>e.id===replacing))return false;
  if(graph.edges.some(e=>feedsInput(e,to,handle) && e.source===from && (e.sourceHandle||'out')===sourceHandle && (!replacing||e.id===replacing)))return false;
  const edges=graph.edges.filter(e=>e.id!==replacing && !feedsInput(e,to,handle));
  const pending=[to], visited=new Set();
  while (pending.length) {
    const id=pending.pop();
    if (id===from) return false;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...edges.filter(e=>e.source===id).map(e=>e.target));
  }
  return true;
}
// Validate before displacing anything. Each input owns one wire; outputs may feed many.
export function wireGraph(graph,connection,replacing,id) {
  const {source,target}=connection, sourceHandle=connection.sourceHandle||'out', targetHandle=connection.targetHandle||'in0';
  if(!validWire(graph,source,target,targetHandle,sourceHandle,replacing))return graph;
  const old=replacing && graph.edges.find(e=>e.id===replacing);
  const edges=graph.edges.filter(e=>e.id!==replacing && !feedsInput(e,target,targetHandle));
  return {...graph,edges:[...edges,{...old,id:replacing||id,source,target,sourceHandle,targetHandle}]};
}
// Grouped targets can have different variable scopes. Check the resulting
// target branches when adding or moving a wire, including function fan-out.
export function canWireExpression(graph,connection,replacing,rows) {
  const next=wireGraph(graph,connection,replacing,'preview-wire');
  if(next===graph)return false;
  const variables=next.nodes.filter(n=>n.data.kind==='source'&&isVariablePath(n.data.path));
  if(!variables.length)return true;
  return targetsOf(next).every(sink=>{
    const branch=upstreamIds(next,sink.id);
    const allowed=new Set(availableVariables(rows,sink.data.path).map(([path])=>path));
    return variables.every(n=>!branch.has(n.id)||allowed.has(n.data.path));
  });
}
export function mapped(graph,path) {
  const target=targetNode(graph,path);
  return !!target && graph.edges.some(edge=>edge.target===target.id);
}
export function copyBranch(graph,root) {
  const node=graph.nodes.find(n=>n.id===root);
  if(!node||node.data.kind==='target')return null;
  const ids=upstreamIds(graph,root);
  return structuredClone({root,nodes:graph.nodes.filter(n=>ids.has(n.id)),
    edges:graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))});
}
export function duplicateBranch(clipboard,graph) {
  const {root,nodes,edges}=structuredClone(clipboard);
  const ids=new Map(nodes.map(n=>[n.id,crypto.randomUUID()]));
  const occupied=new Set(graph.nodes.map(n=>n.position.x+','+n.position.y));
  let offset=24;
  while(nodes.some(({position:p})=>occupied.has((p.x+offset)+','+(p.y+offset))))offset+=24;
  return {root:ids.get(root),
    nodes:nodes.map(n=>({...n,id:ids.get(n.id),position:{x:n.position.x+offset,y:n.position.y+offset}})),
    edges:edges.map(e=>({...e,id:crypto.randomUUID(),source:ids.get(e.source),target:ids.get(e.target)}))};
}
export function checkMapping(map) {
  const issues=[];
  if (!map.source) issues.push('Choose a source message.');
  if (!map.target) issues.push('Choose a target message.');
  if (!(map.targetRows || targetFields).some(([path])=>mapped(graphForPath(map,path),path))) issues.push('Connect at least one target field.');
  for (const [path,g] of Object.entries(map.graphs)) {
    const linked=upstreamIds(g,...targetsOf(g).map(n=>n.id));
    for(const n of g.nodes) {
      if (!linked.has(n.id)) issues.push(n.data.name+' has no path to '+path+'.');
      else if(n.data.kind==='function') {
        for(const port of inputPorts(n)) if(!g.edges.some(e=>e.target===n.id && (e.targetHandle || 'in0')===port.id)) {
          issues.push(n.data.name+' needs an input for '+port.label+' in '+path+'.');
        }
      }
    }
  }
  return issues;
}
export const storageKey='flottila-mapping-studio.v1';
export function loadWorkspace() {
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey));
    if(saved?.maps?.length && saved.maps.every(m=>m.id&&m.name&&m.graphs&&Object.values(m.graphs).every(g=>Array.isArray(g?.nodes)&&Array.isArray(g.edges))&&targetFields.every(([p])=>graphForPath(m,p)))) {
      for(const map of saved.maps){
        if(map.targetRows)map.targetRows=restoreVariableOrder(map.targetRows);
        delete map.templateUses;
        for(const graph of Object.values(map.graphs))for(const {data} of graph.nodes){
          if(data.kind!=='function' || data.functionId || data.standardKey || data.inputs)continue;
          const legacy=standardFunction(data.name);
          if(legacy)Object.assign(data,standardNodeData(legacy));
        }
      }
      return saved;
    }
  } catch { /* A fresh workspace also works without browser storage. */ }
  return {maps:[referenceMapping()],active:'reference'};
}
