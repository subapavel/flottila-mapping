import catalogue from './standard-functions.json';

// The visible entries in the installed SAP PO StandardFunctions library (XI7.1).
// Keep overload keys separate: their displayed names can be identical.
export const groups = ['Arithmetic', 'Boolean', 'Text', 'Conversions', 'Date', 'Constants', 'Node Functions', 'Statistic'];
export const standardFunctions = catalogue;
const byKey = new Map(catalogue.map(fn => [fn.key, fn]));
export const standardFunction = key => byKey.get(key);
export const hasParameters = node => Boolean(standardFunction(node?.data.standardKey)?.parameters?.length);
export const isLookup = fn => fn.key === 'tableLookup' || fn.key === 'rfclookup';

// Read from the catalogue at display time so saved graphs pick up help updates.
export function standardPortHelp(data,port,input,index) {
  if(data.functionId)return;
  const fn=standardFunction(data.standardKey||data.name);
  if(!fn)return;
  const template=input ? fn.help.fieldInput??fn.help.inputs?.[index] : fn.help.output;
  return template?.replace(/\{(\w+)\}/g,(token,key)=>key==='field'?port.label:
    data.settings?.[key]??fn.parameters?.find(p=>p.key===key)?.initial??token);
}

export function parameterPreview(data) {
  const keys = {
    const:['value'], substring:['start','count'], formatNumber:['nformat'], counter:['ini','inc'],
    concat:['delimeter'], mapWithDefault:['default_value'], replaceValue:['value'], CopyValue:['nnumber'],
    TransformDate:['iform','oform'], currentDate:['oform']
  }[data.standardKey];
  return keys?.map(key=>data.settings?.[key]).filter(value=>value!=='' && value!=null).join(' · ');
}

export function standardNodeData(fn, settings = {}) {
  const values = Object.fromEntries((fn.parameters || []).map(field =>
    [field.key, settings[field.key] ?? structuredClone(field.initial)]));
  const lookup = isLookup(fn);
  const fieldPorts = names => names.map(name => ({id:'field:' + name, label:name}));
  return {
    standardKey:fn.key, name:fn.name, category:fn.group, settings:values,
    inputs:lookup ? fieldPorts(values.ins) : fn.inputs.map((label,i) => ({id:'in'+i, label})),
    outputs:lookup ? fieldPorts(values.outs) : [{id:'out', label:'out'}]
  };
}

export function configureFunction(graph, id, settings) {
  const node = graph.nodes.find(item => item.id === id);
  const fn = standardFunction(node?.data.standardKey);
  if (!fn) return graph;
  const data = {...node.data, ...standardNodeData(fn, settings)};
  return {
    ...graph,
    nodes:graph.nodes.map(item => item.id === id ? {...item, data} : item),
    edges:graph.edges.filter(edge =>
      (edge.target !== id || data.inputs.some(port => port.id === (edge.targetHandle || 'in0'))) &&
      (edge.source !== id || data.outputs.some(port => port.id === (edge.sourceHandle || 'out'))))
  };
}
