import {createContext,useContext,useMemo,useRef,useState} from 'react';
import {Button} from '@patternfly/react-core';
import {CodeBranchIcon,CodeIcon,FolderOpenIcon,LinkIcon,ObjectGroupIcon,TrashIcon} from '@patternfly/react-icons';
import {ActionMenu,action,deleteAction,menuAnchor} from './ActionMenu';
import {Dialog} from './Panels';
import {writeClipboardText} from './CopyTextButton';
import {useSplitLayout,VerticalSplitLayout} from './SplitLayout';
import {PaneSizeTools,Tool} from './ToolbarTools';
import {readPanelPreference,savePanelPreference} from './panelPreferences';
import {contexts,emptyGraph,fieldName,inputPorts,makeNode,mapped,outputPorts,sourceFields} from './model';
import {duplicateBranch,expression,mappingPath,targetRows,under} from './definitionModel';
import {hasParameters} from './standardFunctions';
import {formatOf,schemaFieldTypes} from './formats';
import {canAddVariable,isVariablePath,variableTargets} from './mappingVariables';
import {targetNode,targetsOf,updateGraph} from './groupedExpressions';

const DefinitionContext=createContext(null);
function validDependencyView(view) {
  return typeof view?.visible === 'boolean' && (view.targets === null ||
    (Array.isArray(view.targets) && view.targets.every(path => typeof path === 'string')));
}
export const useDefinition=()=>useContext(DefinitionContext);
function connectionActions(graph, node, connect, canConnect) {
  const items = [];
  const outputs = outputPorts(node);
  for (const output of outputs) {
    for (const destination of graph.nodes) {
      for (const input of inputPorts(destination)) {
        const wire = {source:node.id, sourceHandle:output.id, target:destination.id, targetHandle:input.id};
        if (!canConnect(wire)) continue;
        const name = destination.data.title || destination.data.name;
        const label = outputs.length > 1 ? output.label + ' → ' + name : name;
        items.push(action(label + ' · ' + input.label, () => connect(wire), {
          key: JSON.stringify([output.id, destination.id, input.id])
        }));
      }
    }
  }
  return items;
}

