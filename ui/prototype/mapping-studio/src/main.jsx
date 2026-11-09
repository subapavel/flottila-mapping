import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, AlertActionCloseButton, AlertGroup, Button } from '@patternfly/react-core';
import { ArrowRightIcon, CubeIcon, LayerGroupIcon, QuestionCircleIcon, TimesIcon } from '@patternfly/react-icons';
import { applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import '@patternfly/react-core/dist/styles/base.css';
import '@xyflow/react/dist/style.css';
import './studio.css';
import { DefinitionTools } from './DefinitionTools';
import { targetRows } from './definitionModel';
import {connectedSourcePaths,graphForPath,groupTargets,targetNode,targetsOf,ungroupTarget,updateGraph} from './groupedExpressions';
import {availableVariables,isVariablePath} from './mappingVariables';
import { SchemaPane } from './SchemaPane';
import { currentView, EditorHeader, EditorPanel } from './EditorHeader';
import { MappingOverview } from './MappingOverview';
import { CopyTextButton } from './CopyTextButton';
import { Canvas } from './Canvas';
import { Signature } from './Signature';
import { SignaturePreview } from './SignaturePreview';
import { assignExample, fixtureSide, signatureIssues } from './signatureModel';
import { FunctionsTab, FunctionPreview } from './FunctionsTab';
import { functionsOf, functionNode } from './functionModel';
import { formatOf, schemaName } from './formats';
import { MessageOverview } from './MessageOverview';
import { readPanelPreference, savePanelPreference } from './panelPreferences';
import { Dialog, Palette, Queue } from './Panels';
import {FunctionParameters} from './FunctionParameters';
import {standardFunction,standardNodeData,configureFunction} from './standardFunctions';
import { TestPanel } from './TestPanel';
import {useSimulationSession} from './useSimulationSession';
import {QueueFilePrompt,QueueInputTools} from './QueueInput';
import {useTestInstances} from './useTestInstances';
import { canWireExpression, checkMapping, copyBranch, duplicateBranch, fieldName, loadWorkspace, makeNode, mapped, storageKey, validWire, wireGraph } from './model';

const loaded=loadWorkspace();
const queueRowNumbersKey = 'flottila-mapping-studio.queue.row-numbers';
const functionsOpenKey = 'definition.functions.open';
const paneViews = {
  source: {key:'definition.source.view', defaultMode:'Table', modes:['Tree','Table','Text']},
  target: {key:'definition.target.view', defaultMode:'Table', modes:['Tree','Table','Text']},
  input: {key:'test.input.view', defaultMode:'Text', modes:['Tree','Text']},
  result: {key:'test.result.view', defaultMode:'Text', modes:['Tree','Text']},
  inputSection: {key:'test.input.section', defaultMode:'Document', modes:['Document','Parameters']},
  resultSection: {key:'test.result.section', defaultMode:'Document', modes:['Document','Parameters']}
};
function readPaneViews() {
  const views = {};
  for (const [side, {key,defaultMode,modes}] of Object.entries(paneViews)) {
    views[side] = readPanelPreference(key, defaultMode, mode => modes.includes(mode));
  }
  return views;
}
function Studio() {
  const [saved,setSaved]=useState(()=>loaded.maps.find(m=>m.id===loaded.active)||loaded.maps[0]);
  const [map,setMap]=useState(saved);
  const active=map.id;
  const [editing,setEditing]=useState(false);
  const editButtonRef=React.useRef(null);
  const [editSession,setEditSession]=useState(0);
  const [toast,setToast]=useState(0);
  const unsaved=React.useMemo(()=>saved!==map && JSON.stringify({...saved,description:saved.description||''})!==JSON.stringify({...map,description:map.description||''}),[map,saved]);
  useEffect(() => {
    if (!unsaved) return;
    function warnBeforeLeaving(event) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [unsaved]);
  const [target,setTarget]=useState('Doc/Grp/Row');
  const [source,setSource]=useState('Orders/Order/Line/Sku');
  const [selected,setSelected]=useState('fn-remove');
  const [edgeSelection,setEdgeSelection]=useState(null);
  const [nodeClipboard,setNodeClipboard]=useState(null);
  const panelRef=React.useRef(null);
  const [tab,setTab]=useState(currentView);
  useEffect(()=>{const navigate=()=>setTab(currentView());window.addEventListener('hashchange',navigate);return ()=>window.removeEventListener('hashchange',navigate);},[]);
  function changeTab(key) {
    setTab(key);
    history.replaceState(null,'','#'+key);
  }
  const [views,setViews]=useState(readPaneViews);
  const [functionsOpen, setFunctionsOpen] = useState(() =>
    readPanelPreference(functionsOpenKey, window.matchMedia('(min-width: 760px)').matches, value => typeof value === 'boolean'));
  function toggleFunctionsPanel() {
    const open = !functionsOpen;
    setFunctionsOpen(open);
    savePanelPreference(functionsOpenKey, open);
  }
  function setView(side,mode) {
    setViews(previous=>({...previous,[side]:mode}));
    savePanelPreference(paneViews[side].key, mode);
  }
  const [dialog,setDialog]=useState('');
  const [queueRowNumbers, setQueueRowNumbers] = useState(() => {
    try {
      return localStorage.getItem(queueRowNumbersKey) !== 'false';
    } catch {
      return true;
    }
  });
  function changeQueueRowNumbers(visible) {
    setQueueRowNumbers(visible);
    try {
      localStorage.setItem(queueRowNumbersKey, String(visible));
    } catch {
      // The editor keeps the preference for this session if storage is unavailable.
    }
  }
  const [functionId,setFunctionId]=useState(null);
  const [notice,setNotice]=useState('');
  const [check,setCheck]=useState(null);
  const [checking,setChecking]=useState(false);
  const timer=React.useRef();
  const functions=functionsOf(map);
  const previewFunction=functions.find(fn=>fn.id===functionId);
  const inputFormat=formatOf(map,'source');
  const inputKey=active+'-'+inputFormat;
  const instances=useTestInstances(active,inputFormat);
  const simulation=useSimulationSession(active,inputFormat,formatOf(map,'target'),instances.current);
  const queueName=instances.current?.name || simulation.state.inputName;
  const queueInput=queueName ? {name:queueName,text:simulation.input,values:simulation.state.values} : null;
  const [queueNodeId,setQueueNodeId]=useState(null);
  function openQueue(id){
    if(!id)return;
    if(!editing&&!queueInput)return;
    setQueueNodeId(id);setDialog(queueInput?'queue':'queue-input');
  }
  const resolveGraph=path=>graphForPath(map,path);
  const graph=resolveGraph(target);
  const variablesFor=path=>availableVariables(targetRows(map),path);
  const usableAt=(sourcePath,targetPath)=>!isVariablePath(sourcePath)||variablesFor(targetPath).some(([p])=>p===sourcePath);
  const canPaste=editing && !!nodeClipboard && nodeClipboard.nodes.every(n=>n.data.kind!=='source'||usableAt(n.data.path,target));
  function rememberSource(path){if(!isVariablePath(path))setSource(path);}
  const parameterNode=dialog==='function-parameters' ? graph.nodes.find(n=>n.id===selected) : null;
  const parameterFunction=standardFunction(parameterNode?.data.standardKey);
  const ready=map.source&&map.target;
  function edit(updater,{affectsMapping=true}={}) {
    if(!editing)return;
    setMap(updater);setNotice('');
    if(!affectsMapping)return;
    setCheck(null);simulation.invalidateResult();
    clearTimeout(timer.current);setChecking(false);
  }
  function editGraph(updater,path=target,options) {
    edit(m=>updateGraph(m,path,updater),options);
  }
  function copyNode(node) {
    if(!node || node.data.kind==='target')return;
    setNodeClipboard(copyBranch(graph,node.id));
  }
  function pasteNode() {
    if(!canPaste)return;
    const copy=duplicateBranch(nodeClipboard,graph);
    editGraph(g=>({...g,nodes:[...g.nodes,...copy.nodes],edges:[...g.edges,...copy.edges]}));
    selectNode(copy.root);
    const root=copy.nodes.find(n=>n.id===copy.root);
    if(root.data.kind==='source')rememberSource(root.data.path);
  }
  function pickTarget(path) {
    setEdgeSelection(null);
    setTarget(path);
    const g=resolveGraph(path);
    const focus=targetsOf(g).length>1?targetNode(g,path):g.nodes.find(n=>n.data.kind==='function')||g.nodes.find(n=>n.data.kind==='source')||g.nodes[0];
    setSelected(focus?.id);
    const src=g.nodes.find(n=>n.data.kind==='source'&&!isVariablePath(n.data.path));if(src)rememberSource(src.data.path);
  }
  function pickSource(path) {
    setSource(path);
    const found=graph.nodes.find(n=>n.data.kind==='source'&&n.data.path===path);
    if(found)selectNode(found.id);
  }
  function addTarget(path,position) {
    if(!editing||!ready)return;
    const next=groupTargets(map,target,path,position);
    if(next===map)return;
    edit(()=>next);
    setEdgeSelection(null);
    setSelected(targetNode(graphForPath(next,path),path).id);
  }
  function ungroup(path) {
    if(!editing)return;
    const next=ungroupTarget(map,path);
    if(next===map)return;
    edit(()=>next);
    setTarget(path);
    setSelected('target');
    setEdgeSelection(null);
  }
  function insert(kind,value,position,destination=target) {
    if(!editing)return;
    if(kind==='source'&&!usableAt(value,destination)){setNotice('This variable is outside the scope of the selected target.');return;}
    if(!ready){setNotice('Choose the source and target messages first.');return;}
    const count=resolveGraph(destination).nodes.filter(n=>n.data.kind===kind).length;
    const where=position || {x:kind==='source'?10:260,y:80+count*110};
    const custom=kind==='function' && functions.find(fn=>fn.id===value);
    const standard=kind==='function' && standardFunction(value);
    if(kind==='function' && !custom && !standard)return;
    const added=makeNode(kind,custom?.name || standard?.name || fieldName(value),where,kind==='source'?value:'');
    if(standard)Object.assign(added.data,standardNodeData(standard));
    if(custom) Object.assign(added.data,functionNode(custom));
    editGraph(g=>({...g,nodes:[...g.nodes,added]}),destination);
    setTarget(destination);
    if(kind==='source')rememberSource(value);
    setEdgeSelection(null);setSelected(added.id);setDialog('');
  }
  function direct(src,path) {
    if(!editing)return;
    if(!usableAt(src,path)){setNotice('This variable is outside the scope of the selected target.');return;}
    if(!ready){setNotice('Choose the source and target messages first.');return;}
    const g=resolveGraph(path);
    const candidate=makeNode('source',fieldName(src),{x:10,y:80+110*g.nodes.filter(n=>n.data.kind==='source').length},src);
    const n=g.nodes.find(n=>n.data.kind==='source' && n.data.path===src && n.data.context===candidate.data.context)||candidate;
    const wire={source:n.id,target:targetNode(g,path).id},id=crypto.randomUUID();
    if(n===candidate || validWire(g,n.id,wire.target))editGraph(old=>{
      const next=old.nodes.some(node=>node.id===n.id)?old:{...old,nodes:[...old.nodes,n]};
      return wireGraph(next,wire,null,id);
    },path);
    setEdgeSelection(null);rememberSource(src);setTarget(path);setSelected(n.id);
  }
  function selectNode(id) {
    setEdgeSelection(null);setSelected(id);const n=graph.nodes.find(n=>n.id===id);
    if(n?.data.kind==='source')rememberSource(n.data.path);
  }
  function canConnect(connection,replacing) {
    return canWireExpression(graph,connection,replacing,targetRows(map));
  }
  function connect(c,replacing) {
    if(!editing||!canConnect(c,replacing))return;
    const id=replacing||crypto.randomUUID();
    editGraph(g=>wireGraph(g,c,replacing,id));
  }
  function changeNodes(changes) {
    const selectedChange=changes.find(c=>c.type==='select'&&c.selected);
    if(selectedChange)selectNode(selectedChange.id);
    else if(changes.some(c=>c.type==='select' && c.id===selected && !c.selected))setSelected(null);
    const edits=changes.filter(c=>c.type==='position'&&c.position || c.type==='remove'&&graph.nodes.some(n=>n.id===c.id&&n.data.kind!=='target'));
    if(!edits.length)return;
    editGraph(g=>{
      const nodes=applyNodeChanges(edits,g.nodes);
      const ids=new Set(nodes.map(n=>n.id));
      return {...g,nodes,edges:g.edges.filter(e=>ids.has(e.source)&&ids.has(e.target))};
    },target,{affectsMapping:edits.some(c=>c.type!=='position')});
  }
  function changeEdges(changes) {
    for(const c of changes)if(c.type==='select'){
      if(c.selected)setSelected(null);
      setEdgeSelection(current=>c.selected?c.id:current===c.id?null:current);
    }
    const edits=changes.filter(c=>c.type==='remove');if(edits.length)editGraph(g=>({...g,edges:applyEdgeChanges(edits,g.edges)}));
  }
  function save() {
    if(!editing||!unsaved)return;
    try {
      const workspace=loadWorkspace();
      const maps=workspace.maps.some(m=>m.id===active)?workspace.maps.map(m=>m.id===active?map:m):[...workspace.maps,map];
      localStorage.setItem(storageKey,JSON.stringify({maps,active}));
      setSaved(map);setNotice('');setToast(t=>t+1);
    }
    catch {setNotice('Browser storage is unavailable. This draft is still open in this tab.');return false;}
  }
  function leaveEditing() {
    clearTimeout(timer.current);
    setChecking(false);
    setCheck(null);
    setNotice('');
    setDialog('');
    if(unsaved) {
      const restoredTarget=graphForPath(saved,target) ? target : 'Doc/Grp/Row';
      const restoredGraph=graphForPath(saved,restoredTarget);
      setTarget(restoredTarget);
      if(!restoredGraph.nodes.some(node=>node.id===selected))setSelected(null);
      if(!restoredGraph.edges.some(edge=>edge.id===edgeSelection))setEdgeSelection(null);
      setNodeClipboard(null);
    }
    setMap(saved);
    setEditing(false);
    setEditSession(previous=>previous+1);
    requestAnimationFrame(()=>editButtonRef.current?.focus());
  }
  function runCheck(){
    if(!editing||!unsaved||checking)return;setCheck(null);setNotice('');setChecking(true);
    timer.current=setTimeout(()=>{setCheck([...signatureIssues(map),...checkMapping(map)]);setChecking(false);},320);
  }
  useEffect(()=>{function keys(e){if(dialog)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key==='F7'){e.preventDefault();runCheck();}}
    window.addEventListener('keydown',keys);return()=>window.removeEventListener('keydown',keys);});
  const paths=React.useMemo(()=>connectedSourcePaths(map.graphs),[map.graphs]);
  const targets=new Set(targetRows(map).filter(([path])=>mapped(resolveGraph(path),path)).map(([path])=>path));
  const close=()=>setDialog('');
  const assignSide=dialog==='assign-source'?'source':'target';
  function pane(side){const isSource=side==='source';return <SchemaPane key={map.id+side} side={side} format={formatOf(map,side)} mode={views[side]} onMode={mode=>setView(side,mode)} assigned={map[side]} selected={isSource?source:target} activePaths={isSource?paths:targets}
      onPick={isSource?pickSource:pickTarget} onAdd={p=>insert('source',p)} onDirect={direct} onAssign={()=>setDialog('assign-'+side)}/>;}
  return <><header className="masthead"><div className="brand"><span className="brand-icon"><LayerGroupIcon/></span>Flottila</div><span className="mast-divider"/><span className="mast-product">Mapping studio</span><div className="mast-right"><span className="prototype-tag"><i/>Local prototype</span><button className="help-button" aria-label="About this prototype" title="About this prototype" onClick={()=>setDialog('help')}><QuestionCircleIcon/></button></div></header>
  <main className="main">
    <EditorHeader map={map} activeTab={tab} panelRef={panelRef} onTabChange={changeTab} editing={editing} onEdit={()=>setEditing(true)} unsaved={unsaved} checking={checking}
      editButtonRef={editButtonRef} onCancel={()=>unsaved?setDialog('discard'):leaveEditing()} onCheck={runCheck} onSave={save}/>
    {notice&&<div className="feedback" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><TimesIcon/></button></div>}
    {check!==null&&<div className={'feedback '+(check.length?'warn':'ok')} role="status"><div><strong>{check.length?'Check found issues':'Local check passed'}</strong>{check.length?<ul>{check.map((m,i)=><li key={i}>{m}</li>)}</ul>:<span> · Schemas assigned and graph connections complete.</span>}</div>
      <div className="check-actions">{tab!=='definition'&&tab!=='functions'&&<CopyTextButton label="check result" text={check.length?['Check found issues',...check].join('\n'):'Local check passed · Schemas assigned and graph connections complete.'}/>}
        <button aria-label="Dismiss check" onClick={()=>setCheck(null)}><TimesIcon/></button></div></div>}
    <EditorPanel activeTab={tab} panelRef={panelRef}>
    {tab==='overview' && <MappingOverview editing={editing} map={map} onDescriptionChange={description =>
      edit(current => ({...current, description}), {affectsMapping:false})}/>}
    {tab==='definition'&&(!fixtureSide(map,'source',true)||!fixtureSide(map,'target',true))?<SignaturePreview editing={editing} map={map} onEdit={()=>changeTab('signature')}/>:tab==='definition'?<DefinitionTools editing={editing} key={active} map={map} target={target} source={source} selectTarget={pickTarget} selectSource={pickSource} selectNode={selectNode}
      graphForPath={resolveGraph} editGraph={editGraph} addTarget={addTarget} ungroup={ungroup} canConnect={canConnect} addVariableNode={(path,dst)=>insert('source',path,undefined,dst)}
      copyNode={copyNode} pasteNode={pasteNode} canPaste={canPaste} canInspectQueue={editing||!!queueInput}
      queueTools={<QueueInputTools key={inputKey+'-'+editSession} instances={instances} format={inputFormat} resource={queueInput} onLoad={simulation.loadInput} enabled={editing&&ready}/>}
      connect={connect} edit={edit} notify={setNotice} openQueue={openQueue} editParameters={id=>{selectNode(id);setDialog('function-parameters');}} assign={side=>setDialog('assign-'+side)} overview={<MessageOverview graphs={map.graphs} selectedTarget={target} onSelect={pickTarget}>
      {pane('source')}{pane('target')}
    </MessageOverview>}><div className="workbench"><Canvas key={map.id+target} graph={{...graph,edges:graph.edges.map(e=>({...e,selected:e.id===edgeSelection}))}} customFunctions={functions} paletteOpen={functionsOpen} previewFunction={fn=>{setFunctionId(fn.id);setDialog('function-preview');}} togglePalette={toggleFunctionsPanel} addFunction={(key,pos)=>insert('function',key,pos)} assigned={ready} selected={selected}
      changeNodes={changeNodes} changeEdges={changeEdges} connect={connect} select={selectNode} onAdd={()=>setDialog('palette')} addField={(p,pos)=>insert('source',p,pos)} addTarget={addTarget}/>
    </div></DefinitionTools>
    :tab==='signature'?<Signature editing={editing} key={active} map={map} edit={edit}/>
    :tab==='functions'?<FunctionsTab editing={editing} key={active+'-'+editSession} map={map} edit={edit} initialId={functionId}/>
    :tab==='test' && <TestPanel editing={editing} key={inputKey+'-'+formatOf(map,'target')+'-'+editSession} simulation={simulation} instances={instances} map={map} views={views} setView={setView}/>}
    </EditorPanel>
  </main>
  {dialog==='discard'&&<Dialog title="Discard changes?" close={close} elementToFocus="#keep-editing"
    footer={<><Button variant="danger" onClick={leaveEditing}>Discard changes</Button>
      <Button id="keep-editing" variant="link" onClick={close}>Keep editing</Button></>}>
    <p>Discard your unsaved changes to <strong>{map.title||map.name}</strong> and return to view mode?</p>
  </Dialog>}
  <AlertGroup className="mapping-save-toast" isToast isLiveRegion aria-label="Save notifications">{toast>0&&<Alert key={toast} variant="success" title={'Mapping '+(map.title||map.name)+' saved'} timeout={8000} onTimeout={()=>setToast(0)} actionClose={<AlertActionCloseButton aria-label="Dismiss save notification" onClose={()=>setToast(0)}/>}/>}</AlertGroup>
    {dialog==='help'&&<Dialog title="About this prototype" close={close}><p>This local workspace recreates the observed SAP PO message mapping workflow. Open a mapping from its Flottila package. Choose Edit to make changes.</p><p>Drag a source field onto a target for a direct connection. In its expression, drag from an output to an input to connect them. Dropping on an occupied input replaces its wire. Move either end of a wire to reconnect it, or right-click it and choose Disconnect. To connect with the keyboard, focus a node, press Shift+F10 and choose Connect to.</p><p>Drag the canvas to pan. Lay Out Mapping arranges the expression from left to right at its fixed scale. Copying a function also copies its input branches. Paste adds a separate copy, with no connection to the target. Delete Floating Objects removes all objects and branches that have no path to the target. A check mark means complete, an exclamation mark indicates a missing input or an incomplete dependency, and a dash means there is no path to the target.</p><p>Double-click a function with parameters or use its gear to edit them. Right-click a node and choose Display Queue to preview its queue for the selected test input. Save stores changes in this browser. Test simulates the recorded mapping.</p></Dialog>}
  {dialog.startsWith('assign-')&&<Dialog title={'Choose '+assignSide+' message'} close={close}><div className="palette-items">{['XML','JSON'].map(format=><button key={format} onClick={()=>{edit(m=>assignExample(m,assignSide,format));close();}}><CubeIcon/><span><b>{assignSide==='source'?'Orders':'Doc'}</b><small>{schemaName(assignSide,format)}</small></span><code>{format}</code><ArrowRightIcon/></button>)}</div></Dialog>}
  {dialog==='palette'&&<Palette customFunctions={functions} variables={variablesFor(target)} sourceFormat={inputFormat} add={insert} close={close}/>}
  {parameterFunction && <FunctionParameters readOnly={!editing} key={parameterNode.id} node={parameterNode} fn={parameterFunction} map={map} close={close} save={settings=>{
    editGraph(g=>configureFunction(g,parameterNode.id,settings));close();
  }}/>}
  {dialog==='function-preview'&&previewFunction&&<FunctionPreview editing={editing} fn={previewFunction} map={map} edit={edit} close={close} openEditor={()=>{close();changeTab('functions');}}/>}
  {dialog==='queue-input'&&<QueueFilePrompt format={inputFormat} close={close} onFile={item=>{simulation.loadInput(item);setDialog('queue');}}/>}
  {dialog==='queue'&&queueInput&&<Queue close={close} numbers={queueRowNumbers} onNumbersChange={changeQueueRowNumbers}
    graph={graph} graphForPath={resolveGraph} nodeId={queueNodeId} input={queueInput} format={inputFormat}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<Studio/>);
