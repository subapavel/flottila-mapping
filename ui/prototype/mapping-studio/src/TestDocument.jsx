import {useEffect,useMemo,useRef,useState} from 'react';
import {Button,Tooltip} from '@patternfly/react-core';
import {AngleDownIcon,AngleRightIcon,AngleDoubleDownIcon,AngleDoubleUpIcon,AlignLeftIcon,BroomIcon,CodeIcon,DownloadIcon,FilterIcon,PasteIcon,RouteIcon,SearchIcon} from '@patternfly/react-icons';
import {FieldTypeIcon} from './FieldTypeIcon';
import {ActionMenu,action,deleteAction,isContextMenuKey,menuAnchor} from './ActionMenu';
import {Dialog} from './Panels';
import {CopySurface,writeClipboardText} from './CopyTextButton';
import {Tool} from './ToolbarTools';
import {ViewSwitch} from './ViewSwitch';
import {alignInstance,downloadInstance,editInstanceNode,headerDefaults,isUsed,payloadRows,pretty,removeUnused} from './testData';

function Parameters({side,parameters,values,change,locked}) {
  const input=side==='Input';
  function table(title,rows) {
    return <section className="parameter-group"><h4>{title}</h4><div className="params-scroll"><table className="instance-tree" aria-label={title}>
      <thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>{rows.map(({id,label,initial})=><tr key={id}><td>{label}</td>
        <td>{input?<input aria-label={label} readOnly={locked} value={values[id]??initial??''} onChange={e=>change(id,e.target.value)}/>:''}</td></tr>)}</tbody>
    </table>{!rows.length&&<p className="table-empty">No {input?'import':'export'} parameters defined.</p>}</div></section>;
  }
  return <div className="test-parameters">{table(input?'Import Parameters':'Export Parameters',parameters.map(p=>({id:'param:'+p.id,label:p.name||'Unnamed parameter',initial:p.category==='Adapter'?'?':''})))}
    {input&&table('Header Parameters',Object.entries(headerDefaults).map(([key,value])=>({id:'header:'+key,label:key,initial:value})))}</div>;
}
function ValueCell({row,edit,disabled}) {
  const [draft,setDraft]=useState(row.value);
  const [error,setError]=useState('');
  useEffect(()=>{setDraft(row.value);setError('');},[row.id,row.value]);
  if(!edit||!row.write)return <span>{row.value}</span>;
  if(row.kind==='string')return <input aria-label={row.name+' value'} disabled={disabled} value={row.value} onChange={e=>edit(row.write(e.target.value))}/>;
  function commit(){
    try {if(draft!==row.value)edit(row.write(draft));setError('');}
    catch{setError('Enter a '+row.kind+' value.');setDraft(row.value);}
  }
  return <><input aria-label={row.name+' value'} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)}
    onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>{error&&<small role="status">{error}</small>}</>;
}
export function TestDocument({side,format,text,mode,setMode,parameters,values,changeParameter,edit,used,readOnly=false,disabled,section,setSection,signatureSummary,failed=false}) {
  const input=side==='Input',title=input?'Source':'Result',root=input?'Orders':'Doc';
  const [closed,setClosed]=useState(new Set());
  const [selection,select]=useState(null);
  const [fullPath,setFullPath]=useState(false);
  const [filter,setFilter]=useState(false);
  const [search,setSearch]=useState(false);
  const [term,setTerm]=useState('');
  const [hit,setHit]=useState(-1);
  const [formatted,setFormatted]=useState(null);
  const [error,setError]=useState('');
  const [menu,setMenu]=useState(null);
  const [nodeDialog,setNodeDialog]=useState(null);
  const [readingClipboard,setReadingClipboard]=useState(false);
  const editor=useRef(null), tree=useRef(null), searchBox=useRef(null);
  const available=text!==null;
  const displayed=!input && formatted?.original===text ? formatted.text : (text??'');
  const treeMode=mode==='Tree';
  const rows=useMemo(()=>{try{return available?payloadRows(displayed,format,root):[];}catch{return null;}},[displayed,format,root,available]);
  const visible=useMemo(()=>{
    const out=[];let hiddenBelow=Infinity;
    for(const row of rows||[]){if(row.level>hiddenBelow)continue;hiddenBelow=Infinity;
      if(input&&filter&&!isUsed(row.schemaPath,used))continue;
      out.push(row);if(closed.has(row.id))hiddenBelow=row.level;}
    return out;
  },[rows,input,filter,used,closed]);
  const selected=rows?.find(r=>r.id===selection);
  const selectedPath=selected?.path||rows?.[0]?.path||'';
  const allClosed=visible.length===1 && closed.has(visible[0].id);
  const query=term.toLowerCase();
  const matches=useMemo(()=>{
    if(!query)return [];
    if(treeMode)return (rows||[]).filter(row=>(!input||!filter||isUsed(row.schemaPath,used))&&(row.name+' '+row.value).toLowerCase().includes(query));
    const result=[], value=displayed.toLowerCase();let at=value.indexOf(query);
    while(at>=0){result.push(at);at=value.indexOf(query,at+query.length);}
    return result;
  },[query,treeMode,rows,input,filter,used,displayed]);
  function nextMatch() {
    if(!matches.length)return;
    const index=(hit+1)%matches.length;setHit(index);
    if(treeMode){setClosed(new Set());select(matches[index].id);requestAnimationFrame(()=>{
      [...(tree.current?.querySelectorAll('tr[data-row]')||[])].find(tr=>tr.dataset.row===matches[index].id)?.scrollIntoView({block:'nearest'});
    });}
    else if(input){editor.current?.focus();editor.current?.setSelectionRange(matches[index],matches[index]+term.length);}
    else requestAnimationFrame(()=>editor.current?.querySelector('mark.current')?.scrollIntoView({block:'nearest'}));
  }
  function outputText(){
    if(!search||!term||!matches.length)return displayed;
    let end=0;const parts=[];
    matches.forEach((at,i)=>{parts.push(displayed.slice(end,at),<mark key={at} className={i===hit?'current':''}>{displayed.slice(at,at+term.length)}</mark>);end=at+term.length;});
    return [...parts,displayed.slice(end)];
  }
  function switchMode(value){setError('');setMenu(null);setHit(-1);setMode(value);}
  function toggleSearch(){setSearch(!search);setTerm('');setHit(-1);if(!search)requestAnimationFrame(()=>searchBox.current?.focus());}
  function runAction(fn){try{fn();setError('');}catch(e){setError('Cannot process this '+format+' document. '+e.message);}}
  function toggleExpand(){
    if(allClosed)setClosed(new Set());
    else if(closed.size)setClosed(new Set());
    else setClosed(new Set((rows||[]).filter(r=>r.branch).map(r=>r.id)));
  }
  function showMenu(e,label,items){setMenu({key:label,label,items,anchor:menuAnchor(e)});}
  function formatText(){runAction(()=>{const value=pretty(displayed,format);if(input)edit(value);else setFormatted({original:text,text:value});});}
  function remove(){runAction(()=>edit(removeUnused(text,format,used)));}
  function clean(){runAction(()=>edit(alignInstance(text,format)));}
  function changeSource(value) {
    edit(value);
    setError('');
    setHit(-1);
  }
  async function pasteSource() {
    const field=editor.current;
    if (!field || field.readOnly || field.disabled || readingClipboard) return;
    const original=field.value;
    setReadingClipboard(true);
    try {
      const pasted=await navigator.clipboard.readText();
      if (field!==editor.current || field.readOnly || field.disabled || field.value!==original) return;
      field.focus();
      if (!pasted) {
        setError('The clipboard contains no text.');
        return;
      }
      field.setRangeText(pasted.replace(/\r\n?/g,'\n'),field.selectionStart,field.selectionEnd,'end');
      changeSource(field.value);
    } catch {
      if (field!==editor.current || field.readOnly || field.disabled) return;
      field.focus();
      setError('Clipboard access is unavailable. Use the paste shortcut in the source editor.');
    } finally {
      setReadingClipboard(false);
    }
  }
  async function copy(label,value) {
    try {await writeClipboardText(value);}
    catch {setNodeDialog({label,copy:value});}
  }
  function changeNode(row,operation,name,literal) {
    edit(editInstanceNode(text,format,row,operation,name,literal));
    setClosed(new Set());select(operation==='delete'?null:row.id);setHit(-1);setError('');
  }
  function rowMenu(e,row) {
    select(row.id);
    const xml=format==='XML';
    const items=[];
    if(input){
      function add(label,operation,unavailable,needsName=false,needsValue=false) {
        const command=operation==='delete'?deleteAction:action;
        items.push(command(label,()=>{
          if(needsName||needsValue)setNodeDialog({label,operation,row,needsName,needsValue,name:'',literal:'""'});
          else runAction(()=>changeNode(row,operation));
        },{disabled:readOnly||disabled||unavailable}));
      }
      add('Duplicate Subtree','duplicate',!row.level||!!row.attribute,!xml&&!row.arrayItem);
      if(xml){
        add('Add Element','element',!!row.attribute,true);
        add('Add Attribute','attribute',!!row.attribute,true);
      }else{
        add('Add Property','property',row.kind!=='object',true,true);
        add('Add Item','item',row.kind!=='array',false,true);
      }
      add('Delete Node','delete',!row.level);
    }
    items.push(action('Copy Path',()=>copy('Copy Path',row.path)),action('Copy Value',()=>copy('Copy Value',row.value),
      {disabled:row.value===''||row.kind==='array'||row.kind==='object'}));
    showMenu(e,side+' node actions',items);
  }
  function submitNode(e) {
    e.preventDefault();
    try {
      const {row,operation,name,literal}=nodeDialog;
      changeNode(row,operation,format==='XML'?name.trim():name,literal);
      setNodeDialog(null);
    } catch(err){setNodeDialog({...nodeDialog,error:err.message});}
  }
  const treeLabel=(input?'Input':'Result')+' structure and values';
  return <section id={input?'test-input-pane':'test-result-pane'} className="panel xml-card test-document" aria-label={title}>
    <header>
      <h3><CodeIcon/>{title}</h3>
      <code>{format}</code>
    </header>
    {section==='Document'&&signatureSummary?<div className="result-empty"><CodeIcon/><p>{signatureSummary}</p><small>No recorded test document for this signature.</small></div>:section==='Document'?<>
      <div className="doc-tools"><ViewSwitch label={side+' document view'} value={mode} onChange={switchMode}/>
        <div className="tree-tool-buttons" role="toolbar" aria-label={side+' document tools'}>
          {treeMode?<>
            <Tool label={closed.size?'Expand Tree':'Collapse Tree'} icon={closed.size?AngleDoubleDownIcon:AngleDoubleUpIcon} disabled={!rows?.length} onClick={toggleExpand}/>
            <Tool label="Show Full Path" icon={RouteIcon} pressed={fullPath} onClick={()=>setFullPath(v=>!v)}/>
            {input&&<><span className="tool-split"><Tool label="Filter Tree" icon={FilterIcon} pressed={filter} onClick={()=>setFilter(v=>!v)}/><Tool label="Filter Tree options" menu onClick={e=>showMenu(e,'Filter Tree',[
              action(filter?'Switch Off':'Switch On',()=>setFilter(!filter)),action('Show Used Fields Only',()=>setFilter(true),{checked:true})])}/></span>
              <span className="tool-split"><Tool label="Remove Unused Fields" icon={BroomIcon} disabled={readOnly||disabled||!rows} onClick={remove}/><Tool label="Instance cleanup options" disabled={readOnly||disabled||!rows} menu onClick={e=>showMenu(e,'Instance cleanup',[action('Remove Unused Fields',remove,{icon:BroomIcon}),action('CleanUp',clean)])}/></span></>}
          </>:<Tool label="Pretty Print" icon={AlignLeftIcon} disabled={!available||readOnly||disabled} onClick={formatText}/>}
          <Tool label={search?'Close Search':'Open Search'} icon={SearchIcon} pressed={search} onClick={toggleSearch}/>
          <Tool label="Save Document Source" icon={DownloadIcon} disabled={!available} onClick={()=>downloadInstance(displayed,format)}/>
        </div>
      </div>
      {search&&<div className="instance-find"><SearchIcon/><input ref={searchBox} aria-label={'Search '+side.toLowerCase()+' document'}
        placeholder={treeMode?'Find a field or value':'Find in '+format} value={term} onChange={e=>{setTerm(e.target.value);setHit(-1);}}
        onKeyDown={e=>{if(e.key==='Enter')nextMatch();if(e.key==='Escape')toggleSearch();}}/>
        <small>{term?(hit>=0?((hit%Math.max(1,matches.length))+1)+' / ':'')+matches.length:''}</small>
        <button onClick={nextMatch} disabled={!matches.length}>Find next</button></div>}
      {error&&<p className="doc-error" role="alert">{error}</p>}
      {treeMode?(!available?<div className="result-empty"><CodeIcon/><p>{failed?'The simulation failed.':'Run the simulation to display the '+format+' result.'}</p></div>:rows===null?<p className="empty-message" role="status">The {format} cannot be displayed as a tree. Open Text to correct it.</p>:
          <div ref={tree} className="instance-scroll"><table className="instance-tree" aria-label={treeLabel}><thead><tr><th>Structure</th><th>Value</th></tr></thead>
            <tbody>{visible.map(row=><tr key={row.id} data-row={row.id} className={selection===row.id?'selected-instance':''}
              tabIndex={-1} onContextMenu={e=>rowMenu(e,row)} onKeyDown={e=>{if(isContextMenuKey(e))rowMenu(e,row);}}
              onClick={()=>select(row.id)} onFocus={()=>select(row.id)}>
              <td style={{paddingLeft:8+row.level*13}}>{row.branch?<button className="caret" aria-expanded={!closed.has(row.id)} aria-label={(closed.has(row.id)?'Expand ':'Collapse ')+row.name}
                onClick={()=>setClosed(old=>{const next=new Set(old);if(next.has(row.id))next.delete(row.id);else next.add(row.id);return next;})}>
                {closed.has(row.id)?<AngleRightIcon/>:<AngleDownIcon/>}</button>:<span className="instance-spacer"/>}
                <button className="instance-name" onClick={()=>select(row.id)}><FieldTypeIcon type={format==='XML'&&row.branch?'structure':row.kind}/>{row.name}</button></td>
              <td><ValueCell row={row} edit={readOnly?undefined:edit} disabled={disabled}/></td></tr>)}</tbody></table></div>):
        <CopySurface className="document-content" label={(input?'input':'result')+' '+format} text={displayed}
          beforeCopy={input && available && <Tooltip content="Paste from clipboard" position="top">
            <Button type="button" variant="plain" aria-label="Paste from clipboard" icon={<PasteIcon/>}
              isDisabled={readOnly||disabled||readingClipboard} onClick={pasteSource}/>
          </Tooltip>}>
          {!available?<div className="result-empty"><CodeIcon/><p>{failed?'The simulation failed.':'Run the simulation to display the '+format+' result.'}</p></div>:
            input?<textarea aria-label={'Input '+format} ref={editor} spellCheck={false} readOnly={readOnly} disabled={disabled} value={text} onChange={e=>changeSource(e.target.value)}/>:
            <pre ref={editor} className="result-xml">{outputText()}</pre>}
        </CopySurface>}
      {treeMode&&fullPath&&<CopySurface className="path-display" label={side.toLowerCase()+' path'} text={selectedPath}><code>{selectedPath}</code></CopySurface>}
    </>:<Parameters side={side} parameters={parameters} values={values} change={changeParameter} locked={readOnly||disabled}/>}
    <div className="doc-tabs" role="group" aria-label={side+' panel'}>{['Document','Parameters'].map(tab=><button key={tab} aria-pressed={section===tab} onClick={()=>{setMenu(null);setSection(tab);}}>{tab}</button>)}</div>
    <ActionMenu menu={menu} onClose={focus=>{if(focus)menu?.anchor.element?.focus();setMenu(null);}}/>
    {nodeDialog&&<Dialog title={nodeDialog.label} close={()=>setNodeDialog(null)}>
      {nodeDialog.copy!==undefined?<CopySurface className="copy-value" label={nodeDialog.label==='Copy Path'?'path':'value'} text={nodeDialog.copy}>
        <input aria-label={nodeDialog.label} readOnly autoFocus value={nodeDialog.copy} onFocus={e=>e.target.select()}/></CopySurface>:
        <form onSubmit={submitNode}>
          {nodeDialog.needsName&&<label className="form-field">{format==='JSON'?'Property name':nodeDialog.operation==='attribute'?'Attribute name':'Element name'}
            <input autoFocus required={format==='XML'} value={nodeDialog.name} onChange={e=>setNodeDialog({...nodeDialog,name:e.target.value,error:''})}/></label>}
          {nodeDialog.needsValue&&<label className="form-field">JSON value
            <input autoFocus={!nodeDialog.needsName} required value={nodeDialog.literal} onChange={e=>setNodeDialog({...nodeDialog,literal:e.target.value,error:''})}/></label>}
          {nodeDialog.error&&<p role="alert">{nodeDialog.error}</p>}
          <div className="form-actions"><Button type="submit">OK</Button><Button variant="link" onClick={()=>setNodeDialog(null)}>Cancel</Button></div>
        </form>}
    </Dialog>}
  </section>;
}
