import {useState} from 'react';
import {Button,Switch} from '@patternfly/react-core';
import {ArrowDownIcon,ArrowUpIcon,TrashIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {moveRow} from './moveRow';
import {Dialog} from './Panels';
import {component} from './signatureModel';

const moduleName='SXIDEMO_AIRL_FLIGHT_CHECKAVAIL';
const rfcNamespace='urn:sap-com:document:sap:rfc:functions';

export function LookupPicker({rfc,current,apply,close}){
  const [selected,setSelected]=useState(''),[query,setQuery]=useState('');
  const entries=[...new Set([...(rfc?[moduleName]:[]),...(current?[current]:[])])];
  const rows=entries.filter(n=>n.toLowerCase().includes(query.trim().toLowerCase()));
  return <Dialog wide title={rfc?'Choose Function Module':'Choose External Definition'} close={close} footer={<><Button isDisabled={!rows.includes(selected)} onClick={()=>apply(selected)}>Apply</Button><Button variant="link" onClick={close}>Cancel</Button></>}>
    <div className="sig-criteria"><h3>Search Criteria</h3><dl><dt>Category</dt><dd>{rfc?'rfc':'dbtab'}</dd><dt>Software Component Version</dt><dd>{component}</dd></dl></div>
    <h3 className="sig-result-title">Search Result</h3>
    <div className="fn-parameters"><label>Search<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="sig-catalog-scroll"><table className="editor-table sig-catalog"><thead><tr><th>Name</th><th>Namespace</th></tr></thead><tbody>
      {rows.map(n=><tr key={n} className={selected===n?'sig-selected':''} onDoubleClick={()=>apply(n)}><td><button type="button" className="sig-result-name" aria-pressed={selected===n} onClick={()=>setSelected(n)}>{n}</button></td><td>{n===moduleName?rfcNamespace:'—'}</td></tr>)}
    </tbody></table>{!rows.length&&<p className="empty-message">No Suitable Data Found</p>}</div>
  </Dialog>;
}

function FieldList({title,fields,change}){
  const [selected,setSelected]=useState('');
  const index=fields.indexOf(selected);
  function move(delta){
    const reordered=moveRow(fields,index,delta);
    if(reordered!==fields)change(reordered);
  }
  return <fieldset><legend>{title}</legend>
    <select aria-label={title} size={4} value={selected} onChange={e=>setSelected(e.target.value)}>{fields.map(name=><option key={name}>{name}</option>)}</select>
    <div className="fn-port-tools"><Tool label={'Move '+title+' up'} icon={ArrowUpIcon} disabled={index<=0} onClick={()=>move(-1)}/><Tool label={'Move '+title+' down'} icon={ArrowDownIcon} disabled={index<0||index>=fields.length-1} onClick={()=>move(1)}/>
    <Tool label={'Remove selected field from '+title} icon={TrashIcon} disabled={index<0} onClick={()=>{change(fields.filter(n=>n!==selected));setSelected('');}}/></div></fieldset>;
}

export function LookupParameters({fn,draft,change,imports,openPicker}){
  const rfc=fn.key==='rfclookup',adapter=rfc?'RFC':'JDBC';
  const channels=imports.filter(p=>p.category==='Adapter'&&p.type===adapter&&p.name).map(p=>p.name);
  const flag=rfc?'useExc':'split';
  const flagSwitch=<Switch label={rfc?'Use Exception':'Insert Context Change After Each Result Value'} isChecked={draft[flag]} onChange={(_,checked)=>change(flag,checked)}/>;
  return <>
    <label>Communication Channel<select aria-label="Communication Channel" value={draft.channel||''} disabled={!channels.length&&!draft.channel} onChange={e=>change('channel',e.target.value)}>
      <option value="">{channels.length?'Select a channel':"No suitable parameter found; define new parameter of type 'Channel' first"}</option>
      {[...new Set([...channels,...(draft.channel?[draft.channel]:[])])].map(v=><option key={v}>{v}</option>)}</select></label>
    <div className="fn-ref"><span>{draft.ref||(rfc?'Select an RFC module':'Select a database table')}</span><Button type="button" variant="secondary" size="sm" onClick={openPicker}>{rfc?'Choose RFC module':'Choose database table'}</Button></div>
    {!rfc&&flagSwitch}
    {rfc&&<div className="fn-pair-columns">
      {[['Request structure','Value'],['Response structure','Occurrences']].map(([name,column])=><fieldset key={name}><legend>{name}</legend>
        <table className="editor-table"><thead><tr><th>Structure</th><th>{column}</th></tr></thead><tbody><tr><td colSpan={2} className="empty-message">No fields available</td></tr></tbody></table>
      </fieldset>)}
    </div>}
    <div className={rfc?'fn-pair-columns':'fn-jdbc-columns'}>
      <FieldList title={rfc?'Import fields':'Input fields'} fields={draft.ins} change={v=>change('ins',v)}/>
      {!rfc&&<fieldset><legend>Database table fields</legend><div className="empty-message">No fields available</div></fieldset>}
      <FieldList title={rfc?'Export fields':'Output fields'} fields={draft.outs} change={v=>change('outs',v)}/>
    </div>{rfc&&flagSwitch}
  </>;
}
