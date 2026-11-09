import { useEffect, useMemo, useRef, useState } from 'react';
import { Background, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { CopyIcon, CubeIcon, LayerGroupIcon, ListIcon, PasteIcon, TrashIcon } from '@patternfly/react-icons';
import { useDefinition } from './DefinitionTools';
import { SideBySide } from './SplitLayout';
import { action, deleteAction, isContextMenuKey } from './ActionMenu';
import { sourceFields } from './model';
import {inspectExpression,layoutExpression} from './expressionGraph';

import {FunctionCatalogue, functionDragType} from './FunctionCatalogue';
import {MappingNode,nodeRole} from './MappingNode';
import {MappingHint} from './MappingHint';
import {isVariablePath} from './mappingVariables';
import {hasParameters} from './standardFunctions';
import './functionCatalogue.css';

const types={mapping:MappingNode};
const fixedView={minZoom:1,maxZoom:1,padding:0};
function ViewFit({nodeIds,host}) {
  const rf=useReactFlow(),initialized=useNodesInitialized(),lastIds=useRef(null);
  useEffect(()=>{
    if(!initialized || !host.current)return;
    const ids=JSON.parse(nodeIds),before=lastIds.current;
    lastIds.current=ids;
    if(!before){rf.fitView(fixedView);return;}
    const added=ids.findLast(id=>!before.includes(id));
    if(!added)return;
    const bounds=rf.getNodesBounds([added]),rect=host.current.getBoundingClientRect();
    const pos=rf.flowToScreenPosition({x:bounds.x,y:bounds.y});
    if(pos.x<rect.left || pos.x+bounds.width>rect.right || pos.y<rect.top || pos.y+bounds.height>rect.bottom)
      rf.setCenter(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{zoom:1});
  },[initialized,nodeIds,host,rf]);
  useEffect(()=>{
    if(!host.current)return;
    let previous;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      if(width && height && previous){
        const view=rf.getViewport();
        rf.setViewport({x:view.x+(width-previous.width)/2,y:view.y+(height-previous.height)/2,zoom:1});
      }
      previous=width&&height?{width,height}:null;
    });
    observer.observe(host.current);
    return ()=>observer.disconnect();
  },[host,rf]);
  return null;
}
function Drawing({graph, customFunctions, previewFunction, paletteOpen, togglePalette, addFunction, selected, changeNodes, changeEdges, connect, select, onAdd, addField, addTarget, assigned}) {
  const host=useRef(null),edgeDrag=useRef(null),inputDrag=useRef(null);
  const flow=useReactFlow();
  const {editing,canInspectQueue,nodeMenu,canvasMenu,showMenu,openQueue,copyNode,pasteNode,canPaste,editParameters,canConnect}=useDefinition();
  const selectedNode=assigned && graph.nodes.find(n=>n.id===selected);
  const {states,floating}=useMemo(()=>inspectExpression(graph),[graph]);
  const [measurements,setMeasurements]=useState({});
  function onCanvasKey(event) {
    if(!isContextMenuKey(event))return;
    const element=event.target.closest('.react-flow__node');
    if(element){nodeMenu(event,element.dataset.id);return;}
    const edge=graph.edges.find(e=>e.id===event.target.closest('.react-flow__edge')?.dataset.id);
    if(edge){openEdgeMenu(event,edge);return;}
    if(assigned && event.target===host.current)openCanvasMenu(event);
  }
  function layOut() {
    const {positions,center}=layoutExpression(graph);
    const moves=graph.nodes.flatMap(n=>{
      const position=positions.get(n.id);
      return position.x===n.position.x && position.y===n.position.y?[]:[{id:n.id,type:'position',position}];
    });
    if(moves.length)changeNodes(moves);
    flow.setCenter(center.x,center.y,{zoom:1});
  }
  function deleteFloatingObjects() {
    if(floating.includes(selected))select(null);
    changeNodes(floating.map(id=>({id,type:'remove'})));
  }
  function openCanvasMenu(event) {
    canvasMenu(event,host.current,[
      deleteAction('Delete Floating Objects',deleteFloatingObjects,{disabled:!editing||!floating.length}),
      action('Lay Out Mapping',layOut,{disabled:!editing||!graph.nodes.length})
    ]);
  }
  function openEdgeMenu(event,edge) {
    showMenu(event,'Connection actions',[action('Disconnect',()=>changeEdges([{type:'remove',id:edge.id}]),{disabled:!editing})],
      event.target.closest('.react-flow__edge'));
  }
  function startPortDrag(_,port) {
    if(edgeDrag.current || port.handleType!=='target')return;
    inputDrag.current=graph.edges.find(e=>e.target===port.nodeId&&(e.targetHandle||'in0')===port.handleId);
  }
  function endPortDrag(_,state) {
    const edge=inputDrag.current,to=state.toHandle;
    inputDrag.current=null;
    // Native React Flow connects opposite port types. Dragging an occupied input
    // onto another input instead moves just the destination of the existing wire.
    if(edge && to?.type==='target' && (edge.target!==to.nodeId||(edge.targetHandle||'in0')!==to.id))
      connect({...edge,target:to.nodeId,targetHandle:to.id},edge.id);
  }
  const nodes=graph.nodes.map(n=>({...n,data:{...n.data,state:states.get(n.id),definition:n.data.functionId?customFunctions.find(f=>f.id===n.data.functionId):undefined},measured:measurements[n.id],sourcePosition:Position.Right,targetPosition:Position.Left,selected:n.id===selected,ariaLabel:nodeRole(n.data)+' '+n.data.name+'. '+states.get(n.id).description}));
  function onNodesChange(changes) {
    const sizes=changes.filter(c=>c.type==='dimensions' && c.dimensions);
    if(sizes.length) setMeasurements(previous=>{
      const changed=sizes.filter(c=>previous[c.id]?.width!==c.dimensions.width || previous[c.id]?.height!==c.dimensions.height);
      return changed.length ? {...previous,...Object.fromEntries(changed.map(c=>[c.id,c.dimensions]))} : previous;
    });
    changeNodes(changes);
  }
  const edges=graph.edges.map(e=>({...e,sourceHandle:e.sourceHandle || 'out',targetHandle:e.targetHandle || 'in0',type:'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,width:13,height:13,color:'#567187'},style:{stroke:e.selected?'#0066cc':'#567187',strokeWidth:e.selected?3:2}}));
  function drop(event) {
    event.preventDefault();
    if(!assigned||!editing)return;
    const position=flow.screenToFlowPosition({x:event.clientX,y:event.clientY});
    const key=event.dataTransfer.getData(functionDragType);
    if(key){addFunction(key,position);return;}
    const targetPath=event.dataTransfer.getData('application/x-mapping-target');
    if(targetPath){addTarget(targetPath,position);return;}
    const path=event.dataTransfer.getData('application/x-mapping-field');
    if(sourceFields.some(([field])=>field===path)||isVariablePath(path))addField(path,position);
  }
  return <section className="canvas-panel panel" aria-label="Field mapping canvas">
    <SideBySide className="expression-workspace" label="Resize functions panel" leftId="mapping-functions"
      widthKey="definition.functions.width" initialShare={0.1} showDivider={paletteOpen}>
      <aside id="mapping-functions" className="mapping-functions" hidden={!paletteOpen}>
        <h3>Functions</h3><FunctionCatalogue customFunctions={customFunctions} disabled={!editing||!assigned} add={addFunction} edit={previewFunction}/>
      </aside>
      <div className="expression-drawing">
      <div className="function-rail" role="toolbar" aria-label="Mapping tools" aria-orientation="vertical">
        <button type="button" aria-label={paletteOpen?'Hide functions':'Show functions'} title={paletteOpen?'Hide functions':'Show functions'}
          aria-controls="mapping-functions" aria-expanded={paletteOpen} onClick={togglePalette}><LayerGroupIcon/></button>
        <button type="button" disabled={!editing||!assigned} aria-label="Add node" title="Add node" onClick={onAdd}><CubeIcon/></button>
        <button type="button" disabled={!selectedNode||!canInspectQueue} aria-label="Display Queue" title="Display Queue"
          onClick={()=>openQueue(selectedNode.id)}><ListIcon/></button>
        <button type="button" disabled={!editing||!assigned||!floating.length} aria-label="Delete Floating Objects" title="Delete Floating Objects: remove all objects with no path to the target"
          onClick={deleteFloatingObjects}><TrashIcon/></button>
        <button type="button" aria-label="Layout mapping" title="Lay Out Mapping" disabled={!editing||!assigned||!nodes.length} onClick={layOut}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M8 5h3v14H8m3-7h5"/><g fill="currentColor" stroke="none"><rect x="1" y="2" width="7" height="6" rx="1.2"/><rect x="1" y="16" width="7" height="6" rx="1.2"/><rect x="16" y="9" width="7" height="6" rx="1.2"/></g>
          </svg>
        </button>
        <button type="button" disabled={!selectedNode||selectedNode.data.kind==='target'} aria-label="Copy" title="Copy"
          onClick={()=>copyNode(selectedNode)}><CopyIcon/></button>
        <button type="button" disabled={!assigned||!canPaste} aria-label="Paste" title="Paste"
          onClick={()=>pasteNode()}><PasteIcon/></button>
      </div>
    <div className="flow-host" ref={host} role="group" aria-label="Mapping canvas" tabIndex={assigned?0:-1} onKeyDown={onCanvasKey} onDragOver={e=>e.preventDefault()} onDrop={drop}>
    {assigned?<ReactFlow nodes={nodes} edges={edges} nodeTypes={types} onNodesChange={onNodesChange} onEdgesChange={changeEdges} onConnect={c=>connect(c,inputDrag.current?.id)}
      onConnectStart={startPortDrag} onConnectEnd={endPortDrag}
      nodesDraggable={editing} nodesConnectable={editing} edgesReconnectable={editing} reconnectRadius={10} connectionRadius={15}
      onReconnectStart={(_,edge)=>{edgeDrag.current=edge.id;}} onReconnectEnd={()=>{edgeDrag.current=null;}}
      onReconnect={(edge,c)=>connect(c,edge.id)} onEdgeContextMenu={openEdgeMenu}
      isValidConnection={c=>canConnect(c,edgeDrag.current||inputDrag.current?.id)} onNodeClick={(_,n)=>select(n.id)} onNodeContextMenu={(event,node)=>nodeMenu(event,node.id)}
      onNodeDoubleClick={(_,node)=>{if(hasParameters(node))editParameters(node.id);}}
      onPaneContextMenu={openCanvasMenu}
      minZoom={1} maxZoom={1} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} zoomActivationKeyCode={null} panOnScroll
      onlyRenderVisibleElements={false} nodesFocusable edgesFocusable deleteKeyCode={editing?['Delete','Backspace']:null} proOptions={{hideAttribution:true}}>
      <Background gap={18} size={1} color="#bfd0d9"/>
      <ViewFit nodeIds={JSON.stringify(nodes.map(n=>n.id))} host={host}/>
    </ReactFlow>:<p className="graph-empty">Choose the source and target messages to start mapping.</p>}
    <MappingHint host={host}/>
    </div>
    </div>
    </SideBySide>
    <footer className="canvas-footer"><span>{assigned?nodes.length:0} nodes <i>·</i> {assigned?edges.length:0} connections</span>
      {assigned&&<span className="mapping-legend" aria-label="Mapping status key">
        <span>✓ Complete</span><span>! Incomplete</span><span>– No target path</span>
      </span>}
    </footer>
  </section>;
}
export function Canvas(props){return <ReactFlowProvider><Drawing {...props}/></ReactFlowProvider>}
