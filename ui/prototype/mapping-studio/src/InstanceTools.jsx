import {useEffect,useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {FileImportIcon,FileMedicalIcon,RedoIcon,SaveIcon,TrashIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {Dialog} from './Panels';
import {generate,parsePayload,readInstance} from './testData';

export function InstanceTools({instances,format,resource,onEdit,disabled,busy=false,
  onReading,validateFile=false,selectLabel='Select test instance',showGenerate=true}){
  const {entries,current}=instances;
  const [dialog,setDialog]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
  const [reading,setReading]=useState(false);
  const file=useRef(null),generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  const locked=busy||reading||disabled;
  function apply(change){
    try{change();setError('');return true;}
    catch(e){setError(e.message);return false;}
  }
  async function load(e){
    const chosen=e.target.files?.[0];e.target.value='';if(!chosen)return;
    const token=++generation.current;setReading(true);onReading?.(true);setError('');
    try{const text=await readInstance(chosen,format);if(validateFile)parsePayload(text,format);
      if(token===generation.current)onEdit({id:'upload',name:chosen.name,text,values:{}});
    }catch{if(token===generation.current)setError('Could not read this file. Choose a valid '+format+' test input.');}
    finally{if(token===generation.current){setReading(false);onReading?.(false);}}
  }
  function add(e){
    e.preventDefault();const label=name.trim();if(!label)return;
    if(apply(()=>instances.create(label,resource)))setDialog('');
  }
  function remove(){
    if(apply(instances.remove))setDialog('');
  }
  return <>
    <Tool label="Load Test Instance" icon={FileImportIcon} disabled={locked} onClick={()=>file.current?.click()}/>
    {showGenerate&&<Tool label="Generate Instance" icon={RedoIcon} disabled={locked} onClick={()=>{setError('');onEdit({id:'generated',name:'Generated instance',text:generate(format),values:{}});}}/>}
    <span className="tool-separator"/>
    <Tool label="Add Test Instance" icon={FileMedicalIcon} disabled={locked||!resource} onClick={()=>{setName('');setError('');setDialog('add');}}/>
    <Tool label="Save Test Instance" icon={SaveIcon} disabled={locked||!current} onClick={()=>{
      if(apply(()=>instances.save(resource)))setError('Test instance saved in this browser.');
    }}/>
    <Tool label="Delete Test Instance" icon={TrashIcon} disabled={locked||!current} onClick={()=>{setError('');setDialog('delete');}}/>
    <select aria-label={selectLabel} value={current?.id ?? ''} disabled={locked||!current}
      onChange={e=>apply(()=>instances.select(e.target.value))}>
      {entries.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <input ref={file} type="file" disabled={locked} aria-label="Test instance file" hidden accept={'.'+format.toLowerCase()+',.zip'} onChange={load}/>
    {error&&!dialog&&<span role="status" className="instance-tool-notice">{error}</span>}
    {dialog==='add'&&<Dialog title="Add Test Instance" close={()=>setDialog('')}><form onSubmit={add}>
      <label className="form-field">Test instance name<input autoFocus value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}<div className="form-actions"><Button type="submit" isDisabled={!name.trim()}>OK</Button><Button variant="link" onClick={()=>setDialog('')}>Cancel</Button></div>
    </form></Dialog>}
    {dialog==='delete'&&current&&<Dialog title="Delete Test Instance" close={()=>setDialog('')}><p>Delete {current.name} from this browser?</p>
      {error&&<p role="alert">{error}</p>}<div className="form-actions"><Button variant="danger" icon={<TrashIcon/>} onClick={remove}>Delete</Button><Button variant="link" onClick={()=>setDialog('')}>Cancel</Button></div></Dialog>}
  </>;
}
