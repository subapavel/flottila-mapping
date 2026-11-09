import {useState} from 'react';
import {ArrowDownIcon,ArrowUpIcon,CopyIcon,CutIcon,PasteIcon,PlusIcon,SearchIcon,TrashIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {moveRow} from './moveRow';
import {SignatureCatalog} from './SignatureCatalog';
import {archiveExamples,archivesOf,initialImports,javaTypes,nameIssue,variable} from './functionModel';

export function RowTools({label,onAdd,onRemove,onMove,canRemove,canUp,canDown,disabled,children}) {
  return <div className="sig-toolbar" role="toolbar" aria-label={label}>
    <Tool label="Insert row" icon={PlusIcon} disabled={disabled} onClick={onAdd}/>
    <Tool label="Delete row" icon={TrashIcon} disabled={disabled||!canRemove} onClick={onRemove}/>
    <i/><Tool label="Move up" icon={ArrowUpIcon} disabled={disabled||!canUp} onClick={()=>onMove(-1)}/>
    <Tool label="Move down" icon={ArrowDownIcon} disabled={disabled||!canDown} onClick={()=>onMove(1)}/>
    {children}
  </div>;
}
export function NameEditor({value,label,taken,onCommit}) {
  const [draft,setDraft]=useState(null),[error,setError]=useState('');
  function commit(){
    if(draft===null)return;
    const value=draft.trim(),issue=nameIssue(value,taken);
    if(issue){setError(issue);return;}
    onCommit(value);setDraft(null);setError('');
  }
  return <><input aria-label={label} aria-invalid={!!error} value={draft ?? value}
    onChange={e=>{setError('');setDraft(e.target.value);}} onBlur={commit}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(null);setError('');}}}/>
    {error&&<small role="alert" className="udf-error">{error}</small>}</>;
}
export function Variables({fn,onChange,lifecycle,disabled}) {
  const [selected,select]=useState(null);
  const rows=fn.variables, index=rows.findIndex(v=>v.id===selected);
  function patch(id,changes){onChange(rows.map(v=>v.id===id?{...v,...changes}:v));}
  function add(){
    const v=variable(lifecycle?'Parameter':'Argument',rows);
    const at=index<0?rows.length:index+1;
    onChange([...rows.slice(0,at),v,...rows.slice(at)]);select(v.id);
  }
  const names=rows.map(r=>r.name);
  return <fieldset disabled={disabled} className="udf-vars mode-fields" aria-label="Signature Variables"><h3>Signature Variables</h3>
    <RowTools label="Variable actions" onAdd={add} canRemove={index>=0} canUp={index>0} canDown={index>=0&&index<rows.length-1}
      onRemove={()=>{onChange(rows.filter(v=>v.id!==selected));select(null);}} onMove={delta=>onChange(moveRow(rows,index,delta))}/>
    <div className="editor-table-scroll"><table className="editor-table udf-table"><thead><tr>{['Type','Name','Java Type','Title',...(lifecycle?[]:['Description'])].map(s=><th key={s}>{s}</th>)}</tr></thead>
    <tbody>{rows.map(v=><tr key={v.id} className={v.id===selected?'sig-selected':''} onFocus={()=>select(v.id)} onClick={()=>select(v.id)}>
      <td>{lifecycle?'Parameter':<select aria-label="Variable kind" value={v.kind} onChange={e=>{
        const kind=e.target.value;patch(v.id,{kind,javaType:javaTypes[kind].includes(v.javaType)?v.javaType:'String'});
      }}>{Object.keys(javaTypes).map(k=><option key={k}>{k}</option>)}</select>}</td>
      <td><NameEditor label="Variable name" value={v.name} taken={['container','result',...names.filter(n=>n!==v.name)]} onCommit={name=>patch(v.id,{name})}/></td>
      <td><select aria-label="Java type" value={v.javaType} onChange={e=>patch(v.id,{javaType:e.target.value})}>{javaTypes[v.kind].map(t=><option key={t}>{t}</option>)}</select></td>
      <td><input aria-label="Variable title" value={v.title} onChange={e=>patch(v.id,{title:e.target.value})}/></td>
      {!lifecycle&&<td><input aria-label="Variable description" value={v.description||''} onChange={e=>patch(v.id,{description:e.target.value})}/></td>}
    </tr>)}</tbody></table></div></fieldset>;
}
export function Dependencies({map,edit,disabled,importsOnly=false}) {
  const [tab,setTab]=useState('Import Instructions'),[index,select]=useState(-1),[picker,setPicker]=useState(null),[clip,setClip]=useState(null);
  const archive=!importsOnly&&tab==='Archives Used';
  const rows=archive?archivesOf(map):map.imports ?? initialImports;
  const key=archive?'archives':'imports';
  const valid=index>=0 && index<rows.length;
  const editable=valid && (archive || index>=initialImports.length);
  function write(list){edit(m=>({...m,[key]:list}));}
  function replace(at,value){write(rows.map((r,i)=>i===at?value:r));}
  function add(){
    const at=editable?index+1:rows.length;
    write([...rows.slice(0,at),archive?{name:'',namespace:''}:'',...rows.slice(at)]);select(at);
    if(!archive)requestAnimationFrame(()=>document.querySelector('[aria-label="Import instruction '+(at+1)+'"]')?.focus());
  }
  function move(delta){write(moveRow(rows,index,delta));select(index+delta);}
  const available=picker?.kind==='namespace'?[...new Set(archiveExamples.map(r=>r.namespace))].map(name=>({name})):archiveExamples;
  return <section className="panel udf-dependencies" aria-label={importsOnly?'Function imports':'Function dependencies'}>
    {!importsOnly&&<div className="doc-tabs" role="group" aria-label="Function dependencies view">{['Import Instructions','Archives Used'].map(t=><button key={t} aria-pressed={tab===t} onClick={()=>{setTab(t);select(-1);}}>{t}</button>)}</div>}
    <RowTools label={archive?'Archive actions':'Import actions'} disabled={disabled} onAdd={add} canRemove={editable} canUp={editable&&index>(archive?0:initialImports.length)}
      canDown={editable&&index<rows.length-1} onRemove={()=>{write(rows.filter((_,i)=>i!==index));select(-1);}} onMove={move}>
      {archive&&<><i/><Tool label="Cut Object" icon={CutIcon} disabled={disabled||!valid||!rows[index]?.name} onClick={()=>{setClip(rows[index]);replace(index,{name:'',namespace:''});}}/>
        <Tool label="Copy Object" icon={CopyIcon} disabled={!valid||!rows[index]?.name} onClick={()=>setClip(rows[index])}/>
        <Tool label="Paste Object" icon={PasteIcon} disabled={disabled||!valid||!clip} onClick={()=>replace(index,{...clip})}/></>}
    </RowTools><div className="editor-table-scroll"><table className="editor-table udf-table" aria-label={tab}><thead><tr><th>{archive?'Name':'import'}</th>{archive&&<th>Namespace</th>}</tr></thead>
    <tbody>{rows.map((r,i)=><tr key={i} className={index===i?'sig-selected':''} onClick={()=>select(i)} onFocus={()=>select(i)}>
      {archive?['name','namespace'].map(field=><td key={field}><button disabled={disabled} className="sig-lookup" aria-label={'Choose archive '+field+' '+(i+1)} onClick={()=>setPicker({i,kind:field})}>
        <span>{r[field] || 'Choose…'}</span><SearchIcon/></button></td>):
      <td>{i<initialImports.length?<code>{r}</code>:<input readOnly={disabled} aria-label={'Import instruction '+(i+1)} placeholder="package.Class" value={r} onChange={e=>replace(i,e.target.value)}/>}</td>}
    </tr>)}</tbody></table></div>
    {picker&&<SignatureCatalog kind={picker.kind==='namespace'?'namespace':'archive'} row={{type:'Imported Archive'}} entries={available}
      close={()=>setPicker(null)} onApply={r=>{replace(picker.i,picker.kind==='namespace'?{...rows[picker.i],namespace:r.name}:{name:r.name,namespace:r.namespace});setPicker(null);}}/>}
  </section>;
}
