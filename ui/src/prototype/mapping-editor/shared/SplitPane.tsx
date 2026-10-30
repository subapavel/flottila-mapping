// PROTOTYPE (#10, throwaway): resizable two-pane split with a drag handle. Double-click resets,
// the handle's buttons collapse either pane fully. State is browser-only (sessionStorage).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Collapsed = 'first' | 'second' | null;
type State = { ratio: number; collapsed: Collapsed };
const KEY = 'prototype-mapping-editor:split:';

export function SplitPane({ id, direction, defaultRatio, minPx = 80, first, second, forceCollapsed, collapsedFirst, testId }: {
  id: string;
  direction: 'vertical' | 'horizontal'; // vertical = top/bottom, horizontal = left/right
  defaultRatio: number;
  minPx?: number;
  first: ReactNode;
  second: ReactNode;
  forceCollapsed?: Collapsed; // a caller may force a state (e.g. "maximise bottom")
  collapsedFirst?: ReactNode; // shown instead of an empty first pane when it is collapsed
  testId?: string;
}) {
  const [st, setSt] = useState<State>(() => {
    const v = sessionStorage.getItem(KEY + id);
    return v ? JSON.parse(v) : { ratio: defaultRatio, collapsed: null };
  });
  useEffect(() => { sessionStorage.setItem(KEY + id, JSON.stringify(st)); }, [id, st]);
  const box = useRef<HTMLDivElement>(null);
  const vertical = direction === 'vertical';

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = box.current!.getBoundingClientRect();
    const size = vertical ? rect.height : rect.width;
    const move = (ev: PointerEvent) => {
      const pos = vertical ? ev.clientY - rect.top : ev.clientX - rect.left;
      const clamped = Math.min(size - minPx, Math.max(minPx, pos));
      setSt({ ratio: clamped / size, collapsed: null });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [vertical, minPx]);

  const collapsed = forceCollapsed ?? st.collapsed;
  const ratio = collapsed === 'first' ? 0 : collapsed === 'second' ? 1 : st.ratio;
  const handle = 8;
  const firstSize = `calc(${ratio * 100}% - ${handle * ratio}px)`;
  const toggle = (c: Collapsed) => setSt((s) => ({ ...s, collapsed: s.collapsed === c ? null : c }));

  return (
    <div ref={box} className={`split split--${direction}`} data-testid={testId}>
      <div className="split__pane split__pane--first" style={{ flexBasis: firstSize }}>
        {first /* kept mounted: tree expansion survives collapsing */}
      </div>
      {collapsed === 'first' && collapsedFirst}
      <div className="split__handle" onPointerDown={onPointerDown} onDoubleClick={() => setSt({ ratio: defaultRatio, collapsed: null })}
        title="drag to resize, double-click to reset" data-testid={testId ? `${testId}-handle` : undefined}>
        <button onClick={() => toggle('first')} title={collapsed === 'first' ? 'restore' : 'collapse'}>{vertical ? (collapsed === 'first' ? '▼' : '▲') : (collapsed === 'first' ? '▶' : '◀')}</button>
        <span className="split__grip" />
        <button onClick={() => toggle('second')} title={collapsed === 'second' ? 'restore' : 'collapse'}>{vertical ? (collapsed === 'second' ? '▲' : '▼') : (collapsed === 'second' ? '◀' : '▶')}</button>
      </div>
      <div className="split__pane split__pane--second">
        {collapsed === 'second' ? null : second}
      </div>
    </div>
  );
}
