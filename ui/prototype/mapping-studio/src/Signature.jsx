import {useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {ArrowUpIcon,ArrowDownIcon,CopyIcon,CutIcon,PasteIcon,TrashIcon,PlusIcon,SearchIcon,RedoIcon,ProjectDiagramIcon,CubeIcon,CodeIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {moveRow} from './moveRow';
import {Dialog} from './Panels';
import {CopySurface} from './CopyTextButton';
import {SignatureCatalog} from './SignatureCatalog';
import './signature.css';
import {formatOf} from './formats';
import {component,types,occurrences,messages,writeMessages,emptyRow,parameters} from './signatureModel';

const cap=s=>s[0].toUpperCase()+s.slice(1);
const newParam=(id=crypto.randomUUID(),name='')=>({id,name,category:'Simple Type',type:'string',parameter:'Import',description:''});
function FieldSelect({label,value,options,onChange}){
  return <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}</select>;
}
function Messages({map,side,edit,clipboard,setClipboard,open}){
  const [selected,select]=useState('');
  const rows=messages(map,side),idx=rows.findIndex(r=>r.id===selected),r=rows[idx];
  function update(fn){edit(m=>writeMessages(m,side,fn(messages(m,side))));}
  function patch(id,values){update(list=>list.map(item=>item.id===id?{...item,...values}:item));}
  function add(){const row=emptyRow();update(list=>[...list.slice(0,idx<0?list.length:idx+1),row,...(idx<0?[]:list.slice(idx+1))]);select(row.id);}
  function remove(){const next=rows.filter(x=>x.id!==selected);update(()=>next);select(next[Math.min(idx,next.length-1)]?.id||'');}
  function move(delta){update(list=>moveRow(list,idx,delta));}
  function copy(cut){const {id,occurrence,...object}=r;setClipboard(object);if(cut)patch(id,{...emptyRow(id),occurrence});}
  return <section className="panel sig-messages" aria-label={cap(side)+' messages'}><header className="editor-section-head"><h2><span className={'role-tile '+side}><CubeIcon/></span>{cap(side)} Message(s) <small aria-label="required">*</small></h2><span className="sig-count">{rows.filter(x=>x.name).length}</span></header>
    <div className="signature-component"><span>Software Component Version</span><strong>{component}</strong></div>
    <div className="sig-toolbar" role="toolbar" aria-label={cap(side)+' message actions'}>
      <Tool label="Insert row" icon={PlusIcon} onClick={add}/><Tool label="Delete row" icon={TrashIcon} disabled={!r} onClick={remove}/><i/>
      <Tool label="Move up" icon={ArrowUpIcon} disabled={idx<1} onClick={()=>move(-1)}/><Tool label="Move down" icon={ArrowDownIcon} disabled={!r||idx===rows.length-1} onClick={()=>move(1)}/><i/>
      <Tool label="Cut Object" icon={CutIcon} disabled={!r?.name} onClick={()=>copy(true)}/><Tool label="Copy Object" icon={CopyIcon} disabled={!r?.name} onClick={()=>copy(false)}/>
      <Tool label="Paste Object" icon={PasteIcon} disabled={!clipboard||!r} onClick={()=>patch(r.id,clipboard)}/>
    </div><div className="editor-table-scroll"><table className="editor-table sig-message-table" aria-label={cap(side)+' signature'}><thead><tr><th aria-label="Select row">#</th><th>Type</th><th>Name</th><th>Namespace / ID</th><th>Occurrence</th></tr></thead>
    <tbody>{rows.map((row,i)=><tr key={row.id} className={selected===row.id?'sig-selected':''} onFocus={()=>select(row.id)} onClick={()=>select(row.id)}>
      <td><button aria-label={'Select row '+(i+1)} aria-pressed={selected===row.id} className="sig-row-num">{i+1}</button></td>
      <td><FieldSelect label="Message type" value={row.type} options={types} onChange={type=>patch(row.id,{...emptyRow(row.id),type,occurrence:row.occurrence,format:type==='JSON Schema'?'JSON':'XML'})}/></td>
      <td><button className="sig-lookup" aria-label={'Choose message '+(i+1)} title={row.schema||row.name||'Choose message'} onClick={()=>open('message',row,v=>patch(row.id,v))}><span>{row.name||'Choose…'}</span><SearchIcon/></button></td>
      <td><button className="sig-lookup" aria-label={'Choose namespace or ID '+(i+1)} title={row.namespace||'Choose namespace or schema ID'} onClick={()=>open('namespace',row,v=>patch(row.id,{namespace:v.name}))}><span>{row.namespace||'—'}</span><SearchIcon/></button></td>
      <td><FieldSelect label="Occurrence" value={row.occurrence} options={occurrences} onChange={occurrence=>patch(row.id,{occurrence})}/></td>
    </tr>)}</tbody></table></div>{!rows.length&&<p className="empty-message">Insert a row to choose a message.</p>}
  </section>;
}
export function Signature({map,edit,editing}){
  const [clipboard,setClipboard]=useState(null),[dialog,setDialog]=useState(null),[log,setLog]=useState(''),[selected,select]=useState('');
  const [blankId,setBlankId]=useState(()=>crypto.randomUUID());const table=useRef(null);
  const params=parameters(map),param=params.find(p=>p.id===selected);
  const open=(kind,row,apply)=>setDialog({kind,row,apply}),close=()=>setDialog(null);
  const update=fn=>edit(m=>({...m,parameters:fn(parameters(m))}));
  function patch(id,values){update(ps=>ps.map(p=>p.id===id?{...p,...values}:p));}
  function add(){
    const p=newParam(blankId);update(ps=>[...ps,p]);select(p.id);setBlankId(crypto.randomUUID());
    requestAnimationFrame(()=>table.current?.querySelector('[data-param="'+p.id+'"] input')?.focus());
  }
  function changeName(p,value){
    if(p.id===blankId){if(!value)return;update(ps=>[...ps,newParam(p.id,value)]);setBlankId(crypto.randomUUID());select(p.id);}
    else patch(p.id,{name:value});
  }
  const rows=editing?[...params,newParam(blankId)]:params;
  return <fieldset className="signature mode-fields" aria-label="Mapping signature" disabled={!editing}><div className="signature-pair">{['source','target'].map(side=><Messages key={side} {...{map,side,edit,clipboard,setClipboard,open}}/>)}</div>
    <section className="panel sig-parameters" aria-label="Signature parameters"><header className="editor-section-head"><h2><CodeIcon/> Parameters</h2><span className="sig-count">{params.length}</span></header>
    <div className="sig-toolbar" role="toolbar" aria-label="Parameter actions"><Tool label="Add parameter" icon={PlusIcon} onClick={()=>add()}/><Tool label="Delete parameter" icon={TrashIcon} disabled={!param} onClick={()=>{update(ps=>ps.filter(p=>p.id!==selected));select('');}}/><i/>
    <Tool label="Where Used" icon={ProjectDiagramIcon} disabled={!param?.name} onClick={()=>{setLog('Parameter '+param.name+' is not in use');setDialog({kind:'log'});}}/>
    <Tool label="Refresh" icon={RedoIcon} onClick={()=>{const ordered=[...params].sort((a,b)=>a.name.localeCompare(b.name));if(ordered.some((p,i)=>p.id!==params[i].id))update(()=>ordered);select('');}}/></div>
    <div className="editor-table-scroll"><table ref={table} className="editor-table sig-param-table" aria-label="Mapping parameters"><thead><tr>{['Name','Category','Type','Parameter','Description'].map(h=><th key={h}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(p=>{const blank=p.id===blankId,json=formatOf(map,p.parameter==='Export'?'target':'source')==='JSON';
      return <tr key={p.id} data-param={p.id} className={selected===p.id?'sig-selected':''} onFocus={()=>select(p.id)} onClick={()=>select(p.id)}>
      <td><input aria-label="Parameter name" placeholder={blank?'New parameter…':'Name'} value={p.name} onChange={e=>changeName(p,e.target.value)}/></td>
      {blank?<td colSpan={4}/>:<>
      <td><FieldSelect label="Parameter category" value={p.category} options={['Adapter','Simple Type']} onChange={category=>patch(p.id,{category,type:category==='Adapter'?'':'string'})}/></td>
      <td>{p.category==='Adapter'?<button className="sig-lookup" aria-label="Choose adapter metadata" onClick={()=>open('adapter',p,v=>patch(p.id,{type:v.name}))}><span>{p.type||'Choose…'}</span><SearchIcon/></button>:
      <FieldSelect label="Parameter type" value={p.type} options={[...new Set(['string','integer',p.type].filter(Boolean))].map(v=>({value:v,label:json?v:'xsd:'+v}))} onChange={type=>patch(p.id,{type})}/>}</td>
      <td><FieldSelect label="Parameter direction" value={p.parameter} options={['Import','Export']} onChange={parameter=>patch(p.id,{parameter})}/></td>
      <td><input aria-label="Parameter description" value={p.description||''} onChange={e=>patch(p.id,{description:e.target.value})}/></td></>}</tr>})}</tbody></table></div></section>
    {log&&<div className="panel sig-log"><h3>Processing Log</h3><CopySurface className="plain-log" label="processing log" text={log}><p>{log}</p></CopySurface></div>}
    {dialog&&(dialog.kind==='log'?<Dialog title="Processing Log" close={close} footer={<Button onClick={close}>Close</Button>}>
      <CopySurface className="plain-log" label="processing log" text={log}><p>{log}</p></CopySurface></Dialog>:
      <SignatureCatalog {...dialog} close={close} onApply={v=>{dialog.apply(v);close();}}/>)}</fieldset>;
}
