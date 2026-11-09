import {useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {SearchIcon,RedoIcon} from '@patternfly/react-icons';
import {Dialog} from './Panels';
import {Tool} from './ToolbarTools';
import {adapterCatalog,catalog,component,namespaces} from './signatureModel';

export function SignatureCatalog({kind,row,onApply,close,entries}){
  const adapter=kind==='adapter',ns=kind==='namespace',json=row?.type==='JSON Schema',ext=row?.type==='External Message'||json;
  const title=adapter?'Choose Adapter Metadata':ns?(json?'Choose schema ID':'Choose Namespace'):'Choose '+row.type;
  const all=entries ?? (adapter?adapterCatalog:ns?(json?catalog('JSON Schema').map(e=>e.namespace):namespaces).map(name=>({name})):catalog(row.type));
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(''),[hit,setHit]=useState(''),[notice,setNotice]=useState('');
  const [mode,setMode]=useState('Tabular Search Help'),[branch,setBranch]=useState('');
  const table=useRef(null),rows=ns&&mode==='Hierarchical Search Help'&&branch?all.filter(r=>r.name===branch):all;
  const chosen=rows.find(r=>r.name===selected);
  const columns=ns?[[json?'Schema ID':'Namespace','name']]:adapter?[['Name','name'],['Namespace','namespace'],['Software Component Version','component'],['Description','description']]:
    ext?[[json?'Title':'Name of External Message','name'],[json?'Schema ID':'Namespace of External Message','namespace'],[json?'Schema':'Name','schema'],['Repository namespace','repository']]:[['Name','name'],['Namespace','namespace']];
  function go(e){e.preventDefault();const q=query.trim().toLowerCase();if(!q)return;const matches=rows.filter(r=>columns.some(([,key])=>(r[key]||'').toLowerCase().includes(q)));if(!matches.length){setHit('');setNotice('No match.');return;}
    const next=matches[(matches.findIndex(r=>r.name===hit)+1)%matches.length];setHit(next.name);setNotice('Match: '+next.name);Array.from(table.current.rows).find(tr=>tr.dataset.name===next.name)?.scrollIntoView({block:'nearest'});}
  function refresh(){setQuery('');setSelected('');setHit('');setNotice('');}
  return <Dialog wide title={title} close={close} footer={<><Button isDisabled={!chosen} onClick={()=>onApply(chosen)}>Apply</Button><Button variant="link" onClick={close}>Cancel</Button></>}>
    {ns&&<div className="switches sig-help-tabs">{['Hierarchical Search Help','Tabular Search Help'].map(m=><button key={m} aria-pressed={mode===m} onClick={()=>{setMode(m);setBranch('');refresh();}}>{m}</button>)}</div>}
    {ns&&mode==='Hierarchical Search Help'?<details open className="sig-hierarchy"><summary>{component}</summary>{all.map(r=><button key={r.name} aria-pressed={branch===r.name} onClick={()=>{setBranch(r.name);refresh();}}>{r.name}</button>)}</details>:
    <div className="sig-criteria"><h3>Search Criteria</h3><dl><dt>Software Component Version</dt><dd>{adapter?'All Versions from SLD':component}</dd>
    {adapter&&<><dt>Adapter Runtime Type</dt><dd>Java Runtime</dd><dt>Message Security Required for All Message Protocols</dt><dd>No</dd></>}{ns&&!json&&<><dt>Namespaces for RFC or IDoc Also</dt><dd>Yes</dd></>}</dl></div>}
    <h3 className="sig-result-title">Search Result</h3>
    <form className="sig-search" onSubmit={go}><Tool label="Refresh results" icon={RedoIcon} onClick={refresh}/><label><SearchIcon/><input autoFocus aria-label="Search catalog" placeholder="Find in results" value={query} onChange={e=>{setQuery(e.target.value);setHit('');setNotice('');}}/></label><Button type="submit" size="sm" variant="secondary" isDisabled={!query.trim()}>Go</Button></form>
    <div className="sig-catalog-scroll"><table ref={table} className="editor-table sig-catalog" aria-label="Catalog results"><thead><tr>{columns.map(([h])=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.name} data-name={r.name} className={r.name===selected?'sig-selected':r.name===hit?'sig-found':''}
      onClick={()=>setSelected(r.name)} onDoubleClick={()=>onApply(r)}>{columns.map(([h,k],i)=><td key={h}>{i===0?<button type="button" className="sig-result-name" aria-pressed={r.name===selected} onClick={()=>setSelected(r.name)}>{r[k]}</button>:r[k]||'—'}</td>)}</tr>)}</tbody></table>
    {!rows.length&&<p className="empty-message">No entries of this type in the local catalog.</p>}</div><p className="sig-find-status" role="status">{notice}</p>
  </Dialog>;
}
