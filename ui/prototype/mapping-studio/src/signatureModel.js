import {formatOf,schemaName} from './formats';

export const component='EXAMPLE_SC, 1.0 of example.org';
export const esr='urn:example:flottila:observations';
export const types=['Message Type','Fault Message Type','IDoc','RFC Message','External Message','JSON Schema'];
export const occurrences=['1','0..1','0..unbounded'];
export const namespaces=[esr,'http://sap.com/xi/BASIS','urn:sap-com:document:sap:rfc:functions','urn:sap-com:document:sap:idoc:messages'];
const idFor=name=>'urn:flottila:schema:'+name.toLowerCase();
function documentEntry(name,format){
  const side=name==='Orders'?'source':'target';
  return {type:format==='JSON'?'JSON Schema':'External Message',name,format,namespace:format==='JSON'?idFor(name):'',schema:schemaName(side,format),repository:esr};
}
export function catalog(type){
  if(type==='External Message'||type==='JSON Schema')return ['Doc','Orders'].map(n=>documentEntry(n,type==='JSON Schema'?'JSON':'XML'));
  if(type==='Message Type')return ['AlertRuleQueryRequest','AlertRuleQueryResponse'].map(name=>({type,name,format:'XML',namespace:namespaces[1]}));
  return []; // The local catalog only includes identified example objects.
}
export const adapterCatalog=['AS2','EDISeparator','JDBC','OData','OFTP','REST','RFC','SFSF','SFTP','SOAP','X400'].map(name=>({
  name,namespace:'http://sap.com/xi/XI/'+(['JDBC','REST','RFC','SOAP'].includes(name)?'System':name),
  component:['AS2','EDISeparator','OFTP','X400'].includes(name)?'B2B TOOLKIT 2.0':'SAP BASIS 7.50',description:''
}));
export const emptyRow=(id=crypto.randomUUID())=>({id,type:'Message Type',name:'',format:'XML',namespace:'',occurrence:'1'});
export function messages(map,side){
  if(map.signature?.[side])return map.signature[side];
  const row=emptyRow(side+'-initial');
  return [map[side]?{...row,...documentEntry(side==='source'?'Orders':'Doc',formatOf(map,side))}:row];
}
export function writeMessages(map,side,rows){
  const primary=rows.find(r=>r.name);
  return {...map,signature:{...map.signature,[side]:rows},[side]:!!primary,formats:{...map.formats,[side]:(primary||rows[0])?.format||'XML'}};
}
export function assignExample(map,side,format){
  const rows=messages(map,side),index=Math.max(0,rows.findIndex(r=>r.name)),list=rows.slice();
  list[index]={...(list[index]||emptyRow()),...documentEntry(side==='source'?'Orders':'Doc',format)};
  return writeMessages(map,side,list);
}
export function fixtureSide(map,side,ignoreOccurrence=false){
  const rows=messages(map,side);
  if(!map[side])return rows.length<=1;
  const entry=rows[0],expected=documentEntry(side==='source'?'Orders':'Doc',formatOf(map,side));
  return rows.length===1&&entry.name===expected.name&&entry.type===expected.type&&(ignoreOccurrence||entry.occurrence==='1')&&entry.namespace===expected.namespace;
}
export function parameters(map){
  return (map.parameters||[]).map(p=>{
    const legacy=['Import','Export'].includes(p.category);
    return {...p,category:legacy?'Simple Type':p.category||'Simple Type',parameter:legacy?p.category:p.parameter||'Import',
      type:legacy?(p.type?.replace(/^xsd:/,'')||'string'):p.type};
  });
}
export function signatureIssues(map){
  const result=[];
  for(const side of ['source','target']){
    if(messages(map,side).some(r=>!r.name)&&map[side])result.push('Choose a message for every '+side+' row.');
  }
  const seen=new Set();
  for(const p of parameters(map)){
    if(!p.name.trim())result.push('Enter a name for each parameter.');
    else if(seen.has(p.name.trim()))result.push('Duplicate parameter: '+p.name.trim()+'.');
    if(p.category==='Adapter'&&!p.type)result.push('Choose adapter metadata for '+(p.name||'the parameter')+'.');
    seen.add(p.name.trim());
  }
  return result;
}
