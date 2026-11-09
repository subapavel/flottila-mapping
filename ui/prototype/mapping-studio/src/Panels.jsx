import { useMemo,useState } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, Switch } from '@patternfly/react-core';
import { Table, Thead, Th, Tbody, Tr, Td } from '@patternfly/react-table';
import { PlusIcon } from '@patternfly/react-icons';
import { fieldName, sourceFields } from './model';

import {FunctionCatalogue} from './FunctionCatalogue';
import {FieldTypeIcon} from './FieldTypeIcon';
import {schemaFieldTypes} from './formats';
import {previewQueue} from './queuePreview';
import {variableName} from './mappingVariables';

export function Dialog({title,description,close,children,footer,wide=false,elementToFocus}) {
  return <Modal isOpen onClose={close} elementToFocus={elementToFocus} variant={wide?'medium':'small'} aria-label={title}>
    <ModalHeader title={title} description={description}/><ModalBody>{children}</ModalBody>
    {footer&&<ModalFooter>{footer}</ModalFooter>}</Modal>;
}
export function Palette({add,close,customFunctions=[],sourceFormat,variables=[]}) {
  const [kind,setKind]=useState('function');
  const fieldTypes=useMemo(()=>schemaFieldTypes(sourceFields,sourceFormat),[sourceFormat]);
  return <Dialog title="Add node" close={close} description="Add a node to the selected target field’s graph.">
    <div className="switches palette-switch"><button aria-pressed={kind==='function'} onClick={()=>setKind('function')}>Functions</button><button aria-pressed={kind==='source'} onClick={()=>setKind('source')}>Source fields</button>
      <button aria-pressed={kind==='variable'} onClick={()=>setKind('variable')}>Variables</button></div>
    {kind==='function'?<FunctionCatalogue customFunctions={customFunctions} add={key=>add('function',key)}/>:
      <div className="palette-items">{kind==='variable' && !variables.length && <p className="empty-message">No variables are available for this target. Choose Add Variable on a parent in the target tree, or open a target that follows an existing variable in the same branch.</p>}
        {(kind==='variable'?variables:sourceFields).map(([path])=><button key={path} onClick={()=>add('source',path)}>
        <span className="node-symbol source"><FieldTypeIcon type={kind==='variable'?'variable':fieldTypes.get(path)}/></span><span><b>{kind==='variable'?variableName(path):fieldName(path)}</b><small>/{path}</small></span><PlusIcon/></button>)}</div>}
  </Dialog>;
}
export function Queue({close,numbers,onNumbersChange,graph,nodeId,input,format,graphForPath}) {
  const {name,columns,note}=useMemo(()=>previewQueue(graph,nodeId,input,format,graphForPath),[graph,nodeId,input,format,graphForPath]);
  const count=Math.max(0,...columns.map(c=>c.cells.length));
  return <Dialog title="Display Queue" close={close} wide description={'Simulated queue · '+input.name+' · '+format}>
    <div className="queue-bar">
      <strong><i>ƒ</i> {name}</strong>
      <Switch label="Row numbers" isChecked={numbers} onChange={(_, checked) => onNumbersChange(checked)}/>
    </div>
    {columns.length>0&&<div className="queue-scroll"><Table aria-label={name+' queue'} variant="compact" gridBreakPoint="" className="queue-table">
      <Thead><Tr>{numbers&&<Th>#</Th>}{columns.map((c,i)=><Th key={i}>{c.label}</Th>)}</Tr></Thead>
      <Tbody>{Array.from({length:Math.min(500,Math.max(1,count))},(_,i)=><Tr key={i}>{numbers&&<Td>{i}</Td>}{columns.map((c,j)=>{
        const [value,kind]=c.cells[i]||[!c.known&&i===0?'Unavailable':'','blank'];
        return <Td key={j} className={'q-'+kind}><code>{value}</code>{(kind==='boundary'||kind==='end')&&<small>{kind==='end'?'End':'Boundary'}</small>}</Td>;
      })}</Tr>)}</Tbody></Table></div>}
    {note&&<p className="queue-note">{note}</p>}
    {count>500&&<p className="queue-note">Showing the first 500 of {count} rows.</p>}
  </Dialog>;
}