export function DefinitionTools({editing,canInspectQueue,map,target,source,graphForPath,editGraph,addTarget,ungroup,addVariableNode,selectTarget,selectSource,selectNode,connect,canConnect,edit,openQueue,copyNode,pasteNode,canPaste,editParameters,assign,notify,overview,queueTools,children}) {
  const [isDataFlow,setDataFlow]=useState(true);
  const layout = useSplitLayout('definition.layout', 0.4);
  const view = isDataFlow ? layout.view : 'split';
  const dependencyKey = `definition.${map.id}.dependencies`;
  const [dependencyView,setDependencyView]=useState(() =>
    readPanelPreference(dependencyKey, {visible:false,targets:null}, validDependencyView));
  const [marked,setMarked]=useState([]);
  const [menu,setMenu]=useState(null);
  const [dialog,setDialog]=useState(null);
  const [name,setName]=useState('');
  const [reveal,setReveal]=useState(null);
  const serial=useRef(0);
  const rows=targetRows(map);
  const sourceFormat=formatOf(map,'source'), targetFormat=formatOf(map,'target');
  const fieldTypes=useMemo(()=>({
    source:schemaFieldTypes(sourceFields,sourceFormat),
    target:schemaFieldTypes(rows,targetFormat)
  }),[rows,sourceFormat,targetFormat]);
  const mappedTargets=rows.map(([path])=>path).filter(path=>mapped(graphForPath(path),path));
  function showMenu(e,label,items,element) {
    const anchor=menuAnchor(e,element);
    setMenu({label,items,anchor,key:++serial.current});
  }
  function closeMenu(focus) {
    if(focus&&menu?.anchor.element?.isConnected)menu.anchor.element.focus?.({preventScroll:true});
    setMenu(null);
  }
  function open(type,path=target) {setName('');setDialog({type,path});}
  function find(side,path) {
    if(side==='source')selectSource(path);else selectTarget(path);
    setReveal({side,path,serial:++serial.current});
  }
  function uses(kind,value) {
    return mappedTargets.filter(path=>mappingPath(graphForPath(path),path).some(n=>kind==='source'?n.data.path===value:n.data.kind==='function'&&n.data.name===value));
  }
  function whereUsed(matches) {
    return action('Where Used',null,{disabled:!matches.length,children:[
      action('Select All Fields ('+matches.length+') in Target Structure',()=>{setMarked(matches);if(matches[0])find('target',matches[0]);}),
      ...matches.map(p=>action('/'+p,()=>find('target',p)))
    ]});
  }
  function changeDependencies(visible, targets = null) {
    const view = {visible, targets};
    setDependencyView(view);
    savePanelPreference(dependencyKey, view);
  }
  function dependencies(list) {
    return [action('Show',()=>changeDependencies(true,list)),action('Show All',()=>changeDependencies(true)),
      action('Hide All',()=>changeDependencies(false),{disabled:!dependencyView.visible})];
  }
  async function copyPath(path) {
    try {await writeClipboardText('/'+path);notify('Copied /'+path);}
    catch {open('Copy Path',path);}
  }
  function fieldMenu(e,side,path) {
    const matches=side==='source'?uses('source',path):[path];
    const copy=[action('Copy Path',()=>copyPath(path)),action('Copy Value',null,{disabled:true})];
    const disabled=(map.disabledFields||[]).includes(path);
    const items=side==='source'?[whereUsed(matches),...copy]:[
      action('Duplicate Subtree',()=>edit(m=>duplicateBranch(m,path)),{disabled:!editing}),
      action('Add Variable',()=>open('Add Variable',path),{disabled:!editing||!canAddVariable(rows,path)}),
      action(disabled?'Enable Field':'Disable Field',()=>edit(m=>({...m,disabledFields:disabled?(m.disabledFields||[]).filter(p=>p!==path):[...(m.disabledFields||[]),path]})),{disabled:!editing}),
      ...copy
    ];
    if(side==='target'){
      if(isVariablePath(path)){
        const destinations=variableTargets(rows,path);
        const currentAllowed=destinations.some(([p])=>p===target);
        items.unshift(action('Add variable to expression',currentAllowed?()=>addVariableNode(path,target):null,{
          disabled:!editing||!destinations.length,
          children:currentAllowed?undefined:destinations.map(([p])=>action('/'+p,()=>addVariableNode(path,p)))
        }));
      }else{
        items.unshift(action('Add target to expression',()=>addTarget(path),{disabled:!editing||graphForPath(path)===graphForPath(target)}));
      }
    }
    showMenu(e,'Field actions for '+fieldName(path),[...items,action('Dependencies',null,{children:dependencies(matches)})]);
  }
  function updateNode(id,values) {
    editGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===id?{...n,data:{...n.data,...values}}:n)}));
  }
  function nodeMenu(e,id) {
    const graph=graphForPath(target);
    const node=graph.nodes.find(item=>item.id===id);
    if(!node)return;
    selectNode(node.id);
    const {kind,path,name,context}=node.data;
    const items=[action('Display Queue',()=>openQueue(node.id),{disabled:!canInspectQueue})];
    if(hasParameters(node))items.push(action('Properties',()=>editParameters(node.id)));
    const destinations=editing?connectionActions(graph,node,connect,canConnect):[];
    if(destinations.length)items.push(action('Connect to',null,{children:destinations}));
    items.push(action('Disconnect',()=>{
      editGraph(g=>({...g,edges:g.edges.filter(edge=>edge.source!==node.id&&edge.target!==node.id)}));
    },{disabled:!editing||!graph.edges.some(edge=>edge.source===node.id||edge.target===node.id)}));
    items.push(deleteAction('Delete',()=>{
      editGraph(g=>({...g,nodes:g.nodes.filter(n=>n.id!==node.id),edges:g.edges.filter(edge=>edge.source!==node.id&&edge.target!==node.id)}));
      selectNode(null);
    },{disabled:!editing||kind==='target'}));
    if(kind!=='function')items.push(action('Find Field',()=>find(isVariablePath(path)?'target':kind,path)),action('Copy Path',()=>copyPath(path)));
    if(kind!=='target')items.push(action('Copy',()=>copyNode(node)));
    if(kind==='source'&&!isVariablePath(path)){
      const choices=contexts(path);
      items.push(action('Context',null,{disabled:!editing||!choices.length,children:choices.map(c=>action(c,()=>updateNode(node.id,{context:c}),{checked:c===context}))}),
        action('Return as '+(map.formats?.source||'XML'),()=>updateNode(node.id,{returnDocument:!node.data.returnDocument}),{disabled:!editing,toggle:true,checked:!!node.data.returnDocument}));
    }
    if(kind==='target')items.push(action('Ungroup',()=>ungroup(path),{disabled:!editing||targetsOf(graph).length<2}));
    else items.push(whereUsed(uses(kind,kind==='source'?path:name)));
    showMenu(e,'Node actions for '+name,items,e.target.closest('.react-flow__node'));
  }
  function canvasMenu(e,anchor,actions) {
    showMenu(e,'Canvas actions',[...actions,action('Paste',pasteNode,{disabled:!canPaste})],anchor);
  }
  function autoMap() {
    let next=map, count=0;
    for(const [dst] of rows.filter(([p])=>under(p,target))){
      const sink=targetNode(graphForPath(dst),dst);
      if(mapped(graphForPath(dst),dst))continue;
      const candidates=sourceFields.filter(([p])=>under(p,source)&&fieldName(p)===fieldName(dst));
      if(candidates.length!==1)continue;
      const path=candidates[0][0];
      const n=makeNode('source',fieldName(path),{x:10,y:80},path);
      next=updateGraph(next,dst,g=>({...g,nodes:[...g.nodes,n],edges:[...g.edges,{id:crypto.randomUUID(),source:n.id,target:sink.id}]}));
      count++;
    }
    if(count)edit(()=>next);
    notify(count?count+' fields mapped.':'No unmapped fields with matching names in the selected subtrees.');
  }
  const selectedDependencies=mappedTargets.includes(target)?[target]:[];
  const actions={editing,canInspectQueue,fieldMenu,nodeMenu,canvasMenu,showMenu,openQueue,copyNode,pasteNode,canPaste,editParameters,marked,setMarked,reveal,map,rows,fieldTypes,dependencyView,graphForPath,canConnect};
  const ready=map.source&&map.target;
  function addVariable(e) {
    e.preventDefault();const value=name.trim(), path=dialog.path;
    if(!value||!canAddVariable(rows,path))return;
    const newPath=path+'/$'+value;
    if(graphForPath(newPath))return;
    edit(m=>{const current=targetRows(m);const after=current.findIndex(([p])=>p===path)+1;
      return {...m,targetRows:[...current.slice(0,after),[newPath,'0..1'],...current.slice(after)],graphs:{...m.graphs,[newPath]:emptyGraph(newPath)}};});
    setReveal({side:'target',path:newPath,newVariable:true,serial:++serial.current});
    setDialog(null);
  }
  return <DefinitionContext.Provider value={actions}>
    <section className="definition-editor" data-view={view} aria-label="Mapping definition" onKeyDown={e=>{
      if(e.key==='Escape'&&!e.defaultPrevented&&view!=='split'&&!menu&&!dialog&&!document.querySelector('[role="dialog"]')){
        e.preventDefault();layout.setView('split');
      }
    }}>
    <div className="definition-bar panel" role="toolbar" aria-label="Definition actions">
      <Tool label="Select Message" icon={FolderOpenIcon} disabled={!editing} menu onClick={e=>showMenu(e,'Select Message',['source','target'].map(s=>action(s==='source'?'Source Message':'Target Message',()=>assign(s))))}/>
      <Tool label="Map Selected Fields and Substructures if Names Are Identical" icon={ObjectGroupIcon} disabled={!editing||!ready} onClick={autoMap}/>
      <Tool label="Clear Mapping" icon={TrashIcon} disabled={!editing||!ready} onClick={()=>open('Clear Mapping')}/>
      <span className="tool-divider"/>
      <Tool label="Data Flow Editor" icon={CodeBranchIcon} pressed={isDataFlow} onClick={()=>setDataFlow(true)}/>
      <Tool label="Text Preview" icon={CodeIcon} pressed={!isDataFlow} onClick={()=>setDataFlow(false)}/>
      <span className="tool-divider"/>
      <span className="tool-split"><Tool label="Dependencies" icon={LinkIcon} onClick={()=>changeDependencies(true,selectedDependencies)}/>
      <Tool label="Dependencies options" menu onClick={e=>showMenu(e,'Dependencies',dependencies(selectedDependencies))}/></span>
      {isDataFlow&&<PaneSizeTools upper pane="message trees" label="Message tree layout" view={view} onChange={layout.setView}/>}
    </div>
    <VerticalSplitLayout className="definition-split-layout" label="Resize mapping area" lowerId="definition-mapping-area"
      upper={overview} initialShare={layout.share} onCommit={layout.setShare} view={view}
      toolbar={isDataFlow&&<header className="expression-toolbar" role="toolbar" aria-label="Mapping expression">
        <div className="expression-title"><h2><CodeBranchIcon/> Mapping expression</h2><code title={'/'+target}>/{target}</code></div>
        {queueTools}
        <PaneSizeTools pane="mapping expression" label="Expression layout" view={view} onChange={layout.setView}/>
      </header>}>
    {isDataFlow?children:<section className="panel definition-preview"><h2>Text Preview</h2>
      <div className="preview-lines">{mappedTargets.length?mappedTargets.map(path=><button key={path} onClick={()=>{find('target',path);setDataFlow(true);}}>
        <strong>/{path}</strong> = {expression(graphForPath(path),path)}</button>):'No mapped fields.'}</div>
    </section>}
    </VerticalSplitLayout>
    </section>
    {dialog&&<Dialog title={dialog.type} close={()=>setDialog(null)}>
      {dialog.type==='Clear Mapping'?<><p>Clear the expressions for all target fields in this local mapping?</p><div className="form-actions"><Button variant="danger" icon={<TrashIcon/>} onClick={()=>{
        edit(m=>({...m,graphs:Object.fromEntries(targetRows(m).map(([p])=>[p,emptyGraph(p)]))}));selectNode(null);setDialog(null);
      }}>Clear mapping</Button><Button variant="link" onClick={()=>setDialog(null)}>Cancel</Button></div></>:
      dialog.type==='Copy Path'?<input aria-label="Field path" readOnly autoFocus onFocus={e=>e.target.select()} value={'/'+dialog.path}/>:
      <form onSubmit={addVariable}><p className="muted">/{dialog.path}</p><label className="form-field">Variable name
        <input autoFocus required maxLength={90} pattern="[A-Za-z_][A-Za-z0-9_]*" value={name} onChange={e=>setName(e.target.value)}/></label>
        <div className="form-actions"><Button type="submit" isDisabled={!name.trim() || !!graphForPath(dialog.path+'/$'+name.trim())}>Create</Button>
        <Button variant="link" onClick={()=>setDialog(null)}>Cancel</Button></div></form>}
    </Dialog>}
    <ActionMenu menu={menu} onClose={closeMenu}/>
  </DefinitionContext.Provider>;
}
