export const areas = ['Attributes and Methods', 'init', 'cleanUp'];
export const modes = ['Single Values', 'All Values of a Context', 'All Values of Queue'];
export const initialImports = [
  'com.sap.aii.mapping.api.*', 'com.sap.aii.mapping.lookup.*', 'com.sap.aii.mappingtool.tf7.rt.*',
  'java.io.*', 'java.lang.reflect.*', 'java.util.*'
];
export const javaTypes = {Argument: ['String','int','float'], Parameter: ['String','int','Channel']};
export const archiveExamples = [
  ['JAVA_Audit','common:functions'], ['JAVA_ExampleServiceQuery','communication:components'],
  ['JAVA_com_sap_aii_af_ms_ifc_api','common:functions'], ['JAVA_com_sap_aii_utilxi_core','common:functions'],
  ['JAVA_Convert_XML2URLString','common:mappings'], ['JAVA_JSONXML','common:functions'],
  ['JAVA_XmlEnvelopedSignatureMapping','common:mappings']
].map(([name,suffix])=>({name,namespace:'urn:example:'+suffix}));

export function unusedName(prefix, names) {
  let i = 1;
  while (names.includes(prefix+i)) i++;
  return prefix+i;
}
export function variable(kind, variables, id = crypto.randomUUID()) {
  return {id, kind, name:unusedName('var', variables.map(v=>v.name)), javaType:'String', title:''};
}
export function newFunction(name, id = crypto.randomUUID()) {
  return {id,name,title:name,category:'User-Defined',description:'',execution:modes[0],
    variables:[variable('Argument', [], 'in0')],body:''};
}
export function functionsOf(map) {
  return (map.customFunctions || []).map(entry => {
    if (typeof entry !== 'string') return entry;
    return {...newFunction(entry,'legacy-'+entry),body:map.code?.[entry] || ''};
  });
}
export function builtIn(map, name) {
  return {name,body:map.code?.[name] || '',description:'',variables:[],...map.javaAreas?.[name]};
}
export function metadata(map) {
  const ready = map.source && map.target;
  const base = map.name.replace(/[^\w]/g,'_');
  return {className:ready?'_'+base+'_':base,packageName:ready?'com.sap.xi.tf':'com.sap.xi.tf.user.functions',
    jdk:map.jdk || 'JDK 1.5 (Default)'};
}
export function archivesOf(map) {
  return (map.archives || []).map(a=>typeof a === 'string'?{name:a,namespace:''}:a);
}
export function declaration(fn) {
  const lifecycle = fn.name === 'init' || fn.name === 'cleanUp';
  const list = !lifecycle && fn.execution !== modes[0];
  const args = fn.variables.map(v => v.javaType+(list && v.kind === 'Argument'?'[]':'')+' '+v.name);
  if (list) args.push('ResultList result');
  args.push((lifecycle?'GlobalContainer':'Container')+' container');
  return 'public '+(list || lifecycle?'void':'String')+' '+fn.name+'('+args.join(', ')+') throws StreamTransformationException {';
}
const keywords = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null').split(' '));
export function nameIssue(value, taken) {
  if (!/^[a-zA-Z_$][\w$]*$/.test(value) || keywords.has(value)) return 'Enter a valid Java identifier.';
  return taken.includes(value)?'This name is already in use.':'';
}
export function functionNode(fn) {
  return {functionId:fn.id, name:fn.name, title:fn.title, category:fn.category,
    inputs:fn.variables.filter(v=>v.kind==='Argument').map(v=>({id:v.id,label:v.title || v.name}))};
}
export function withFunctions(map, list) {
  const old = functionsOf(map);
  function reconcile(graph) {
    const nodes = graph.nodes.flatMap(node => {
        if(node.data.kind !== 'function' || node.data.standardKey) return [node];
      const prior = old.find(fn=>node.data.functionId?fn.id===node.data.functionId:fn.name===node.data.name);
      if(!prior) return [node];
      const next = list.find(fn=>fn.id===prior.id);
      return next?[{...node,data:{...node.data,...functionNode(next)}}]:[];
    });
    const byId = new Map(nodes.map(n=>[n.id,n]));
    const edges = graph.edges.filter(edge => {
      const target = byId.get(edge.target);
      return byId.has(edge.source) && target && (!target.data.inputs || target.data.inputs.some(p=>p.id===(edge.targetHandle || 'in0')));
    });
    return {...graph,nodes,edges};
  }
  return {...map,customFunctions:list,graphs:Object.fromEntries(Object.entries(map.graphs).map(([key,g])=>[key,reconcile(g)]))};
}
