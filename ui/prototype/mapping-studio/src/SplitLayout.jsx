import { useRef, useState } from 'react';
import { readPanelPreference, savePanelPreference } from './panelPreferences';

const clampShare = share => Math.max(0, Math.min(1, share));

export function useSplitLayout(key, initialShare) {
  const [layout, setLayout] = useState(() =>
    readPanelPreference(key, {view:'split', share:initialShare}, value =>
      ['split','minimized','maximized'].includes(value?.view) &&
      Number.isFinite(value.share) && value.share >= 0 && value.share <= 1));
  function update(changes) {
    const next = {...layout, ...changes};
    setLayout(next);
    savePanelPreference(key, next);
  }
  return {...layout, setView: view => update({view}), setShare: share => update({share})};
}

// A splitter only redistributes space beyond each pane's minimum size.
function flexibleSize(element, dimension, minimum) {
  return element.getBoundingClientRect()[dimension] - parseFloat(getComputedStyle(element)[minimum]);
}

function SplitDivider({ vertical, label, controls, share, onChange, onCommit, getTravel }) {
  const drag = useRef(null);
  const position = event => vertical ? event.clientX : -event.clientY;

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    const travel = getTravel(event.currentTarget);
    if (travel <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, position: position(event), start: share, share, travel };
  }

  function moveDrag(event) {
    const current = drag.current;
    if (current?.id !== event.pointerId) return;
    current.share = clampShare(current.start + (position(event) - current.position) / current.travel);
    onChange(current.share);
  }

  function finishDrag(event) {
    if (drag.current?.id !== event.pointerId) return;
    onCommit(drag.current.share);
    drag.current = null;
  }

  function resizeWithKeys(event) {
    const changes = { [vertical ? 'ArrowRight' : 'ArrowUp']: share + 0.05,
      [vertical ? 'ArrowLeft' : 'ArrowDown']: share - 0.05, Home: 0, End: 1 };
    if (!Object.hasOwn(changes, event.key)) return;
    event.preventDefault();
    const next = clampShare(changes[event.key]);
    onChange(next);
    onCommit(next);
  }

  return <div className="split-divider" role="separator" tabIndex={0}
      aria-label={label} aria-orientation={vertical ? 'vertical' : 'horizontal'} aria-controls={controls}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
      title={label} onKeyDown={resizeWithKeys}
      onPointerDown={startDrag} onPointerMove={moveDrag} onLostPointerCapture={finishDrag}/>;
}

export function VerticalSplitLayout({ className, label, lowerId, upper, toolbar, children, initialShare, onCommit, view='split' }) {
  const [lowerShare, setLowerShare] = useState(initialShare);
  const upperRef = useRef(null);
  const lowerRef = useRef(null);
  return <div className={'vertical-split '+className} data-view={view} style={{ '--upper-share': 1 - lowerShare, '--lower-share': lowerShare }}>
    <div className="split-upper" ref={upperRef} hidden={view==='maximized'}>{upper}</div>
    {view==='split'&&<SplitDivider label={label} controls={lowerId} share={lowerShare} onChange={setLowerShare} onCommit={onCommit}
      getTravel={() => flexibleSize(upperRef.current, 'height', 'minHeight') + flexibleSize(lowerRef.current, 'height', 'minHeight')}/>}
    {toolbar}
    <div className="split-lower" id={lowerId} ref={lowerRef} hidden={view==='minimized'}>{children}</div>
  </div>;
}

export function SideBySide({ className, label, leftId, widthKey, gutter, initialShare = 0.5, showDivider = true, children }) {
  const [leftShare, setLeftShare] = useState(() =>
    readPanelPreference(widthKey, initialShare, value => Number.isFinite(value) && value >= 0 && value <= 1));
  const [left, right] = children;
  function availableWidth(divider) {
    return flexibleSize(divider.previousElementSibling, 'width', 'minWidth')
      + flexibleSize(divider.nextElementSibling, 'width', 'minWidth');
  }
  return <div className={[className, !gutter && 'resizable-columns'].filter(Boolean).join(' ')}
    style={gutter ? undefined : { '--left-share': leftShare, '--right-share': 1 - leftShare }}>
    {left}
    {gutter || (showDivider && <SplitDivider vertical label={label} controls={leftId} share={leftShare} onChange={setLeftShare}
      onCommit={share => savePanelPreference(widthKey, share)} getTravel={availableWidth}/>)}
    {right}
  </div>;
}
