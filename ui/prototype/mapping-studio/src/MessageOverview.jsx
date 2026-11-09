import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDefinition } from './DefinitionTools';
import { SideBySide } from './SplitLayout';
import { fieldName } from './model';

import {sourceLinks} from './definitionModel';
import {targetsOf} from './groupedExpressions';

function fieldLinks(graphs) {
  return Object.values(graphs).flatMap(graph=>targetsOf(graph).flatMap(target=>sourceLinks(graph,target.data.path)));
}

function visibleRows(panel, offset) {
  const rows = new Map();
  const scroll = panel.querySelector('.fields-scroll');
  if (!scroll) return rows;
  const bounds = scroll.getBoundingClientRect();
  panel.querySelectorAll('[data-field-path]').forEach(row => {
    const rect = row.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    if (center >= bounds.top && center <= bounds.bottom) rows.set(row.dataset.fieldPath, center - offset);
  });
  return rows;
}

export function MessageOverview({ graphs, selectedTarget, onSelect, children }) {
  const {dependencyView}=useDefinition();
  return <SideBySide className="message-overview" label="Resize source and target panels" leftId="source-message-pane"
    widthKey="definition.width" gutter={dependencyView.visible &&
      <FieldConnections graphs={graphs} dependencies={dependencyView.targets} selectedTarget={selectedTarget} onSelect={onSelect}/>}>
    {children}
  </SideBySide>;
}

function FieldConnections({ graphs, dependencies, selectedTarget, onSelect }) {
  const gutter = useRef(null);
  const links = useMemo(() => fieldLinks(graphs).filter(link=>!dependencies||dependencies.includes(link.target)), [graphs,dependencies]);
  const [lines, setLines] = useState([]);
  useLayoutEffect(() => {
    const owner = gutter.current.parentElement;
    const panels = owner.querySelectorAll('.schema');
    function measure() {
      const {top, width} = gutter.current.getBoundingClientRect();
      const left = visibleRows(panels[0], top);
      const right = visibleRows(panels[1], top);
      const visible = links.filter(l => left.has(l.source) && right.has(l.target));
      setLines(visible.map(l => ({...l, width, y1:left.get(l.source), y2:right.get(l.target)})));
    }
    let frame;
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); }
    const resize = new ResizeObserver(schedule);
    resize.observe(owner);
    const changes = new MutationObserver(schedule);
    for (const panel of panels) {
      resize.observe(panel);
      changes.observe(panel, {childList:true, subtree:true, attributes:true, attributeFilter:['class','open']});
    }
    owner.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
      owner.removeEventListener('scroll', schedule, true);
    };
  }, [links]);

  return <div className="relation-gutter" ref={gutter}>
      <svg role="group" aria-label="Field connections">
        {lines.map(({source,target,functions,width,y1,y2},i) => {
          const curve = `M0 ${y1} C${width * .43} ${y1} ${width * .57} ${y2} ${width} ${y2}`;
          const label = [fieldName(source), ...functions, fieldName(target)].join(' → ');
          return <g key={source+'|'+target+'|'+i} className={'field-link' + (target === selectedTarget ? ' current' : '')}
              role="button" tabIndex={0} aria-label={label} aria-pressed={target === selectedTarget}
              onClick={() => onSelect(target)} onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(target); }
              }}>
            <title>{label}</title>
            <path className="link-hit" d={curve}/><path className="link-stroke" d={curve}/>
            {functions.length > 0 && <g className="link-function" transform={`translate(${width/2} ${(y1+y2)/2})`}>
              <rect x="-11" y="-9" width="22" height="18" rx="5"/><text y="4" textAnchor="middle">ƒ</text>
            </g>}
          </g>;
        })}
      </svg>
  </div>;
}
