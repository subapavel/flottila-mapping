import {AngleDoubleDownIcon,AngleDoubleUpIcon,ToggleOffIcon,ToggleOnIcon,ColumnsIcon,DownloadIcon,FilterIcon,RouteIcon,SearchIcon} from '@patternfly/react-icons';
import {Tool} from './ToolbarTools';
import {useDefinition} from './DefinitionTools';
import {action} from './ActionMenu';

const filters=['Show Mapped Fields Only','Show Unmapped Fields Only','Show Fields Mapped Directly Only','Show Fields Mapped Indirectly Only','Show Selected Fields'];
export function TreeToolbar({side,mode,fullPath,onPath,expand,collapseNext,filter,chooseFilter,onToggleFilter,searchOpen,onSearch,onDownload,
  mappingColumn,onMapping,selectionColumn,onSelection,visiblePaths}) {
  const {showMenu,marked,setMarked}=useDefinition();
  const target=side==='target';
  const filterMenu=e=>{
    const items=[action(filter.active?'Switch Off':'Switch On',onToggleFilter),
      ...(target?filters:filters.slice(0,2)).map((name,i)=>action(name,()=>chooseFilter(i),{checked:i===filter.kind}))];
    showMenu(e,'Filter Tree',items);
  };
  function changeAll(operation) {
    onSelection(true);
    if(operation==='Select All')setMarked([...new Set([...marked,...visiblePaths])]);
    if(operation==='Select None')setMarked(marked.filter(p=>!visiblePaths.includes(p)));
    if(operation==='Inverse Selection')setMarked([...marked.filter(p=>!visiblePaths.includes(p)),...visiblePaths.filter(p=>!marked.includes(p))]);
  }
  return <div className="tree-tool-buttons" role="toolbar" aria-label={side+' tree tools'}>
    {mode!=='Text'&&<>
      <Tool label={collapseNext?'Collapse Tree':'Expand Tree'} icon={collapseNext?AngleDoubleUpIcon:AngleDoubleDownIcon} onClick={expand}/>
      <Tool label="Show Full Path" icon={RouteIcon} pressed={fullPath} onClick={onPath}/>
      <span className="tool-split"><Tool label="Filter Tree" icon={FilterIcon} pressed={filter.active} onClick={onToggleFilter}/><Tool label="Filter Tree options" menu onClick={filterMenu}/></span>
      {target&&<>
        <Tool label="Show Mapping Column" icon={ColumnsIcon} pressed={mappingColumn} onClick={onMapping}/>
        <span className="tool-split"><Tool label="Show Selection Column" icon={selectionColumn?ToggleOnIcon:ToggleOffIcon} pressed={selectionColumn} onClick={()=>onSelection(!selectionColumn)}/><Tool label="Selection column options" menu onClick={e=>showMenu(e,'Selection column',[
          action(selectionColumn?'Hide Selection Column':'Show Selection Column',()=>onSelection(!selectionColumn)),
          ...['Select All','Select None','Inverse Selection'].map(label=>action(label,()=>changeAll(label)))
        ])}/></span>
      </>}
    </>}
    <Tool label={searchOpen?'Close Search':'Open Search'} icon={SearchIcon} pressed={searchOpen} onClick={onSearch}/>
    <Tool label="Save Document Source" icon={DownloadIcon} onClick={onDownload}/>
  </div>;
}
