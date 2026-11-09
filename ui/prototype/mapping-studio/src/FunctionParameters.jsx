import {useState} from 'react';
import {Button,Switch} from '@patternfly/react-core';
import {TrashIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {Dialog} from './Panels';
import {parameters} from './signatureModel';
import {isLookup,standardNodeData} from './standardFunctions';
import {CalendarOptions,DateFormatHelp} from './DateParameterControls';
import {LookupParameters,LookupPicker} from './LookupParameters';

const choices={
  CCStrategy:[['0','Each Value'],['1','Empty Value'],['2','Value Change']],
  IndStrategy:[['0','Reset Index to Initial Value with Each New Context'],['1','Do Not Reset Index to Initial Value']],
  vmstrategy:[['2','Use Key'],['1','Use Default Value'],['0','Throw Exception']],
  SortComparator:[['cs','case sensitive'],['ci','case insensitive'],['num','float number']],
  SortOrder:[['ascending','ascending'],['descending','descending']]
};

function FixedValues({value,change}){
  const cell=(index,column,next)=>change(value.map((row,i)=>i===index?{...row,[column]:next}:row));
  return <fieldset><legend>Fixed values</legend>
    <Button type="button" variant="link" size="sm" onClick={()=>change([...value,{key:'',value:''}])}>Add pair</Button>
    <table className="editor-table"><thead><tr><th>key</th><th>value</th><th aria-label="Row actions"/></tr></thead>
      <tbody>{value.map((row,i)=><tr key={i}>{['key','value'].map(k=><td key={k}><input aria-label={k+' '+(i+1)} value={row[k]} onChange={e=>cell(i,k,e.target.value)}/></td>)}
        <td><Tool label={'Remove pair '+(i+1)} icon={TrashIcon} onClick={()=>change(value.filter((_,j)=>j!==i))}/></td></tr>)}</tbody></table>
  </fieldset>;
}

function Field({field,value,change,formatHelp}){
  const {key,label,type}=field;
  if(type==='calend_props')return <CalendarOptions value={value} change={change}/>;
  if(type==='fixed_values')return <FixedValues value={value} change={change}/>;
  if(type==='keepSS')return <Switch label={label} isChecked={value} onChange={(_,checked)=>change(checked)}/>;
  if(type==='CCStrategy')return <label>{label}<select aria-label={label} value={value} onChange={e=>change(e.target.value)}>{choices[type].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
  if(choices[type])return <fieldset className="fn-radio"><legend>{label}</legend>{choices[type].map(([id,name])=><label key={id}>
    <input type="radio" name={key} value={id} checked={value===id} onChange={()=>change(id)}/>{name}</label>)}</fieldset>;
  if(type==='date_format')return <div className="fn-date-row"><label>{label}<input value={value} onChange={e=>change(e.target.value)}/></label>
    <Button type="button" variant="secondary" aria-label={'Choose '+label} onClick={()=>formatHelp(key)}>Choose format…</Button></div>;
  const agency=type==='vmsagency'?'SenderParty':type==='vmtagency'?'ReceiverParty':null;
  return <label>{label}<input type={type==='int'?'number':'text'} step={type==='int'?1:undefined} maxLength={type==='char'?1:undefined} value={value}
    list={agency?'agency-'+key:undefined} onChange={e=>change(e.target.value)}/>{agency&&<datalist id={'agency-'+key}><option value={agency}/></datalist>}</label>;
}

const titles={FixValues:'Fixed-Values Table',valuemap:'Value Mapping Properties',tableLookup:'JDBC Lookup',rfclookup:'RFC Lookup'};
export function FunctionParameters({fn,node,map,save,close,readOnly}){
  const [draft,setDraft]=useState(()=>standardNodeData(fn,node.data.settings).settings);
  const [error,setError]=useState(''),[helper,setHelper]=useState(null);
  const change=(key,value)=>{setDraft(s=>({...s,[key]:value}));setError('');};
  if(helper==='lookup')return <LookupPicker rfc={fn.key==='rfclookup'} current={draft.ref} close={()=>setHelper(null)} apply={ref=>{
    if(ref!==draft.ref)setDraft(s=>({...s,ref,ins:[],outs:[]}));setHelper(null);
  }}/>;
  if(helper)return <DateFormatHelp close={()=>setHelper(null)} apply={v=>{change(helper,v);setHelper(null);}}/>;
  function submit(e){
    e.preventDefault();if(readOnly)return;
    for(const f of fn.parameters){
      if(f.type==='int'&&!/^-?\d+$/.test(draft[f.key])){setError(f.label+' must be an integer.');return;}
      if(f.type==='fixed_values'&&new Set(draft.table.map(r=>r.key)).size!==draft.table.length){setError('Each key must be unique.');return;}
    }
    save(draft);
  }
  const imports=parameters(map).filter(p=>p.parameter==='Import');
  return <Dialog title={titles[fn.key]||'Function parameters · '+fn.name} wide={isLookup(fn)||fn.key==='FixValues'} close={close}>
    <form className="fn-parameters" onSubmit={submit}>
      <fieldset className="mode-fields" disabled={readOnly}>{isLookup(fn)?<LookupParameters fn={fn} draft={draft} change={change} imports={imports} openPicker={()=>setHelper('lookup')}/>:
        fn.parameters.map(f=><Field key={f.key} field={f} value={draft[f.key]} change={v=>change(f.key,v)} formatHelp={setHelper}/>)}</fieldset>
      {error&&<p role="alert">{error}</p>}
      <div className="form-actions">{!readOnly&&<Button type="submit">Apply</Button>}<Button type="button" variant="link" onClick={close}>{readOnly?'Close':'Cancel'}</Button></div>
    </form>
  </Dialog>;
}

