// PROTOTYPE (#10, throwaway). Variant (a) "PO style": source tree | function canvas of ONE target
// field mapping | target tree. Display queue is a docked panel under the canvas (not a popover):
// it stays open while the author clicks from box to box, and never covers the graph.
import { Button, Label, Tooltip } from '@patternfly/react-core';
import {
  Background, Controls, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CATALOGUE, fidelityText } from '../model/catalogue';
import { inputNames, isOrphanedBox, usedSourceFields } from '../model/derive';
import { addBox, connect, copyFragment, disconnect, freshIds, functionBox, pasteFragment, removeBoxes, setContext, setParam } from '../model/ops';
import { newAuthoringId } from '../model/ids';
import { parentPath, shortPath, TGT_ROOT } from '../model/structures';
import type { AuthoringId, FieldPath } from '../model/types';
import { fieldMappingGraph, layoutDagre, loadManual, resetManual, saveManual, targetNodeId } from '../layout/autoLayout';
import { DisplayQueue } from '../shared/DisplayQueue';
import { useEditor } from '../shared/editorState';
import { FieldTree } from '../shared/FieldTree';
import { nodeTypes } from '../shared/flowNodes';
import { StatusMarker } from '../shared/StatusMarker';

const DEFAULT_FIELD = `${TGT_ROOT}/InvoiceLine/DeliveryDate`;

export function VariantA() {
  const ed = useEditor();
  const { model, src, tgt, select } = ed;
  const field = ed.field ?? DEFAULT_FIELD;
  const used = useMemo(() => usedSourceFields(model), [model]);
  const fmUsed = useMemo(() => {
    const s = new Set<string>();
    for (const b of Object.values(model.targetFieldMappings[field]?.boxes ?? {})) if (b.kind === 'source') s.add(b.field);
    return s;
  }, [model, field]);

  return (
    <div className="va" data-testid="variant-a">
      <aside className="va__tree">
        <FieldTree structure={src} testId="source-tree" draggable initialDepth={2}
          marker={(p) => (fmUsed.has(p) ? <span className="mk mk--here" title="used by this target field mapping">◆</span> : used.has(p) ? <span className="mk mk--used" title="used by the mapping">●</span> : null)} />
      </aside>
      <ReactFlowProvider>
        <Canvas field={field} />
      </ReactFlowProvider>
      <aside className="va__tree">
        <FieldTree structure={tgt} testId="target-tree" initialDepth={3} selected={field} onSelect={(p) => select(p, null)}
          marker={(p) => <StatusMarker path={p} />} />
      </aside>
    </div>
  );
}

