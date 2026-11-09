import {strFromU8, unzipSync} from 'fflate';
import {downloadZippedText} from './download';
import {sourceFields, fieldName} from './model';

export const traceLevels = ['No trace','Warning','Info','Debug','All'];
export const headerDefaults = Object.fromEntries((
  'ConversationId Interface InterfaceNamespace MessageId ProcessingMode Profiling ReceiverName ReceiverNamespace ReceiverParty ReceiverPartyAgency ReceiverPartyScheme ReceiverService ReceiverSystem RefToMessageId SenderName SenderNamespace SenderParty SenderPartyAgency SenderPartyScheme SenderService SenderSystem TimeSent VersionMajor VersionMinor'
).split(' ').map(key => [key, key==='Profiling' ? 'off' : /^(Sender|Receiver)(Party|Service|System)$/.test(key) ? 'Test_'+key : '']));

export function parsePayload(text, format) {
  if (format==='JSON') return JSON.parse(text);
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.documentElement.localName==='parsererror' || doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml','parsererror').length ||
    doc.getElementsByTagNameNS('http://www.w3.org/1999/xhtml','parsererror').length)
    throw Error('Enter well-formed XML before running the simulation.');
  return doc;
}
function xmlString(doc, text) {
  const declaration=text.match(/^\s*<\?xml[^?]*\?>/)?.[0] || '';
  const body=new XMLSerializer().serializeToString(doc).replace(/^<\?xml\s[^?]*\?>\s*/,'');
  return (declaration?declaration+'\n':'')+body;
}
export function pretty(text, format) {
  const value=parsePayload(text,format);
  if(format==='JSON')return JSON.stringify(value,null,2);
  function indent(el,depth) {
    if(el.getAttributeNS('http://www.w3.org/XML/1998/namespace','space')==='preserve')return;
    const nodes=[...el.childNodes];
    if(!el.children.length || nodes.some(n=>n.nodeType===4 || n.nodeType===3 && n.nodeValue.trim()))return;
    for(const n of nodes){
      if(n.nodeType===3) {n.remove();continue;}
      el.insertBefore(value.createTextNode('\n'+'  '.repeat(depth+1)),n);
      if(n.nodeType===1)indent(n,depth+1);
    }
    el.append(value.createTextNode('\n'+'  '.repeat(depth)));
  }
  indent(value.documentElement,0);
  return xmlString(value,text);
}
export function payloadRows(text, format, title) {
  const doc=parsePayload(text,format), rows=[];
  if(format==='JSON'){
    const holder={root:doc};
    function visit(parent,key,name,location,schemaPath,level) {
      const value=parent[key], branch=value!==null && typeof value==='object';
      const entries=branch?Object.entries(value):[];
      const path=location.map(k=>'/'+String(k).replaceAll('~','~0').replaceAll('/','~1')).join('');
      const kind=Array.isArray(value)?'array':value===null?'null':typeof value;
      rows.push({id:JSON.stringify(location),location,arrayItem:Array.isArray(parent),name,path:path||'/',schemaPath,level,branch:entries.length>0,kind,
        value:branch?(Array.isArray(value)?'['+entries.length+']':'{…}'):String(value),
        write:branch?undefined:raw=>{
          const next=kind==='string'?raw:JSON.parse(raw);
          if((next===null?'null':typeof next)!==kind)throw Error('Enter a '+kind+' value.');
          parent[key]=next;return JSON.stringify(holder.root,null,2);
        }});
      for(const [k] of entries)visit(value,k,Array.isArray(value)?'['+k+']':k,[...location,k],Array.isArray(value)?schemaPath:schemaPath+'/'+k,level+1);
    }
    visit(holder,'root',title,[],title,0);
    return rows;
  }
  function visit(el,prior,schema,location,index) {
    const level=location.length;
    const name=el.tagName+(index?'['+index+']':''), path=prior+'/'+name;
    const children=[...el.children], attrs=[...el.attributes];
    const value=[...el.childNodes].filter(n=>n.nodeType===3||n.nodeType===4).map(n=>n.nodeValue).join('');
    rows.push({id:path,name,path,location,schemaPath:schema,level,branch:!!(children.length||attrs.length),kind:'string',
      value:children.length?value.trim():value,
      write:children.length?undefined:raw=>{
        const textNodes=[...el.childNodes].filter(n=>n.nodeType===3||n.nodeType===4);
        if(textNodes.length){textNodes[0].nodeValue=raw;for(const n of textNodes.slice(1))n.remove();}
        else el.append(doc.createTextNode(raw));
        return xmlString(doc,text);
      }});
    for(const a of attrs)rows.push({id:path+'/@'+a.name,name:'@'+a.name,path:path+'/@'+a.name,location,attribute:a.name,
      schemaPath:schema,level:level+1,kind:'string',value:a.value,write:raw=>{a.value=raw;return xmlString(doc,text);}});
    const counts=new Map();
    children.forEach((child,i)=>{const idx=counts.get(child.tagName)||0;counts.set(child.tagName,idx+1);visit(child,path,schema+'/'+child.localName,[...location,i],idx);});
  }
  visit(doc.documentElement,'',doc.documentElement.localName,[],0);
  return rows;
}

