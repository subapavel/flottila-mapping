import {useState} from 'react';
import {AngleRightIcon, CogIcon, PencilAltIcon, SearchIcon} from '@patternfly/react-icons';
import {groups, standardFunctions} from './standardFunctions';

const overloads = new Set(['indexOf', 'lastIndexOf', 'startsWith']);
export const functionDragType = 'application/x-mapping-function';

export function FunctionCatalogue({customFunctions, add, edit, disabled=false}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});
  const [collapsedResults, setCollapsedResults] = useState({});
  const filter = query.trim().toLowerCase();
  const customGroups = new Map();
  for(const fn of customFunctions) {
    const group=fn.category || 'User-Defined';
    if(!customGroups.has(group))customGroups.set(group,[]);
    customGroups.get(group).push(fn);
  }
  const entries = [
    ...groups.map(group => ({group, functions:standardFunctions.filter(fn => fn.group === group)})),
    ...Array.from(customGroups, ([group, functions]) => ({group, functions, custom:true}))
  ];
  let matches = 0;
  return <div className="function-catalogue" aria-label="Function catalogue" role="region">
    <label className="catalogue-search"><SearchIcon/><input type="search" aria-label="Search functions" placeholder="Search functions" value={query}
      onChange={e=>{setQuery(e.target.value);setCollapsedResults({});}}/></label>
    <div className="catalogue-groups">{entries.map(({group,functions,custom})=>{
      const entries = functions.filter(fn => [group,fn.title,fn.name].some(value => value?.toLowerCase().includes(filter)));
      if (!entries.length) return null;
      matches += entries.length;
      const id = (custom?'custom:':'standard:')+group;
      const open = filter ? !collapsedResults[id] : Boolean(expanded[id]);
      return <div key={id} className="catalogue-group"><button type="button" className="catalogue-group-toggle" aria-expanded={open}
        onClick={()=>{if(filter)setCollapsedResults(old=>({...old,[id]:open}));else setExpanded(old=>({...old,[id]:!open}));}}>
        <AngleRightIcon/><span>{group}</span><small>{entries.length}</small></button>
        {open && <ul>{entries.map(fn=>{
          const key = custom ? fn.id : fn.key;
          const name = fn.title || fn.name;
          return <li key={key}><button type="button" disabled={disabled} draggable={!disabled} className="catalogue-function"
            onDragStart={event=>{event.dataTransfer.setData(functionDragType,key);event.dataTransfer.effectAllowed='copy';}} onClick={()=>add(key)}>
            <i aria-hidden="true">ƒ</i><span>{name}</span>
            {!custom && overloads.has(name) && <small>{fn.inputs.length} inputs</small>}
            {!!fn.parameters?.length && <CogIcon aria-label="Configurable"/>}
          </button>{custom && edit && <button type="button" className="catalogue-edit" aria-label={'Edit function '+name} onClick={()=>edit(fn)}><PencilAltIcon/></button>}</li>;
        })}</ul>}
      </div>;
    })}{!matches && <p>No matching functions.</p>}</div>
  </div>;
}
