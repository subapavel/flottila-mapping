// PROTOTYPE (#10, throwaway). Variant (e) "Split + inspector": top = trees with only the selected
// mapping's links (faint ticks for the rest); bottom = canvas with quick insert | inspector of the
// selected box (catalogue doc, fidelity, parameters, context, display queue). Test is the header drawer.
import { Label } from '@patternfly/react-core';
import { useEffect } from 'react';
import { CATALOGUE_BY_NAME } from '../model/catalogue';
import { chainText, inputNames, isOrphanedBox, targetStatus } from '../model/derive';
import { setContext, setParam } from '../model/ops';
import { ancestors, occurrenceText, parentPath, shortPath } from '../model/structures';
import type { Box, FieldPath } from '../model/types';
import { boxInputs } from '../model/types';
import { DisplayQueue } from '../shared/DisplayQueue';
import { useEditor } from '../shared/editorState';
import { GraphCanvas } from '../shared/GraphCanvas';
import { LinkedTrees } from '../shared/LinkedTrees';
import { SplitPane } from '../shared/SplitPane';
import { DEFAULT_FIELD } from './VariantD';

export function VariantE() {
  const { field, select } = useEditor();
  useEffect(() => { if (!field) select(DEFAULT_FIELD, null); }, [field, select]);
  const f = field ?? DEFAULT_FIELD;
  return (
    <div className="vsplit" data-testid="variant-e">
      <SplitPane id="e" direction="vertical" defaultRatio={0.45} minPx={60} testId="e-split"
        first={<LinkedTrees id="e" linkMode="selected" onSelectTarget={(p) => select(p, null)} />}
        second={
          <SplitPane id="e-bottom" direction="horizontal" defaultRatio={0.64} minPx={240}
            first={<GraphCanvas field={f} scope="e" quickInsert />}
            second={<Inspector field={f} />} />
        }
      />
    </div>
  );
}

function Inspector({ field }: { field: FieldPath }) {
  const { model, update, src, tgt, run, box: sel, errorsByPath, select } = useEditor();
  const fm = model.targetFieldMappings[field];
  const b = sel && fm?.boxes[sel] ? fm.boxes[sel] : null;
  const errs = (errorsByPath.get(field) ?? []).filter((e) => !b || ('boxId' in e && e.boxId === sel));
  if (!b) {
    const t = tgt.fields.get(field);
    const ev = fm?.result ? run.boxQueues.get(fm.result) : undefined;
    return (
      <div className="insp" data-testid="inspector">
        <div className="insp__kind">target field</div>
        <h3 className="insp__title">{shortPath(field).split('/').pop()}</h3>
        <code className="insp__path">{field}</code>
        {t && <div className="insp__row">occurrence {occurrenceText(t)} · {t.type ?? 'structure field'} · <strong>{targetStatus(field, model, tgt, errorsByPath as never)}</strong></div>}
        {fm && <div className="insp__row">mapping <code>{fm.id}</code>: <code>{chainText(fm)}</code></div>}
        <Errs errs={errs} />
        {fm?.result && <DisplayQueue compact queue={ev ? ev.queue : null} generating={ev?.generating} id={fm.result} title="result" />}
        <div className="muted">Select a box on the canvas to inspect it.</div>
      </div>
    );
  }
  const ev = run.boxQueues.get(sel!);
  return (
    <div className="insp" data-testid="inspector">
      <div className="insp__kind">{b.kind === 'source' ? 'source-field box' : b.kind === 'udf' ? 'UDF box' : b.kind === 'unresolved' ? 'unresolved function' : 'function box'} · <code>{sel}</code>
        <a className="insp__back" onClick={() => select(field, null)}>target field</a></div>
      <BoxDoc box={b} />
      {b.kind === 'source' && (() => {
        const parent = parentPath(b.field);
        const sf = src.fields.get(b.field);
        return (
          <>
            <code className="insp__path">{b.field}</code>
            {isOrphanedBox(b, src) && <div><Label color="orange" isCompact>orphaned reference</Label> the source structure has no such field</div>}
            {sf && <div className="insp__row">occurrence {occurrenceText(sf)} · {sf.type ?? 'structure field (queue holds "" per occurrence)'}</div>}
            <label className="insp__param"><span>context</span>
              <select value={b.context ?? parent} onChange={(e) => update((m) => setContext(m, field, sel!, e.target.value, parent))}>
                {ancestors(src, b.field).map((a) => <option key={a} value={a}>{shortPath(a)}{a === parent ? ' (parent, default)' : ''}</option>)}
              </select>
            </label>
          </>
        );
      })()}
      {b.kind !== 'source' && (
        <>
          <div className="insp__section">Inputs</div>
          {inputNames(model, b).map((n, i) => {
            const id = boxInputs(b)[i];
            return <div key={i} className="insp__row">{i + 1}. {n}: {id && fm.boxes[id] ? <a onClick={() => select(field, id)}><code>{chainText(fm, id)}</code></a> : <span className="err__code">unconnected</span>}</div>;
          })}
          <div className="insp__section">Parameters</div>
          {Object.keys(b.params ?? {}).length === 0 && <div className="muted">none</div>}
          {Object.entries(b.params ?? {}).map(([k, v]) => (
            <label key={k} className="insp__param"><span>{k}</span>
              {typeof v === 'string'
                ? <input value={v} onChange={(e) => update((m) => setParam(m, field, sel!, k, e.target.value))} />
                : <span className="insp__table">
                    {Object.entries(v).map(([a, c]) => (
                      <span key={a}><code>{a}</code> → <input size={6} value={c} onChange={(e) => update((m) => setParam(m, field, sel!, k, { ...v, [a]: e.target.value }))} /></span>
                    ))}
                  </span>}
            </label>
          ))}
        </>
      )}
      <Errs errs={errs} />
      <DisplayQueue compact queue={ev ? ev.queue : null} generating={ev?.generating} id={sel!} title={chainText(fm, sel)} />
    </div>
  );
}

