import {useEffect,useRef} from 'react';
import {Handle,Position,useUpdateNodeInternals} from '@xyflow/react';
import {CogIcon} from '@patternfly/react-icons';
import {useDefinition} from './DefinitionTools';
import {contexts,inputPorts,outputPorts} from './model';
import {nodeHeight,nodeWidth} from './expressionGraph';
import {hasParameters,parameterPreview,standardPortHelp} from './standardFunctions';
import {FieldTypeIcon} from './FieldTypeIcon';
import {isVariablePath,variableName} from './mappingVariables';

const nodeKinds={source:'Source field',function:'Node function',target:'Target field'};
export const nodeRole=data=>isVariablePath(data.path)?'Mapping variable':nodeKinds[data.kind];

function portHint(data,port,input,index) {
  const direction=input?'Input':'Output';
  if(data.kind!=='function')return [direction,data.path];
  const fn=data.definition;
  if(fn){
    const arg=input && fn.variables.find(v=>v.id===port.id);
    const label=input ? (arg?`Input ${index+1}: ${arg.name} (${arg.javaType}${fn.execution==='Single Values'?'':'[]'})`:`Input ${index+1}: ${port.label}`) :
      'Output: '+(fn.execution==='Single Values'?'String':'ResultList');
    return [label,arg?.title,arg?.description||fn.description].filter(Boolean);
  }
  return [`${direction} ${index+1}: ${port.label}`,standardPortHelp(data,port,input,index)||data.name];
}

function Port({port,index,count,input=false,data}) {
  const hint=portHint(data,port,input,index);
  const missing=input && data.state.missing.includes(port.id);
  if(missing)hint.push('Missing connection');
  return <Handle id={port.id} type={input?'target':'source'} position={input?Position.Left:Position.Right}
    tabIndex={0} role="group" aria-label={hint.join(' · ')} className={missing?'missing-input':undefined}
    data-mapping-hint={[...hint,data.state.description].join('\n')}
    style={{top:`calc(var(--node-height) * ${(index+.5)/count} - 1px)`}}/>;
}

export function MappingNode({id,data,selected}){
  const refresh=useUpdateNodeInternals(),{editParameters,fieldTypes}=useDefinition();
  const inputs=inputPorts({data}),outputs=outputPorts({data});
  const ports=JSON.stringify([inputs.map(p=>p.id),outputs.map(p=>p.id)]);
  const previousPorts=useRef(ports);
  useEffect(()=>{
    // React Flow measures a new node on mount. Only rescan when its ports change.
    if(previousPorts.current!==ports)refresh(id);
    previousPorts.current=ports;
  },[id,ports,refresh]);
  const variable=isVariablePath(data.path);
  const label=variable?variableName(data.path):data.title||data.name, configurable=hasParameters({data});
  const isFunction=data.kind==='function', isSource=data.kind==='source'&&!variable;
  const path=data.path ? '/'+data.path : '';
  const type=variable?'variable':fieldTypes[data.kind]?.get(data.path);
  const defaultContext=isSource ? contexts(data.path||'')[0] || '' : '';
  const context=data.context ?? defaultContext;
  const changedContext=isSource && context!==defaultContext;
  const contextLabel=isSource ? 'Context · '+(context||'root') : '';
  const settings=isFunction ? parameterPreview(data) : '';
  const description=variable?(data.kind==='target'?'Defines the value of this mapping variable.':'Reads the value of this mapping variable.'):
    isFunction?(data.definition?.description || (outputs[0] && standardPortHelp(data,outputs[0],false,0)) || data.category):data.description;
  const openInputs=data.kind==='function'?inputs.filter(p=>data.state.missing.includes(p.id)):[];
  const portNote=openInputs.length?'Missing: '+openInputs.map(p=>p.label).join(', '):'';
  const details=[label,nodeRole(data)+(type&&!variable?' · '+type:''),path,contextLabel,description,settings,data.state.description].filter(Boolean).join('\n');
  const caption=<div className="node-caption">
    <strong className={changedContext?'changed-context':undefined}>{label}</strong>
    {portNote ? <div className="node-meta port-note">{portNote}</div> : <>
      {changedContext && <div className="node-meta">{contextLabel}</div>}
      {settings && <div className="node-meta">{settings}</div>}
    </>}
  </div>;
  return <div className={'map-node '+data.kind+(selected?' is-selected':'')} data-state={data.state.kind} data-mapping-hint={details}
    style={{'--node-height':nodeHeight({data})+'px',height:'var(--node-height)',width:nodeWidth}}>
    {inputs.map((port,i)=><Port key={port.id} port={port} index={i} count={inputs.length} input data={data}/>)}
    <div className="node-content">
    <span className={'node-symbol '+data.kind}>{isFunction?'ƒ':<FieldTypeIcon type={type} showTitle={false}/>}
      <span className="mapping-state-mark" aria-hidden="true">{{complete:'✓',incomplete:'!',detached:'–'}[data.state.kind]}</span>
    </span>
    {caption}
    {configurable && <button type="button" className="node-settings nodrag nopan" aria-label={'Parameters for '+data.name} data-mapping-hint={'Function parameters\n'+details}
      onDoubleClick={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();editParameters(id);}}><CogIcon/></button>}
    </div>
    {outputs.map((port,i)=><Port key={port.id} port={port} index={i} count={outputs.length} data={data}/>)}
  </div>;
}
