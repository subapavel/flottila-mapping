import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {AngleRightIcon,CheckIcon,ToggleOffIcon,ToggleOnIcon,TrashIcon} from '@patternfly/react-icons';

export const action = (label, run, extra={}) => ({label,run,...extra});
export const deleteAction = (label, run, extra) => action(label,run,{icon:TrashIcon,...extra});
export const isContextMenuKey = e => e.key==='ContextMenu' || (e.shiftKey && e.key==='F10');
export function menuAnchor(e,element=e.currentTarget) {
  e.preventDefault();
  e.stopPropagation();
  const rect=element.getBoundingClientRect();
  const point=e.type==='contextmenu' && (e.clientX || e.clientY);
  return {x:point?e.clientX:rect.left,y:point?e.clientY:rect.bottom,element};
}
function MenuLevel({items,anchor,label,level=0,close,back}) {
  const box=useRef(null);
  const [sub,setSub]=useState(null);
  const [pos,setPos]=useState({left:anchor.x,top:anchor.y});
  useLayoutEffect(()=>{
    const rect=box.current.getBoundingClientRect();
    const left=level && anchor.x+rect.width>window.innerWidth ? anchor.left-rect.width : anchor.x;
    setPos({left:Math.max(5,Math.min(left,window.innerWidth-rect.width-5)),top:Math.max(5,Math.min(anchor.y,window.innerHeight-rect.height-5))});
    box.current.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  },[anchor,level]);
  function openChild(item,el,focus=false) {
    if(!item.children){setSub(null);return;}
    if(sub?.item===item){if(focus)box.current.querySelector('[role=menu] button:not(:disabled)')?.focus();return;}
    const r=el.getBoundingClientRect();
    setSub({item,anchor:{x:r.right-2,left:r.left,y:r.top-4,element:el}});
  }
  function activate(item,el) {
    if(item.children){openChild(item,el,true);return;}
    close();item.run?.();
  }
  function keys(e) {
    e.stopPropagation();
    const buttons=[...box.current.querySelectorAll(':scope > button:not(:disabled)')];
    const index=buttons.indexOf(document.activeElement);
    if(e.key==='Escape' || (level && e.key==='ArrowLeft')) {e.preventDefault();if(level)back();else close();return;}
    if(e.key==='ArrowRight' && index>=0){
      e.preventDefault();
      if(buttons[index].getAttribute('aria-haspopup')==='menu')buttons[index].click();
      return;
    }
    const move={ArrowDown:(index+1)%buttons.length,ArrowUp:(index-1+buttons.length)%buttons.length,Home:0,End:buttons.length-1};
    if(Object.hasOwn(move,e.key)){e.preventDefault();buttons[move[e.key]]?.focus();}
    if(e.key==='Tab')close();
  }
  return <div className="def-menu" role="menu" aria-label={label} ref={box} style={pos} onKeyDown={keys}>
    {items.map(item=>{
      const Mark=item.toggle?(item.checked?ToggleOnIcon:ToggleOffIcon):item.checked?CheckIcon:item.icon;
      return <button role={item.checked===undefined?'menuitem':item.toggle?'menuitemcheckbox':'menuitemradio'} aria-checked={item.checked} type="button"
      key={item.key??item.label} disabled={item.disabled} aria-haspopup={item.children?'menu':undefined} aria-expanded={item.children?sub?.item===item:undefined}
      onPointerEnter={e=>{if(!item.disabled)openChild(item,e.currentTarget);}} onClick={e=>activate(item,e.currentTarget)}>
      <span className="menu-mark" aria-hidden="true">{Mark&&<Mark/>}</span><span>{item.label}</span>{item.children&&<AngleRightIcon/>}
    </button>})}
    {sub&&<MenuLevel key={sub.item.label} label={sub.item.label} items={sub.item.children} anchor={sub.anchor} level={level+1}
      close={close} back={()=>{sub.anchor.element.focus();setSub(null);}}/>}
  </div>;
}
export function ActionMenu({menu,onClose}) {
  useEffect(()=>{
    if(!menu)return;
    const outside=e=>{if(!e.target.closest('.def-menu'))onClose(false);};
    const resize=()=>onClose(false);
    document.addEventListener('pointerdown',outside,true);
    window.addEventListener('resize',resize);
    return ()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',resize);};
  },[menu,onClose]);
  return menu?createPortal(<MenuLevel key={menu.key} items={menu.items} label={menu.label} anchor={menu.anchor}
    close={()=>onClose(true)}/>,document.body):null;
}
