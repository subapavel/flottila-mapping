// PROTOTYPE (#10, throwaway). Variant (d) "CPI split": top = source tree | link gutter (all links,
// fx marker per mapped target row) | target tree; bottom = tabs Function graph / Display queue / Test.
import { Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { useEffect, useState } from 'react';
import { chainText } from '../model/derive';
import { shortPath, TGT_ROOT } from '../model/structures';
import type { AuthoringId, FieldPath, TargetFieldMapping } from '../model/types';
import { boxInputs } from '../model/types';
import { DisplayQueue } from '../shared/DisplayQueue';
import { useEditor } from '../shared/editorState';
import { GraphCanvas } from '../shared/GraphCanvas';
import { LinkedTrees } from '../shared/LinkedTrees';
import { TestPanel } from '../shared/SidePanels';
import { SplitPane } from '../shared/SplitPane';

export const DEFAULT_FIELD = `${TGT_ROOT}/InvoiceLine/DeliveryDate`;

export function VariantD() {
  const { field, select } = useEditor();
  useEffect(() => { if (!field) select(DEFAULT_FIELD, null); }, [field, select]);
  const [tab, setTab] = useState<string>(new URLSearchParams(location.search).get('tab') ?? 'graph');
  const f = field ?? DEFAULT_FIELD;
  return (
    <div className="vsplit" data-testid="variant-d">
      <SplitPane id="d" direction="vertical" defaultRatio={0.5} minPx={60} testId="d-split"
        first={<LinkedTrees id="d" linkMode="all" onSelectTarget={(p) => select(p, null)} />}
        second={
          <div className="lower">
            <Tabs activeKey={tab} onSelect={(_e, k) => setTab(String(k))} className="lower__tabs">
              <Tab eventKey="graph" title={<TabTitleText>Function graph</TabTitleText>} />
              <Tab eventKey="queue" title={<TabTitleText>Display queue</TabTitleText>} data-testid="tab-queue" />
              <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>} />
            </Tabs>
            <div className="lower__body">
              {tab === 'graph' && <GraphCanvas field={f} scope="d" palette />}
              {tab === 'queue' && <AllQueues field={f} />}
              {tab === 'test' && <div className="lower__scroll"><TestPanel /></div>}
            </div>
          </div>
        }
      />
    </div>
  );
}

/** Every box of the selected mapping, inputs before consumers, the result last. */
function AllQueues({ field }: { field: FieldPath }) {
  const { model, run, box, select } = useEditor();
  const fm = model.targetFieldMappings[field];
  if (!fm) return <div className="lower__scroll muted">{shortPath(field)} is not mapped.</div>;
  return (
    <div className="lower__scroll" data-testid="all-queues">
      <div className="muted">Display queues of every box of {shortPath(field)} ({fm.id}), for the input in the Test tab. Click one to select the box.</div>
      {topo(fm).map((id) => {
        const ev = run.boxQueues.get(id);
        return (
          <div key={id} className={`aq ${box === id ? 'is-selected' : ''}`} onClick={() => select(field, id)}>
            <DisplayQueue compact queue={ev ? ev.queue : null} generating={ev?.generating} id={id} title={(id === fm.result ? '⇒ result: ' : '') + chainText(fm, id)} />
          </div>
        );
      })}
    </div>
  );
}

function topo(fm: TargetFieldMapping): AuthoringId[] {
  const out: AuthoringId[] = [];
  const seen = new Set<string>();
  const visit = (id: AuthoringId) => {
    if (seen.has(id) || !fm.boxes[id]) return;
    seen.add(id);
    for (const i of boxInputs(fm.boxes[id])) if (i) visit(i);
    out.push(id);
  };
  for (const id of Object.keys(fm.boxes).sort()) visit(id);
  const r = fm.result ? out.indexOf(fm.result) : -1;
  if (r >= 0) out.push(...out.splice(r, 1));
  return out;
}
