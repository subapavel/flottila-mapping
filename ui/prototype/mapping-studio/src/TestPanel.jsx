import {useMemo,useState} from 'react';
import {Button,Toolbar,ToolbarContent,ToolbarItem} from '@patternfly/react-core';
import {PlayIcon} from '@patternfly/react-icons';
import {InstanceTools} from './InstanceTools';
import {ActionMenu,deleteAction,isContextMenuKey,menuAnchor} from './ActionMenu';
import {Dialog} from './Panels';
import {CopySurface} from './CopyTextButton';
import {example,formatOf} from './formats';
import {TestDocument} from './TestDocument';
import {connectedSourcePaths} from './groupedExpressions';
import {SideBySide,useSplitLayout,VerticalSplitLayout} from './SplitLayout';
import {PaneSizeTools} from './ToolbarTools';
import {fixtureSide,messages,parameters} from './signatureModel';
import {parsePayload,traceLevels,traceLines} from './testData';

function stamp(){return new Date().toLocaleTimeString('cs-CZ',{hour12:false});}
function LogBody({lines}) {
  return <ol className="processing-lines">{lines.map((line,i)=><li key={i} className={line.detail?'trace-detail':''}>
    {line.time&&<time>{line.time}</time>}{line.message}</li>)}</ol>;
}
export function TestPanel({editing,simulation,instances,map,views,setView}) {
  const {input,result,state,editInput,updateState:update,storeResult,invalidateResult,storageError}=simulation;
  const src=formatOf(map,'source'),dst=formatOf(map,'target');
  const [dialog,setDialog]=useState('');
  const [logMenu,setLogMenu]=useState(null);
  const [pending,setPending]=useState(false);
  const layout = useSplitLayout('test.layout', state.logShare ?? 0.25);
  const trace=state.trace||'Warning',values=state.values||{};
  const logText=(result?.lines||[]).map(line=>
    (line.detail?'  ':'')+(line.time?line.time+' ':'')+line.message
  ).join('\n');
  const used=useMemo(()=>Array.from(connectedSourcePaths(map.graphs)),[map.graphs]);
  const params=parameters(map).filter(p=>p.name.trim());
  const inputFixture=fixtureSide(map,'source'),outputFixture=fixtureSide(map,'target');
  const ready=map.source&&map.target&&inputFixture&&outputFixture;
  const summary=side=>messages(map,side).map(r=>(r.name||'Unassigned')+' ('+r.format+', '+r.occurrence+')').join(' · ');
  function changeValue(id,value) {update(old=>({...old,values:{...old.values,[id]:value}}));invalidateResult();}
  function setSessionField(which,value){update(old=>({...old,[which]:value}));}
  function showLogMenu(e) {
    setLogMenu({key:'log',label:'Processing log actions',anchor:menuAnchor(e),items:[
      deleteAction('Clear Messages',()=>storeResult({...result,lines:null}),{disabled:!editing||!result?.lines?.length})
    ]});
  }
  function run() {
    if(!editing||pending||!ready)return;
    const start=stamp(),output=example(dst,'target');
    try{parsePayload(input,src);}
    catch{const error=src==='XML'?'Enter well-formed XML before running the simulation.':'Enter valid JSON before running the simulation.';
      storeResult({ok:false,level:trace,lines:[{time:start,message:'Start of test'},{message:error},{time:stamp(),message:'End of test'}]});return;}
    const detail=['Debug','All'].includes(trace)?traceLines(output,dst).map(message=>({message,detail:true})):[];
    const lines=[{time:start,message:'Start of test'},...detail,{message:'Loaded simulated '+dst+' result.'},{message:'Executed successfully'},{time:stamp(),message:'End of test'}];
    storeResult({ok:true,level:trace,output,lines});
  }
  return <section className="mapping-test" aria-label="Test" onKeyDown={event=>{
    if(event.key==='Escape' && !event.defaultPrevented && layout.view!=='split' &&
      !logMenu && !dialog && !document.querySelector('[role="dialog"]')){
      event.preventDefault();
      layout.setView('split');
    }
  }}>
    <div role="toolbar" aria-label="Test instance actions" className="test-instance-bar panel">
      <InstanceTools instances={instances} format={src} resource={{text:input,values}} onEdit={simulation.loadInput}
        onReading={setPending} busy={pending} disabled={!editing||!map.source||!inputFixture}/>
      <PaneSizeTools upper pane="input and result" label="Input and result layout" view={layout.view} onChange={layout.setView}/>
    </div>
    {storageError&&<p className="test-notice" role="alert">{storageError}</p>}
    <VerticalSplitLayout className="test-split-layout" label="Resize processing log" lowerId="processing-log"
      initialShare={layout.share} onCommit={layout.setShare} view={layout.view} upper={
      <SideBySide label="Resize input and result panels" leftId="test-input-pane"
        widthKey={`test.${map.id}.${src}.width`}>
      <TestDocument side="Input" format={src} text={input} mode={views.input} setMode={v=>setView('input',v)} edit={editInput} readOnly={!editing} disabled={pending}
        signatureSummary={!inputFixture&&summary('source')} parameters={params.filter(p=>p.parameter==='Import')} values={values} changeParameter={changeValue}
        used={used} section={views.inputSection} setSection={v=>setView('inputSection',v)}/>
      <TestDocument side="Output" format={dst} text={result?.ok?result.output:null} failed={result?.ok===false} mode={views.result} setMode={v=>setView('result',v)}
        signatureSummary={!outputFixture&&summary('target')} parameters={params.filter(p=>p.parameter==='Export')} values={values} used={used}
        section={views.resultSection} setSection={v=>setView('resultSection',v)}/>
    </SideBySide>} toolbar={
    <Toolbar role="toolbar" aria-label="Simulation controls" className="simulation-toolbar" inset={{default:'insetSm'}}>
      <ToolbarContent>
        <ToolbarItem>
          <Button size="sm" icon={<PlayIcon/>} isDisabled={!editing||pending||!ready} title="Start the Transformation" onClick={run}>
            Run simulation
          </Button>
        </ToolbarItem>
        <ToolbarItem variant="separator"/>
        <ToolbarItem>
          <label className="trace-level">Trace Level
            <select aria-label="Trace Level" value={trace} disabled={!editing||pending} onChange={e=>setSessionField('trace',e.target.value)}>
              {traceLevels.map(level=><option key={level}>{level}</option>)}
            </select>
          </label>
        </ToolbarItem>
        <ToolbarItem align={{default:'alignEnd'}}>
          <PaneSizeTools pane="processing log" label="Processing log layout" view={layout.view} onChange={layout.setView}/>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>}>
    <section className="panel test-log" aria-labelledby="processing-log-heading" tabIndex={0}
      onContextMenu={showLogMenu} onKeyDown={e=>{if(isContextMenuKey(e))showLogMenu(e);}}>
      <header>
        <h3 id="processing-log-heading">Processing log</h3>
        {result?.lines&&<><small>Last run · {result.level}</small>
          <Button size="sm" variant="link" onClick={()=>setDialog('log')}>Expand log</Button></>}
      </header>
      <CopySurface className="log-content" label="processing log" text={logText}>
        {result?.lines?<LogBody lines={result.lines}/>:<p role="status">{pending?'Loading test input…':'Ready.'}</p>}
      </CopySurface>
    </section>
    </VerticalSplitLayout>
    <ActionMenu menu={logMenu} onClose={focus=>{if(focus)logMenu?.anchor.element?.focus();setLogMenu(null);}}/>
    {dialog==='log'&&result?.lines&&<Dialog title="Processing Log" close={()=>setDialog('')} description={'Simulation · '+result.level}
      footer={<Button onClick={()=>setDialog('')}>Close</Button>}>
      <CopySurface className="log-content" label="processing log" text={logText}><LogBody lines={result.lines}/></CopySurface>
    </Dialog>}
  </section>;
}
