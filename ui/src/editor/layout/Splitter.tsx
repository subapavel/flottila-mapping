import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { dragged, keyed, shown, type Pane, type Split, type SplitRules } from './split';
import './layout.css';

export interface SplitterProps {
  /** `horizontal` lies between a top and a bottom pane, `vertical` between a left and a right one. */
  orientation: 'horizontal' | 'vertical';
  /** The accessible name: what the splitter resizes. */
  label: string;
  /** The id of the start pane, whose share the splitter's value is. */
  controls: string;
  split: Split;
  rules: SplitRules;
  onChange: (split: Split) => void;
}

/**
 * A splitter between two panes (ADR-0012), a focusable WAI-ARIA window splitter: its value is the start pane's share
 * in percent. The arrows along its axis, Home, End and Enter move or collapse it (`keyed`); a drag moves it over its
 * parent, the space it splits; a double-click resets it to its initial ratio.
 */
export function Splitter({ orientation, label, controls, split, rules, onChange }: SplitterProps) {
  const self = useRef<HTMLDivElement>(null);
  // the window listeners of a drag in progress, released on pointerup or when the splitter goes away mid-drag
  const release = useRef<(() => void) | null>(null);
  useEffect(() => () => release.current?.(), []);

  const onKeyDown = (event: KeyboardEvent) => {
    const next = keyed(split, event.key, rules, orientation);
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
  };

  // a button of the handle collapses its pane, or restores it while it is collapsed
  const toggle = (pane: Pane) => onChange({ ratio: split.ratio, collapsed: split.collapsed === pane ? null : pane });
  const button = (pane: Pane) => {
    const collapsed = split.collapsed === pane;
    const [open, close] = orientation === 'horizontal' ? (pane === 'start' ? ['▼', '▲'] : ['▲', '▼']) : pane === 'start' ? ['▶', '◀'] : ['◀', '▶'];
    return (
      <button type="button" className="fm-splitter__button" data-pane={pane} tabIndex={-1} title={collapsed ? 'restore' : 'collapse'} onClick={() => toggle(pane)}>
        {collapsed ? open : close}
      </button>
    );
  };

  const onPointerDown = (event: PointerEvent) => {
    // a button of the handle is a click, not a drag
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    // no text selection while dragging; the splitter still takes the focus, so the keys go on from where it was dropped
    event.preventDefault();
    self.current!.focus();
    const space = self.current!.parentElement!.getBoundingClientRect();
    let current = split;
    const move = (e: globalThis.PointerEvent) => {
      const fraction = orientation === 'horizontal' ? (e.clientY - space.top) / space.height : (e.clientX - space.left) / space.width;
      current = dragged(current, fraction, rules);
      onChange(current);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      release.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    release.current = stop;
  };

  return (
    <div
      ref={self}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-controls={controls}
      aria-valuenow={Math.round(shown(split) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onChange({ ratio: rules.initial, collapsed: null })}
      className={`fm-splitter fm-splitter--${orientation}`}
    >
      {rules.collapsible.includes('start') && button('start')}
      <span className="fm-splitter__grip" />
      {rules.collapsible.includes('end') && button('end')}
    </div>
  );
}