export function editInstanceNode(text,format,row,operation,name='',literal='""') {
  const data=parsePayload(text,format);
  if(!row.level && (operation==='duplicate'||operation==='delete'))throw Error('Select a child of the root.');
  if(format==='XML'){
    const el=row.location.reduce((parent,i)=>parent.children[i],data.documentElement);
    if(operation==='delete'){
      if(row.attribute)el.removeAttribute(row.attribute);else el.remove();
    }else if(operation==='duplicate'){
      if(row.attribute)throw Error('An attribute name must be unique.');
      el.after(el.cloneNode(true));
    }else{
      const attribute=operation==='attribute';
      const prefix=name.includes(':')?name.split(':')[0]:null;
      const namespace=prefix||!attribute?el.lookupNamespaceURI(prefix):null;
      if(prefix&&!namespace)throw Error('The namespace prefix is not declared.');
      if(attribute){
        const attr=data.createAttributeNS(namespace,name);
        if(el.hasAttributeNS(namespace,attr.localName))throw Error('This attribute already exists.');
        el.setAttributeNodeNS(attr);
      }else el.appendChild(data.createElementNS(namespace,name));
    }
    return xmlString(data,text);
  }
  const parent=row.location.slice(0,-1).reduce((obj,key)=>obj[key],data);
  const key=row.location.at(-1);
  const value=row.level?parent[key]:data;
  if(operation==='delete'){
    if(Array.isArray(parent))parent.splice(Number(key),1);else delete parent[key];
  }else if(operation==='duplicate' && Array.isArray(parent)){
    parent.splice(Number(key)+1,0,structuredClone(value));
  }else if(operation==='item'){
    value.push(JSON.parse(literal));
  }else{
    const object=operation==='duplicate'?parent:value;
    if(Object.hasOwn(object,name))throw Error('This property already exists.');
    const next=operation==='duplicate'?structuredClone(value):JSON.parse(literal);
    Object.defineProperty(object,name,{value:next,enumerable:true,configurable:true,writable:true});
  }
  return JSON.stringify(data,null,2);
}

