import {downloadZippedText} from './download';
import {isContextMenuKey} from './ActionMenu';
import React, { useState } from 'react';
import { useDefinition } from './DefinitionTools';
import { TreeToolbar } from './TreeToolbar';
import { mappingPath,expression,under } from './definitionModel';
import { Button, Switch } from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { AngleDownIcon, AngleRightIcon, ArrowRightIcon, CheckIcon, CubeIcon, SearchIcon } from '@patternfly/react-icons';
import { fieldName, schemaLines, sourceFields, targetFields } from './model';
import { ViewSwitch } from './ViewSwitch';
import { jsonSchemaLines, schemaName } from './formats';
import {FieldTypeIcon} from './FieldTypeIcon';
import {isVariablePath,variableName} from './mappingVariables';

export function SchemaPane({ side, format, mode, onMode, assigned, selected, activePaths, onPick, onAdd, onDirect, onAssign }) {
  const source = side === 'source';
  const title = source ? 'Source' : 'Target';
  const message = source ? 'Orders' : 'Doc';
  const schema = schemaName(side,format);
  const def=useDefinition();
  const fields = source ? sourceFields : def.rows;
  const [filter,setFilter]=useState({active:false,kind:0});
  const [fullPath,setFullPath]=useState(false);
  const [collapseNext,setCollapseNext]=useState(false);
  const [mappingColumn,setMappingColumn]=useState(false);
  const [selectionColumn,setSelectionColumn]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const searchRef=React.useRef(null);
  function toggleSearch() {
    setSearchOpen(!searchOpen);
    if(searchOpen)setSearch('');
    else requestAnimationFrame(()=>searchRef.current?.focus());
  }
  function download() {
    const filename=schema+(format==='JSON'?'.schema.json':'.xsd');
    downloadZippedText('schema.zip',filename,lines.map(line=>line.content).join('\n')+'\n');
  }
  const [closed, setClosed] = useState(new Set());
  const [search, setSearch] = useState('');
  const lines = React.useMemo(() => format==='JSON'?jsonSchemaLines(side):schemaLines(source?sourceFields:targetFields), [source,format,side]);
  const scroll = React.useRef(null);
  const query = search.trim().toLowerCase();
  const accepted=fields.filter(([p])=>{
    if(query && !fieldName(p).toLowerCase().includes(query))return false;
    if(!filter.active)return true;
    if(filter.kind===0)return activePaths.has(p);
    if(filter.kind===1)return !activePaths.has(p);
    if(filter.kind===4)return def.marked.includes(p);
    const chain=mappingPath(def.graphForPath(p),p);
    return chain[0]?.data.kind==='source' && (filter.kind===2 ? chain.length===1 : chain.length>1);
  });
  const filtered=fields.filter(([path])=>
    accepted.some(([p])=>under(p,path)) && (!!query || ![...closed].some(p=>path.startsWith(p+'/')))
  );
  const hasMapping=mode==='Table' && !source && mappingColumn;
  const hasSelection=mode==='Table' && !source && selectionColumn;
  const revealNewVariable=React.useEffectEvent(()=>{
    if(mode==='Text')onMode('Tree');
  });
  React.useEffect(()=>{
    const hint=def.reveal;
    if(hint?.side!==side)return;
    if(hint.newVariable)revealNewVariable();
    setSearch('');setFilter(old=>({...old,active:false}));setClosed(old=>new Set([...old].filter(p=>!under(hint.path,p))));
    const frame=requestAnimationFrame(()=>{
      const row=[...(scroll.current?.querySelectorAll('[data-field-path]')||[])].find(r=>r.dataset.fieldPath===hint.path);
      if(row && scroll.current){const box=scroll.current.getBoundingClientRect(),r=row.getBoundingClientRect();if(r.top<box.top||r.bottom>box.bottom)scroll.current.scrollTop+=r.top-box.top-28;}
    });
    return ()=>cancelAnimationFrame(frame);
  },[def.reveal,side]);
  const hasChildren = path => fields.some(([p]) => p.startsWith(path + '/'));

  React.useEffect(() => {
    if (mode !== 'Text' || !query) return;
    const match = scroll.current?.querySelector('.find-match');
    if (match) scroll.current.scrollTop += match.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top;
  }, [query, mode]);
  function toggle(path) {
    setCollapseNext(false);
    setClosed(old => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }
  function dragActions(path) {
    if (!def.editing) return {};
    const payload = source || isVariablePath(path) ? 'application/x-mapping-field' : 'application/x-mapping-target';
    return {
      draggable: true,
      onDragStart: e => {
        e.dataTransfer.setData(payload, path);
        e.dataTransfer.effectAllowed = 'copy';
      }
    };
  }
  function fieldActions(path) {
    return {
      draggable: def.editing,
      onClick: () => onPick(path),
      onDoubleClick: source && def.editing ? () => onAdd(path) : undefined,
      onContextMenu:e=>def.fieldMenu(e,side,path),
      onKeyDown:e=>{if(isContextMenuKey(e))def.fieldMenu(e,side,path);},
      'aria-pressed': selected === path
    };
  }
  function dropActions(path) {
    if (source || !def.editing) return {};
    return {
      onDragOver: e => {
        if (e.dataTransfer.types.includes('application/x-mapping-field')) e.preventDefault();
      },
      onDrop: e => {
        const src = e.dataTransfer.getData('application/x-mapping-field');
        if (sourceFields.some(([p]) => p === src)||isVariablePath(src)) {
          e.preventDefault();
          onDirect(src, path);
        }
      }
    };
  }

  return <section id={side+'-message-pane'} className={'schema panel ' + side} aria-label={side + ' message'}>
    <header className="pane-head">
      <div className={'role-tile ' + side}><CubeIcon/></div>
      <div><div className="eyeline">{title} message</div><h2>{assigned ? message : 'Unassigned'}</h2></div>
      {assigned && <div className="schema-format"><code className="schema-id">{schema}</code><button disabled={!def.editing} aria-label={'Change '+side+' message'} title={'Choose '+side+' message format'} onClick={onAssign}>{format}<AngleDownIcon/></button></div>}
    </header>
    {assigned ? <>
      <div className="schema-tools">
        <ViewSwitch modes={['Tree','Table','Text']} label={title + ' message view'} value={mode} onChange={onMode}/>
        <TreeToolbar side={side} mode={mode} fullPath={fullPath} onPath={()=>setFullPath(v=>!v)}
          collapseNext={collapseNext} expand={()=>{setClosed(collapseNext?new Set(fields.filter(([p])=>hasChildren(p)).map(([p])=>p)):new Set());setCollapseNext(v=>!v);}} filter={filter} chooseFilter={kind=>{setFilter({active:true,kind});setClosed(new Set());}}
          onToggleFilter={()=>{setFilter(v=>({...v,active:!v.active}));setClosed(new Set());}}
          searchOpen={searchOpen} onSearch={toggleSearch} onDownload={download} mappingColumn={mappingColumn}
          onMapping={()=>{setMappingColumn(v=>!v);onMode('Table');}} selectionColumn={selectionColumn}
          onSelection={v=>{setSelectionColumn(v);onMode('Table');}} visiblePaths={filtered.map(([p])=>p)}/>
      </div>
      {searchOpen&&<label className="field-search tree-search"><SearchIcon/><input ref={searchRef} aria-label={'Filter '+side+' fields'}
        placeholder={mode!=='Text'?'Find a field':format==='JSON'?'Find in JSON Schema':'Find in XSD'} value={search}
        onKeyDown={e=>{if(e.key==='Escape')toggleSearch();if(e.key==='Enter'&&accepted[0])onPick(accepted[0][0]);}}
        onChange={e=>setSearch(e.target.value)}/></label>}
      <div className="fields-scroll" ref={scroll} key={mode}>
        {mode==='Text'?
          <div className="schema-xml" aria-label={title + (format === 'JSON' ? ' JSON Schema' : ' XSD source')}>{lines.map(({content, path}, i) =>
              <div key={i} className={'xml-line' + (path === selected ? ' active-field' : '') +
                (query && content.toLowerCase().includes(query) ? ' find-match' : '')} data-field-path={path} {...(path ? dragActions(path) : {})} {...(path ? dropActions(path) : {})}>
                {path ? <button {...fieldActions(path)} title={'/' + path}>{content}</button> : content}
              </div>)}</div>
        :
          <Table variant="compact" gridBreakPoint="" aria-label={side + ' fields'} className="field-table">
            <Thead><Tr><Th>Structure</Th>{hasSelection&&<Th>Selection</Th>}{hasMapping&&<Th>Mapping</Th>}{mode==='Table'&&<><Th>Occurrences</Th><Th className="field-type-column">Type</Th><Th className="description-column">Description</Th></>}</Tr></Thead>
            <Tbody>{filtered.map(([path, occurs]) => {
              const branch = hasChildren(path);
              const type = def.fieldTypes[side].get(path);
              const variable = type==='variable';
              const typeLabel = variable?'':format==='XML' && type!=='structure' ? 'xsd:'+type : type;
              return <Tr key={path} data-field-path={path} onContextMenu={e=>def.fieldMenu(e,side,path)} className={(selected === path ? 'active-field ' : '')+(!source&&def.map.disabledFields?.some(p=>under(path,p))?'disabled-field':'')} {...dragActions(path)} {...dropActions(path)}>
                <Td><div className="field-cell" style={{'--level':path.split('/').length - 1}}>
                  {branch ? <button className="caret" aria-label={(closed.has(path) ? 'Expand ' : 'Collapse ') + path}
                    aria-expanded={query ? true : !closed.has(path)} onClick={() => toggle(path)}>
                    {closed.has(path) && !query ? <AngleRightIcon/> : <AngleDownIcon/>}</button> : <span className="caret-spacer"/>}
                  <button className={'field-name ' + (branch ? 'branch' : '')} {...fieldActions(path)}
                    aria-label={variable?'Variable '+variableName(path):undefined}
                    aria-description={variable&&def.editing?'Open the variable to define its value. Drag its row into another target expression to use that value.':undefined}
                    title={path + ' · ' + (variable?'Variable':typeLabel) + ' · ' + occurs}>
                    <FieldTypeIcon type={type}/>{variable?variableName(path):fieldName(path)}
                  </button>
                  {activePaths.has(path) && <span className="wired-mark" title="Connected" aria-label="Connected"><CheckIcon/></span>}
                </div></Td>
                {hasSelection&&<Td><Switch aria-label={'Select /'+path} isChecked={def.marked.includes(path)}
                  onChange={(_,checked)=>def.setMarked(current=>checked?[...current,path]:current.filter(p=>p!==path))}/></Td>}
                {hasMapping&&<Td><code className="mapping-code">{expression(def.graphForPath(path),path)||'No mapping for /'+path}</code></Td>}
                {mode==='Table'&&<><Td className="occurs">{occurs.replace('∞','unbounded')}</Td><Td className="field-type-column">{type==='structure'?'':typeLabel}</Td><Td className="description-column"/></>}
              </Tr>;
            })}</Tbody>
          </Table>}
        {mode!=='Text' && filtered.length === 0 && <p className="empty-message">No matching fields.</p>}
      </div>
      {fullPath && mode!=='Text' && <div className="path-display"><code>/{selected}</code></div>}
    </> : <div className="empty-message"><Button variant="secondary" size="sm" isDisabled={!def.editing} onClick={onAssign}>Choose {side} message <ArrowRightIcon/></Button></div>}
  </section>;
}
