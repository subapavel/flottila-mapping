import { Button } from '@patternfly/react-core';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { splitKey, type BrowserStateStore } from './browser-state/browser-state';
import { Splitter } from './layout/Splitter';
import { readSplit, type Split, type SplitRules } from './layout/split';

/** Either half collapses fully; Enter collapses the structure overview (ADR-0012). */
const HALVES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
/** Only the inspector collapses; its collapsed state is the closed inspector. */
const INSPECTOR: SplitRules = { initial: 0.7, collapsible: ['end'] };
/** The height the halves share: at the initial ratio, about the trees' and the canvas's fixed heights before #104's splitters. */
const HEIGHT = '56rem';

export interface EditorLayoutProps {
  browserState: BrowserStateStore;
  overview: ReactNode;
  functionEditor: ReactNode;
  /** Rendered only while the inspector is open. */
  inspector: ReactNode;
}

/**
 * The split view of ADR-0012: the structure overview on top, the function editor below with the inspector on its
 * right. A splitter sets the ratio between the halves, and either half collapses fully; a second one sets the
 * inspector's width and closes it, as does the inspector button. Both are kept per user in the browser (ADR-0013).
 */
export function EditorLayout({ browserState, overview, functionEditor, inspector }: EditorLayoutProps) {
  const id = useId();
  const [halves, changeHalves] = useKeptSplit(browserState, 'halves', HALVES);
  const [side, changeSide] = useKeptSplit(browserState, 'inspector', INSPECTOR);
  const inspectorOpen = side.collapsed === null;
  const [top, bottom] = paneStyles(halves);
  const [main, aside] = paneStyles(side);

  return (
    <div style={{ height: HEIGHT, display: 'flex', flexDirection: 'column' }}>
      <div id={`${id}overview`} style={top}>
        {overview}
      </div>
      <Splitter
        orientation="horizontal"
        label="Resize the structure overview and the function editor"
        controls={`${id}overview`}
        split={halves}
        rules={HALVES}
        onChange={changeHalves}
      />
      <div style={{ ...bottom, display: bottom.display ?? 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="link"
            isInline
            aria-expanded={inspectorOpen}
            aria-controls={`${id}inspector`}
            onClick={() => changeSide({ ratio: side.ratio, collapsed: inspectorOpen ? 'end' : null })}
          >
            {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          </Button>
        </div>
        <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex' }}>
          <div id={`${id}function-editor`} style={main}>
            {functionEditor}
          </div>
          <Splitter
            orientation="vertical"
            label="Resize the function editor and the inspector"
            controls={`${id}function-editor`}
            split={side}
            rules={INSPECTOR}
            onChange={changeSide}
          />
          <div id={`${id}inspector`} style={aside}>
            {inspectorOpen && inspector}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The styles of the panes before and after a splitter: each grows by its share of the space the splitter leaves. A
 * collapsed pane is hidden, and the other one grows by 1, since flex shares that sum below 1 leave space unused.
 */
function paneStyles(split: Split): [CSSProperties, CSSProperties] {
  const style = (grow: number, hidden: boolean): CSSProperties => ({
    flex: `${grow} 1 0`,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    display: hidden ? 'none' : undefined,
  });
  return [
    style(split.collapsed === 'end' ? 1 : split.ratio, split.collapsed === 'start'),
    style(split.collapsed === 'start' ? 1 : 1 - split.ratio, split.collapsed === 'end'),
  ];
}

/** A splitter's state, read once from the browser state and written back on every change. */
function useKeptSplit(browserState: BrowserStateStore, splitter: 'halves' | 'inspector', rules: SplitRules) {
  const [split, setSplit] = useState(() => readSplit(browserState.read(splitKey(splitter)), rules));
  const change = (next: Split) => {
    setSplit(next);
    browserState.write(splitKey(splitter), next);
  };
  return [split, change] as const;
}
