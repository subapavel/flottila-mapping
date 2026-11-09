import {useEffect,useLayoutEffect,useState} from 'react';
import {Tooltip} from '@patternfly/react-core';

// A canvas has one tooltip. Ports and settings take precedence over their node.
export function MappingHint({host}) {
  const [anchor,setAnchor]=useState(null);
  const [content,setContent]=useState('');
  useLayoutEffect(()=>{
    const canvas=host.current;
    if(!anchor||!canvas)return;
    function syncHint(){
      if(!canvas.contains(anchor))setAnchor(null);
      else setContent(anchor.dataset.mappingHint||'');
    }
    syncHint();
    const observer=new MutationObserver(syncHint);
    observer.observe(anchor,{attributes:true,attributeFilter:['data-mapping-hint']});
    observer.observe(canvas,{childList:true,subtree:true});
    return ()=>observer.disconnect();
  },[anchor,host]);
  useEffect(()=>{
    const el=host.current;
    const find=target=>target instanceof Element &&
      (target.closest('[data-mapping-hint]') || (target.matches('.react-flow__node') && target.querySelector('.map-node')));
    const enter=e=>setAnchor(!e.buttons && find(e.target) || null);
    const leave=e=>setAnchor(current=>current===find(e.target) && current!==find(e.relatedTarget)?null:current);
    const clear=()=>setAnchor(null);
    const escape=e=>{if(e.key==='Escape')clear();};
    const events={pointerover:enter,pointerout:leave,focusin:enter,focusout:leave,pointerdown:clear,contextmenu:clear,keydown:escape};
    for(const [event,handler] of Object.entries(events))el.addEventListener(event,handler,true);
    return ()=>{for(const [event,handler] of Object.entries(events))el.removeEventListener(event,handler,true);};
  },[host]);
  if(!anchor?.isConnected)return null;
  return <Tooltip className="node-description-tooltip" triggerRef={anchor} trigger="manual" isVisible
    content={content} animationDuration={0}/>;
}
