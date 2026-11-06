import { Button } from '@patternfly/react-core';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { splitKey, type BrowserStateStore } from './browser-state/browser-state';
import { Splitter } from './layout/Splitter';
import { readSplit, type Split, type SplitRules } from './layout/split';
import type { Sides } from './structure-overview/StructureOverview';

/** Either half collapses fully; Enter collapses the structure overview (ADR-0012). */
const HALVES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
/** Either tree collapses fully; Enter collapses the source tree (ADR-0012). */
const SIDES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
/** Only the inspector collapses; its collapsed state is the closed inspector. */
const INSPECTOR: SplitRules = { initial: 0.7, collapsible: ['end'] };

export interface EditorLayoutProps {
  browserState: BrowserStateStore;
  /** The structure overview, given how its trees share the width and the splitter to draw between them. */
  overview: (sides: Sides, splitter: ReactNode) => ReactNode;
  functionEditor: ReactNode;
  /** Rendered only while the inspector is open. */
  inspector: ReactNode;
}

/**
 * The split view of ADR-0012: the structure overview on top, the function editor below with the inspector on its
 * right. A splitter sets the ratio between the halves, and either half collapses fully; a second one, between the
 * source and the target tree, collapses either tree fully; a third sets the inspector's width and closes it, as does
 * the inspector button. All three are kept per user in the browser (ADR-0013). The view fills the height its parent
 * leaves it (spec #135); its static styles are in editor.css.
 */
export function EditorLayout({ browserState, overview, functionEditor, inspector }: EditorLayoutProps) {
  const id = useId();
  const [halves, changeHalves] = useKeptSplit(browserState, 'halves', HALVES);
  const [trees, changeTrees] = useKeptSplit(browserState, 'sides', SIDES);
  const [side, changeSide] = useKeptSplit(browserState, 'inspector', INSPECTOR);
  const inspectorOpen = side.collapsed === null;
  const [top, bottom] = paneStyles(halves);
  const [main, aside] = paneStyles(side);
  const [source, target] = grows(trees);
  const sides: Sides = {
    source,
    target,
    collapsed: trees.collapsed === 'start' ? 'source' : trees.collapsed === 'end' ? 'target' : null,
    sourceId: `${id}source`,
  };

  return (
    <div className="fm-layout">
      <div id={`${id}overview`} style={top}>
        {overview(
          sides,
          <Splitter
            orientation="vertical"
            label="Resize the source and the target structure"
            controls={sides.sourceId}
            split={trees}
            rules={SIDES}
            onChange={changeTrees}
          />,
        )}
      </div>
      <Splitter
        orientation="horizontal"
        label="Resize the structure overview and the function editor"
        controls={`${id}overview`}
        split={halves}
        rules={HALVES}
        onChange={changeHalves}
      />
      <div className="fm-layout__bottom" style={bottom}>
        <div className="fm-layout__bar">
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
        <div className="fm-layout__work">
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
 * The flex grow of the panes before and after a splitter: each its share of the space the splitter leaves. With one
 * pane collapsed the other grows by 1, since flex shares that sum below 1 leave space unused.
 */
function grows(split: Split): [number, number] {
  return [split.collapsed === 'end' ? 1 : split.ratio, split.collapsed === 'start' ? 1 : 1 - split.ratio];
}

/** The styles of the panes before and after a splitter: they grow by `grows`, and a collapsed pane is hidden. */
function paneStyles(split: Split): [CSSProperties, CSSProperties] {
  const style = (grow: number, hidden: boolean): CSSProperties => ({
    flex: `${grow} 1 0`,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    display: hidden ? 'none' : undefined,
  });
  const [start, end] = grows(split);
  return [style(start, split.collapsed === 'start'), style(end, split.collapsed === 'end')];
}

/** A splitter's state, read once from the browser state and written back on every change. */
function useKeptSplit(browserState: BrowserStateStore, splitter: 'halves' | 'sides' | 'inspector', rules: SplitRules) {
  const [split, setSplit] = useState(() => readSplit(browserState.read(splitKey(splitter)), rules));
  const change = (next: Split) => {
    setSplit(next);
    browserState.write(splitKey(splitter), next);
  };
  return [split, change] as const;
}
