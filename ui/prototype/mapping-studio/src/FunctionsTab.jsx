import {useEffect,useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {CodeIcon,DownloadIcon,EditIcon,UploadIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {Dialog} from './Panels';
import {nodeNames} from './model';
import {areas,builtIn,declaration,functionsOf,metadata,modes,newFunction,unusedName,withFunctions} from './functionModel';
import {Dependencies,NameEditor,RowTools,Variables} from './FunctionTables';
import {moveRow} from './moveRow';
import {downloadFile} from './download';
import {exportSource,importSource} from './functionSource';
import './functions.css';

function sourceText(fn) {
  if (fn.name === areas[0]) return fn.body;
  return declaration(fn) + '\n' + fn.body + '\n}';
}

export function FunctionPreview({fn,map,edit,editing,close,openEditor}) {
  const [imports,setImports]=useState(false);
  const source=sourceText(fn);
  return <Dialog wide title={'Show Function '+fn.title+' of Library LocalUserFunctions'} close={close}
    description={fn.description} footer={<><Button variant="secondary" icon={<EditIcon/>} onClick={openEditor}>{editing?'Edit function':'View function'}</Button><Button variant="link" onClick={close}>Close</Button></>}>
    <button className="details-toggle" aria-expanded={imports} onClick={()=>setImports(!imports)}>Import Instructions</button>
    {imports&&<Dependencies map={map} edit={edit} disabled={!editing} importsOnly/>}
    <pre className="udf-source-preview">{source}</pre>
  </Dialog>;
}

export function FunctionsTab({map,edit,editing,initialId}) {
  const list=functionsOf(map);
  const [selected,select]=useState(initialId||areas[0]);
  const [log,setLog]=useState(''),[showLog,setShowLog]=useState(false);
  const file=useRef(null),readVersion=useRef(0),latestMap=useRef(map);
  latestMap.current=map;
  useEffect(()=>()=>{readVersion.current++;},[]);
  const index=list.findIndex(fn=>fn.id===selected),isCustom=index>=0;
  const active=isCustom?list[index]:builtIn(map,areas.includes(selected)?selected:areas[0]);
  const attributes=active.name===areas[0],lifecycle=!isCustom&&!attributes;
  const ready=!!(editing&&map.source&&map.target), meta=metadata(map);
  function change(changes){
    if(isCustom)edit(m=>withFunctions(m,functionsOf(m).map(fn=>fn.id===active.id?{...fn,...changes}:fn)));
    else edit(m=>({...m,javaAreas:{...m.javaAreas,[active.name]:{...builtIn(m,active.name),...changes}}}));
  }
  function add(){
    const fn=newFunction(unusedName('calculate',list.map(f=>f.name)));
    const at=isCustom?index+1:0;
    edit(m=>{const functions=functionsOf(m);return withFunctions(m,[...functions.slice(0,at),fn,...functions.slice(at)]);});
    select(fn.id);
  }
  function remove(){edit(m=>withFunctions(m,functionsOf(m).filter(fn=>fn.id!==active.id)));select(list[index-1]?.id || list[index+1]?.id || areas[0]);}
  function download(){
    const filename=meta.className+'.java';
    downloadFile(filename,new Blob([exportSource(map)],{type:'text/plain;charset=utf-8'}));
    setLog('Exported '+filename);setShowLog(true);
  }
  async function readFile(e){
    const chosen=e.target.files?.[0];e.target.value='';if(!chosen)return;
    const token=++readVersion.current;
    try{
      const text=await chosen.text();
      if(token!==readVersion.current)return;
      const next=importSource(latestMap.current,text);
      edit(m=>({...m,imports:next.imports,javaAreas:next.javaAreas,customFunctions:next.customFunctions}));
      setLog('Imported source text from '+chosen.name);
    }catch(err){if(token!==readVersion.current)return;setLog('Import failed. '+err.message);}
    setShowLog(true);
  }
  return <div className="functions-tab"><div className="panel function-meta udf-metadata">
    <div><span>Class Name</span><code>{meta.className}</code></div><div><span>Package Name</span><code>{meta.packageName}</code></div>
    <div className="udf-file-actions" role="toolbar" aria-label="Java source actions"><Tool label="Export Source Text" icon={DownloadIcon} onClick={download}/>
      <Tool label="Import Source Text" icon={UploadIcon} disabled={!ready} onClick={()=>file.current?.click()}/><input type="file" disabled={!ready} hidden accept=".java,text/plain" aria-label="Java source file" ref={file} onChange={readFile}/></div>
    <label>JDK Compliance<select aria-label="JDK Compliance" value={meta.jdk} disabled={!ready} onChange={e=>{const jdk=e.target.value;edit(m=>({...m,jdk}));}}>
      {['JDK 1.5 (Default)','JDK 1.8 (Requires NW 7.50)'].map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="function-workspace udf-workspace"><aside className="function-side"><section className="panel">
      <header className="editor-section-head"><h2>Functions and Java Areas</h2></header>
      <RowTools label="Function actions" disabled={!ready} onAdd={add} canRemove={isCustom} canUp={index>0} canDown={isCustom&&index<list.length-1}
        onRemove={remove} onMove={delta=>edit(m=>withFunctions(m,moveRow(functionsOf(m),index,delta)))}/>
      <div className="udf-name-heading">Name</div><div className="area-list">
        {areas.map(name=><button key={name} aria-pressed={active.name===name} onClick={()=>select(name)}><CodeIcon/>{name}</button>)}
        {list.map(fn=><div className={'udf-function-row '+(active.id===fn.id?'current':'')} key={fn.id}>
          <button aria-label={'Select function '+fn.name} aria-pressed={active.id===fn.id} onClick={()=>select(fn.id)}><CodeIcon/>{fn.name}</button>
          {ready&&fn.id===active.id&&<label className="udf-method-name">Method name<NameEditor label="Method name" value={fn.name} taken={[...areas,...nodeNames,...list.filter(f=>f.id!==fn.id).map(f=>f.name)]} onCommit={name=>change({name})}/></label>}
        </div>)}</div>
    </section><Dependencies map={map} edit={edit} disabled={!ready}/></aside>
    <section className="panel udf-editor" aria-label="Function editor"><header className="editor-section-head"><h2><CodeIcon/>{active.name}</h2><span>Java</span></header>
      {(isCustom||active.name==='init')&&<fieldset className="udf-properties mode-fields" disabled={!ready} key={selected}>
        {isCustom&&<label>Title<input value={active.title} onChange={e=>change({title:e.target.value})}/></label>}
        <label>Description<input value={active.description} onChange={e=>change({description:e.target.value})}/></label>
        {isCustom&&<><label>Execution Type<select aria-label="Execution Type" value={active.execution} onChange={e=>change({execution:e.target.value})}>{modes.map(m=><option key={m}>{m}</option>)}</select></label>
        <label>Category<input value={active.category} onChange={e=>change({category:e.target.value})}/></label></>}
      </fieldset>}
      {(isCustom||active.name==='init')&&<Variables disabled={!ready} key={selected} fn={active} lifecycle={lifecycle} onChange={variables=>change({variables})}/>}
      <div className="udf-code"><div className="udf-declaration">{attributes?<p>Class attributes and shared methods are available to all functions in this mapping.</p>:<>
        {lifecycle&&<p>{active.name==='init'?'Called before mapping.':'Called after mapping.'}</p>}<code>{declaration(active)}</code></>}</div>
        <textarea aria-label={'Source code for '+active.name} readOnly={!ready} spellCheck={false} value={active.body} onChange={e=>change({body:e.target.value})}/>
        {!attributes&&<code className="udf-closing">{'}'}</code>}
      </div></section></div>
    {log&&<div className="panel sig-log"><h3>Processing Log</h3><p className="plain-log" role="status">{log}</p></div>}
    {showLog&&<Dialog title="Processing Log" close={()=>setShowLog(false)} footer={<Button onClick={()=>setShowLog(false)}>Close</Button>}>
      <p className="plain-log">{log}</p></Dialog>}
  </div>;
}