const directChildren=path=>sourceFields.filter(([p])=>p.slice(0,p.lastIndexOf('/'))===path && p.includes('/'));
function sample(path,occ) {
  const children=directChildren(path);
  const value=children.length ? Object.fromEntries(children.map(([p,o])=>[fieldName(p),sample(p,o)])) : fieldName(path)==='Qty'?0:'';
  return occ.endsWith('∞')?[value]:value;
}
export function alignInstance(text,format) {
  const data=parsePayload(text,format);
  if(format==='JSON'){
    function complete(obj,path) {
      if(!obj || typeof obj!=='object' || Array.isArray(obj))return;
      for(const [p,occ] of directChildren(path)){
        const key=fieldName(p);
        if(!Object.hasOwn(obj,key))obj[key]=sample(p,occ);
        else if(Array.isArray(obj[key]))obj[key].forEach(child=>complete(child,p));
        else complete(obj[key],p);
      }
    }
    complete(data,'Orders');return JSON.stringify(data,null,2);
  }
  function complete(el,path) {
    const fields=directChildren(path);
    for(const [i,[p]] of fields.entries()){
      const name=fieldName(p);
      let matches=[...el.children].filter(c=>c.localName===name);
      if(!matches.length){
        const later=fields.slice(i+1).map(([key])=>fieldName(key));
        const child=data.createElementNS(el.namespaceURI,el.prefix?el.prefix+':'+name:name);
        el.insertBefore(child,[...el.children].find(c=>later.includes(c.localName))||null);
        matches=[child];
      }
      matches.forEach(c=>complete(c,p));
    }
  }
  if(data.documentElement.localName==='Orders')complete(data.documentElement,'Orders');
  return pretty(xmlString(data,text),'XML');
}
export function generate(format) {
  return alignInstance(format==='JSON'?'{}':'<?xml version="1.0" encoding="UTF-8"?>\n<Orders/>',format);
}
export function isUsed(path,used) {
  return path==='Orders' || used.some(p=>p===path || p.startsWith(path+'/') || path.startsWith(p+'/'));
}
export function removeUnused(text,format,used) {
  const data=parsePayload(text,format);
  if(format==='JSON'){
    function prune(value,path) {
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value)){value.forEach(v=>prune(v,path));return;}
      for(const k of Object.keys(value)){const child=path+'/'+k;if(!isUsed(child,used))delete value[k];else prune(value[k],child);}
    }
    prune(data,'Orders');return JSON.stringify(data,null,2);
  }
  function prune(el,path){for(const c of [...el.children]){const p=path+'/'+c.localName;if(!isUsed(p,used))c.remove();else prune(c,p);}}
  prune(data.documentElement,data.documentElement.localName);return pretty(xmlString(data,text),'XML');
}
export function downloadInstance(text,format) {
  downloadZippedText('schema.zip','instance.'+format.toLowerCase(),text);
}
export async function readInstance(file,format) {
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes[0]!==80||bytes[1]!==75)return new TextDecoder().decode(bytes);
  const name='instance.'+format.toLowerCase();
  const archive=unzipSync(bytes,{filter:entry=>entry.name===name && entry.originalSize<=16*1024*1024});
  if(!archive[name])throw Error('The archive needs a '+name+' file under 16 MB.');
  return strFromU8(archive[name]).replace(/^\uFEFF/,'');
}
export function traceLines(text,format) {
  const doc=parsePayload(text,format), lines=['Document start'];
  if(format==='JSON'){
    function trace(value,path) {
      if(value===null||typeof value!=='object'){lines.push('Put value '+JSON.stringify(value)+' at '+path);return;}
      const type=Array.isArray(value)?'array':'object';lines.push('Start '+type+' '+path);
      for(const [k,v] of Object.entries(value))trace(v,Array.isArray(value)?path+'['+k+']':path+'.'+k);
      lines.push('Close '+type+' '+path);
    }
    trace(doc,'$');
  } else {
    function trace(el){lines.push('Start tag ['+el.tagName+']');for(const n of el.childNodes){
      if(n.nodeType===1)trace(n);else if((n.nodeType===3||n.nodeType===4)&&n.nodeValue.trim())lines.push('Put value ['+n.nodeValue+']');
    }lines.push('Close tag ['+el.tagName+']');}
    trace(doc.documentElement);
  }
  return [...lines,'Document end'];
}