function Canvas({ field }: { field: FieldPath }) {
  const ed = useEditor();
  const { model, update, src, run, box: selBox, select, clipboard, setClipboard, errorsByPath } = ed;
  const fm = model.targetFieldMappings[field];
  const rf = useReactFlow();
  const [layoutGen, setLayoutGen] = useState(0);
  const [selectedIds, setSelectedIds] = useState<AuthoringId[]>([]);

  const errorsByBox = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of errorsByPath.get(field) ?? []) if ('boxId' in e && e.boxId) m.set(e.boxId, [...(m.get(e.boxId) ?? []), e.message]);
    return m;
  }, [errorsByPath, field]);

  const onParam = useCallback((id: AuthoringId, name: string, value: string) => update((m) => setParam(m, field, id, name, value)), [update, field]);
  const onContext = useCallback((id: AuthoringId, ctx: FieldPath | undefined) => {
    const b = model.targetFieldMappings[field].boxes[id];
    if (b.kind === 'source') update((m) => setContext(m, field, id, ctx, parentPath(b.field)));
  }, [update, field, model]);

  const computed = useMemo(() => {
    const empty = { boxes: {}, id: '', result: null };
    const g = fieldMappingGraph(model, field, fm ?? empty);
    const auto = layoutDagre(g);
    const manual = loadManual('a', g.nodes.map((n) => n.id));
    const nodes: Node[] = g.nodes.map((n) => {
      const pos = manual[n.id] ?? auto[n.id];
      if (n.id === targetNodeId(field))
        return { id: n.id, type: 'field', position: pos, data: { path: field, side: 'target' }, deletable: false };
      const b = fm!.boxes[n.id];
      return {
        id: n.id, type: 'box', position: pos,
        data: { box: b, id: n.id, inputNames: inputNames(model, b), orphaned: isOrphanedBox(b, src), errors: errorsByBox.get(n.id) ?? [], src, editable: true, onParam, onContext }
      };
    });
    const edges: Edge[] = g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'out', targetHandle: e.targetHandle }));
    return { nodes, edges };
    // layoutGen forces a re-read of manual positions after "reset layout"
  }, [model, field, fm, src, errorsByBox, onParam, onContext, layoutGen]);

  const [nodes, setNodes] = useState<Node[]>(computed.nodes);
  useEffect(() => setNodes(computed.nodes), [computed]);
  useEffect(() => { requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1.1 })); }, [field, layoutGen, rf]);

  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((ns) => applyNodeChanges(ch, ns)), []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const idx = Number((c.targetHandle ?? 'in-0').slice(3));
    update((m) => connect(m, field, c.source!, c.target === targetNodeId(field) ? 'target' : c.target!, idx));
  }, [update, field]);

  const onSelectionChange = useCallback(({ nodes: ns }: { nodes: Node[] }) => {
    const ids = ns.filter((n) => n.type === 'box').map((n) => n.id);
    setSelectedIds((old) => (old.join() === ids.join() ? old : ids));
  }, []);

  const doCopy = () => setClipboard(copyFragment(model, field, selectedIds));
  const doPaste = () => {
    if (!clipboard) return;
    const map = freshIds(clipboard);
    update((m) => pasteFragment(m, field, clipboard, map)[0]);
    // place pasted boxes next to their originals: browser state only
    for (const [oldId, newId] of Object.entries(map)) {
      const n = rf.getNode(oldId);
      if (n) saveManual('a', newId, { x: n.position.x + 40, y: n.position.y + 60 });
    }
    select(field, Object.values(map)[0] ?? null);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') doCopy();
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') doPaste();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const path = e.dataTransfer.getData('application/x-field-path');
    const fn = e.dataTransfer.getData('application/x-function');
    if (!path && !fn) return;
    const id = newAuthoringId();
    saveManual('a', id, pos);
    update((m) => addBox(m, field, path ? { kind: 'source', field: path } : functionBox(fn), id)[0]);
  };

  const subject = selBox && fm?.boxes[selBox] ? selBox : fm?.result ?? null;
  const ev = subject ? run.boxQueues.get(subject) : undefined;
  const allIds = [...Object.keys(fm?.boxes ?? {}), targetNodeId(field)];

  return (
    <section className="va__centre">
      <div className="va__toolbar">
        <span className="va__fmtitle" title={field}>Target field mapping: <strong>{shortPath(field)}</strong></span>
        {fm && <code className="muted">{fm.id}</code>}
        <span className="proto-header__spacer" />
        <Button size="sm" variant="secondary" onClick={doCopy} isDisabled={!selectedIds.length} data-testid="copy">Copy ({selectedIds.length})</Button>
        <Button size="sm" variant="secondary" onClick={doPaste} isDisabled={!clipboard} data-testid="paste">Paste</Button>
        <Button size="sm" variant="link" onClick={() => { resetManual('a', allIds); setLayoutGen((g) => g + 1); }} data-testid="reset-layout">Reset layout</Button>
      </div>
      <div className="va__work">
        <Palette />
        <div className="va__canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}>
          {!fm && <div className="va__hint">No mapping yet. Drag a source field or a function here, then wire it to the target field.</div>}
          <ReactFlow
            nodes={nodes} edges={computed.edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onConnect={onConnect}
            onNodeDragStop={(_e, n) => saveManual('a', n.id, n.position)}
            onNodeClick={(_e, n) => select(field, n.type === 'box' ? n.id : null)}
            onSelectionChange={onSelectionChange}
            onNodesDelete={(ns) => update((m) => removeBoxes(m, field, ns.filter((n) => n.type === 'box').map((n) => n.id)))}
            onEdgesDelete={(es) => es.forEach((e) => update((m) => disconnect(m, field, e.target === targetNodeId(field) ? 'target' : e.target, Number((e.targetHandle ?? 'in-0').slice(3)))))}
            fitView minZoom={0.2} deleteKeyCode={['Delete', 'Backspace']} proOptions={{ hideAttribution: false }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      <div className="va__queue" data-testid="queue-panel">
        {subject ? (
          <DisplayQueue queue={ev ? ev.queue : null} generating={ev?.generating} id={subject}
            title={subject === fm?.result && !selBox ? `${shortPath(field).split('/').pop()} (target field)` : boxLabel(model.targetFieldMappings[field].boxes[subject])} />
        ) : <div className="muted">Select a box to see its display queue.</div>}
      </div>
    </section>
  );
}

function boxLabel(b: { kind: string; fn?: string; field?: string; udf?: string; name?: string }): string {
  return b.kind === 'source' ? shortPath(b.field!) : b.kind === 'function' ? b.fn! : b.kind === 'udf' ? b.udf! : b.name!;
}

function Palette() {
  return (
    <div className="palette" data-testid="palette">
      <div className="palette__title">Functions</div>
      {CATALOGUE.map((f) => (
        <Tooltip key={f.name} content={<div><div>PO: {f.poName} · {f.executionKind}{f.portable ? ' · portable' : ''}</div><div>inputs: {f.inputs.join(', ') || '—'}</div><div>{fidelityText(f)}</div></div>}>
          <div className="palette__item" draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-function', f.name); e.dataTransfer.effectAllowed = 'copy'; }}>
            <span>{f.name}</span>
            {f.executionKind !== 'single' && <span className="palette__kind">{f.executionKind}</span>}
            {f.fidelity.level !== 'exact' && <Label isCompact color={f.fidelity.level === 'deviation' ? 'orange' : 'purple'}>{f.fidelity.level === 'deviation' ? f.fidelity.deviationId : 'assumed'}</Label>}
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
