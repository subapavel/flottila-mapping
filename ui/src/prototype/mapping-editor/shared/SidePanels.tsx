// PROTOTYPE (#10, throwaway): the test panel and the model JSON view, shown in one app-level
// PatternFly drawer so every variant gets them without sharing a layout.
import { Button, DrawerActions, DrawerCloseButton, DrawerHead, DrawerPanelBody, DrawerPanelContent, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { useEffect, useMemo, useRef } from 'react';
import { canonicalJson } from '../model/canonical';
import { findBox } from '../model/derive';
import { shortPath } from '../model/structures';
import { useEditor } from './editorState';

export function SidePanel() {
  const { drawer, setDrawer } = useEditor();
  return (
    <DrawerPanelContent isResizable defaultSize="520px" minSize="360px" data-testid="side-panel">
      <DrawerHead>
        <Tabs activeKey={drawer ?? 'test'} onSelect={(_e, k) => setDrawer(k as 'test' | 'json')}>
          <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>} />
          <Tab eventKey="json" title={<TabTitleText>Model JSON</TabTitleText>} />
        </Tabs>
        <DrawerActions><DrawerCloseButton onClose={() => setDrawer(null)} /></DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>{drawer === 'json' ? <ModelJson /> : <TestPanel />}</DrawerPanelBody>
    </DrawerPanelContent>
  );
}

export function TestPanel() {
  const { inputXml, setInputXml, run, rerun, runCount, model, select } = useEditor();
  return (
    <div className="testpanel" data-testid="test-panel">
      <div className="testpanel__bar">
        <strong>Input instance</strong>
        <Button size="sm" onClick={rerun} data-testid="run">Run</Button>
        <span className="muted">mock evaluator, {run.ms.toFixed(1)} ms{runCount ? `, run #${runCount}` : ', live'}</span>
      </div>
      <textarea className="testpanel__input" value={inputXml} onChange={(e) => setInputXml(e.target.value)} spellCheck={false} />
      <strong>Errors ({run.errors.length})</strong>
      <ul className="testpanel__errors" data-testid="errors">
        {run.errors.map((e, i) => {
          const boxId = 'boxId' in e ? e.boxId : undefined;
          const fmId = 'fmId' in e ? e.fmId : undefined;
          const path = 'targetPath' in e ? e.targetPath : undefined;
          return (
            <li key={i} className={`err err--${e.code}`}>
              <span className="err__code">{e.code}</span> {e.message}
              {path && <> · <a onClick={() => select(path, boxId ?? null)}>{shortPath(path).split('/').slice(-2).join('/')}</a></>}
              {boxId && <> · box <code>{boxId}</code>{findBox(model, boxId) ? '' : ' (gone)'}</>}
              {!boxId && fmId && <> · mapping <code>{fmId}</code></>}
            </li>
          );
        })}
      </ul>
      <strong>Generated target (rough XML)</strong>
      <pre className="testpanel__out" data-testid="output">{run.output}</pre>
    </div>
  );
}

function ModelJson() {
  const { model, revision, field } = useEditor();
  const lines = useMemo(() => canonicalJson(model).split('\n'), [model]);
  const mark = useRef<HTMLSpanElement>(null);
  // highlight the selected target field mapping's entry
  const [from, to] = useMemo(() => {
    const i = field ? lines.indexOf(`    ${JSON.stringify(field)}: {`) : -1;
    if (i < 0) return [-1, -1];
    const j = lines.indexOf('    },', i);
    return [i, j < 0 ? lines.length : j];
  }, [lines, field]);
  useEffect(() => { mark.current?.scrollIntoView({ block: 'start' }); }, [from, revision]);
  return (
    <div data-testid="model-json">
      <div className="muted">Canonical form (sorted keys, 2-space indent). Edits: {revision}. No layout is stored: drag a box and this text does not change.</div>
      <pre className="modeljson">
        {lines.map((l, k) => (
          <span key={k} ref={k === from ? mark : undefined} className={k >= from && k <= to ? 'modeljson__hl' : undefined}>{l + '\n'}</span>
        ))}
      </pre>
    </div>
  );
}