function BoxDoc({ box }: { box: Box }) {
  const { model } = useEditor();
  if (box.kind === 'function') {
    const c = CATALOGUE_BY_NAME[box.fn];
    if (!c) return <h3 className="insp__title">{box.fn}</h3>;
    return (
      <>
        <h3 className="insp__title">{c.name} {c.fidelity.level !== 'exact' && <Label isCompact color={c.fidelity.level === 'deviation' ? 'orange' : 'purple'}>{c.fidelity.level === 'deviation' ? `deviation ${c.fidelity.deviationId}` : 'assumed reading'}</Label>}</h3>
        <div className="insp__row">SAP PO/CPI name <code>{c.poName}</code> · execution kind <strong>{c.executionKind}</strong> · {c.portable ? 'portable' : 'not portable (no pure XSLT 3.0 export)'}</div>
        <div className="insp__row">inputs ({c.inputs.join(', ') || 'none'}) · parameters ({c.params.map((p) => `${p.name}: ${p.type}${p.default ? ` = "${p.default}"` : ''}`).join(', ') || 'none'})</div>
        {c.fidelity.level !== 'exact' && <div className={`insp__fid insp__fid--${c.fidelity.level}`}>{c.fidelity.level === 'deviation' ? `Deviation ${c.fidelity.deviationId}: ` : 'Assumed reading: '}{c.fidelity.example}</div>}
      </>
    );
  }
  if (box.kind === 'udf') {
    const d = model.udfs?.[box.udf];
    return (<><h3 className="insp__title">{box.udf} <Label isCompact color="purple">UDF</Label></h3>
      <div className="insp__row">{d ? <>execution kind <strong>{d.executionKind}</strong> · source <code>{d.source}</code></> : 'not declared in udfs'}</div></>);
  }
  if (box.kind === 'unresolved')
    return (<><h3 className="insp__title">{box.name} <Label isCompact color="red">unresolved ({box.origin})</Label></h3>
      <div className="insp__row">Neither in the function catalogue nor among the mapping's UDFs. Compiling it is a design-time error; its name, inputs and parameters are kept.</div></>);
  return <h3 className="insp__title">{shortPath(box.field).split('/').pop()}</h3>;
}

function Errs({ errs }: { errs: { code: string; message: string }[] }) {
  if (!errs.length) return null;
  return <ul className="insp__errs">{errs.map((e, i) => <li key={i}><span className="err__code">{e.code}</span> {e.message}</li>)}</ul>;
}
