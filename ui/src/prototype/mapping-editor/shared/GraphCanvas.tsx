// PROTOTYPE (#10, throwaway): the function graph of ONE target field mapping on a React Flow
// canvas, for the round-2 split variants (d, e, f). Variant (a) keeps its own copy on purpose.
// Options: a narrow palette list, a quick-insert box ('/' or typing), a docked display queue.
import { Button, Label } from '@patternfly/react-core';
import {
  Background, Controls, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATALOGUE, fidelityText, type CatalogueFunction } from '../model/catalogue';
import { inputNames, isOrphanedBox } from '../model/derive';
import { newAuthoringId } from '../model/ids';
import { addBox, connect, copyFragment, disconnect, freshIds, functionBox, pasteFragment, removeBoxes, setContext, setParam } from '../model/ops';
import { parentPath, shortPath } from '../model/structures';
import type { AuthoringId, FieldPath } from '../model/types';
import { fieldMappingGraph, layoutDagre, loadManual, resetManual, saveManual, targetNodeId } from '../layout/autoLayout';
import { DisplayQueue } from './DisplayQueue';
import { useEditor } from './editorState';
import { nodeTypes } from './flowNodes';

type Opts = { field: FieldPath; scope: string; palette?: boolean; quickInsert?: boolean; dockedQueue?: boolean };

export function GraphCanvas(props: Opts) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ field, scope, palette, quickInsert, dockedQueue }: Opts) {
  const { model, update, src, run, box: selBox, select, clipboard, setClipboard, errorsByPath } = useEditor();
  const fm = model.targetFieldMappings[field];
  const rf = useReactFlow();
  const [layoutGen, setLayoutGen] = useState(0);
  const [selectedIds, setSelectedIds] = useState<AuthoringId[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

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
    const g = fieldMappingGraph(model, field, fm ?? { boxes: {}, id: '', result: null });
    const auto = layoutDagre(g);
    const manual = loadManual(scope, g.nodes.map((n) => n.id));
    const nodes: Node[] = g.nodes.map((n) => {
      const pos = manual[n.id] ?? auto[n.id];
      if (n.id === targetNodeId(field)) return { id: n.id, type: 'field', position: pos, data: { path: field, side: 'target' }, deletable: false };
      const b = fm!.boxes[n.id];
      return {
        id: n.id, type: 'box', position: pos,
        data: { box: b, id: n.id, inputNames: inputNames(model, b), orphaned: isOrphanedBox(b, src), errors: errorsByBox.get(n.id) ?? [], src, editable: true, onParam, onContext }
      };
    });
    const edges: Edge[] = g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'out', targetHandle: e.targetHandle }));
    return { nodes, edges };
  }, [model, field, fm, src, errorsByBox, onParam, onContext, layoutGen, scope]);

  const [nodes, setNodes] = useState<Node[]>(computed.nodes);
  useEffect(() => setNodes(computed.nodes), [computed]);
  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.15, maxZoom: 1 }), 60); return () => clearTimeout(t); }, [field, layoutGen, rf]);

  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((ns) => applyNodeChanges(ch, ns)), []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    update((m) => connect(m, field, c.source!, c.target === targetNodeId(field) ? 'target' : c.target!, Number((c.targetHandle ?? 'in-0').slice(3))));
  }, [update, field]);
  const onSelectionChange = useCallback(({ nodes: ns }: { nodes: Node[] }) => {
    const ids = ns.filter((n) => n.type === 'box').map((n) => n.id);
    setSelectedIds((old) => (old.join() === ids.join() ? old : ids));
  }, []);

  const addAt = (box: Parameters<typeof addBox>[2], client: { x: number; y: number }) => {
    const id = newAuthoringId();
    saveManual(scope, id, rf.screenToFlowPosition(client));
    update((m) => addBox(m, field, box, id)[0]);
    select(field, id);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const path = e.dataTransfer.getData('application/x-field-path');
    const fn = e.dataTransfer.getData('application/x-function');
    if (path || fn) addAt(path ? { kind: 'source', field: path } : functionBox(fn), { x: e.clientX, y: e.clientY });
  };
  const doPaste = () => {
    if (!clipboard) return;
    const map = freshIds(clipboard);
    update((m) => pasteFragment(m, field, clipboard, map)[0]);
    for (const [o, n] of Object.entries(map)) { const nd = rf.getNode(o); if (nd) saveManual(scope, n, { x: nd.position.x + 40, y: nd.position.y + 60 }); }
  };

  // quick insert: '/' or a letter while the pointer is over the canvas
  const [qi, setQi] = useState<{ q: string; x: number; y: number; sel: number } | null>(null);
  const hover = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && hover.current) setClipboard(copyFragment(model, field, selectedIds));
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && hover.current) doPaste();
      if (!quickInsert || !hover.current || qi || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' || /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        const r = wrap.current!.getBoundingClientRect();
        const p = last.current.x ? last.current : { x: r.left + r.width / 2, y: r.top + r.height / 3 };
        setQi({ q: e.key === '/' ? '' : e.key, x: p.x - r.left, y: p.y - r.top, sel: 0 });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  const matches = qi ? CATALOGUE.filter((f) => `${f.name} ${f.poName}`.toLowerCase().includes(qi.q.toLowerCase())) : [];
  const insert = (f: CatalogueFunction) => {
    const r = wrap.current!.getBoundingClientRect();
    addAt(functionBox(f.name), { x: r.left + qi!.x, y: r.top + qi!.y });
    setQi(null);
  };

  const subject = selBox && fm?.boxes[selBox] ? selBox : fm?.result ?? null;
  const ev = subject ? run.boxQueues.get(subject) : undefined;

  return (
    <div className="gc">
      <div className="gc__toolbar">
        <span className="gc__title" title={field}>{shortPath(field)}</span>
        {fm ? <code className="muted">{fm.id}</code> : <span className="muted">not mapped yet: drop a source field or a function here</span>}
        <span className="proto-header__spacer" />
        {quickInsert && <span className="muted">type or press / on the canvas to insert a function</span>}
        <Button size="sm" variant="plain" onClick={() => setClipboard(copyFragment(model, field, selectedIds))} isDisabled={!selectedIds.length}>Copy ({selectedIds.length})</Button>
        <Button size="sm" variant="plain" onClick={doPaste} isDisabled={!clipboard}>Paste</Button>
        <Button size="sm" variant="link" onClick={() => { resetManual(scope, [...Object.keys(fm?.boxes ?? {}), targetNodeId(field)]); setLayoutGen((g) => g + 1); }}>Reset layout</Button>
      </div>
      <div className="gc__work">
        {palette && (
          <div className="gc__palette" data-testid="narrow-palette">
            {CATALOGUE.map((f) => (
              <div key={f.name} className="gc__pitem" draggable title={`${f.poName} · ${f.executionKind} · ${fidelityText(f)}`}
                onDragStart={(e) => { e.dataTransfer.setData('application/x-function', f.name); e.dataTransfer.effectAllowed = 'copy'; }}>
                {f.name}{f.fidelity.level !== 'exact' && <span className={`fid fid--${f.fidelity.level}`}>{f.fidelity.level === 'deviation' ? '≠' : '?'}</span>}
              </div>
            ))}
          </div>
        )}
        <div ref={wrap} className="gc__canvas" data-testid="graph-canvas"
          onMouseEnter={() => (hover.current = true)} onMouseLeave={() => (hover.current = false)}
          onMouseMove={(e) => (last.current = { x: e.clientX, y: e.clientY })}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}>
          <ReactFlow nodes={nodes} edges={computed.edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onConnect={onConnect} onSelectionChange={onSelectionChange}
            onNodeDragStop={(_e, n) => saveManual(scope, n.id, n.position)}
            onNodeClick={(_e, n) => select(field, n.type === 'box' ? n.id : null)}
            onPaneClick={() => { select(field, null); setQi(null); }}
            onNodesDelete={(ns) => update((m) => removeBoxes(m, field, ns.filter((n) => n.type === 'box').map((n) => n.id)))}
            onEdgesDelete={(es) => es.forEach((e) => update((m) => disconnect(m, field, e.target === targetNodeId(field) ? 'target' : e.target, Number((e.targetHandle ?? 'in-0').slice(3)))))}
            minZoom={0.2} deleteKeyCode={['Delete', 'Backspace']}>
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {qi && (
            <div className="qi" style={{ left: qi.x, top: qi.y }} data-testid="quick-insert">
              <input autoFocus value={qi.q} placeholder="function name or PO name"
                onChange={(e) => setQi({ ...qi, q: e.target.value, sel: 0 })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setQi(null);
                  if (e.key === 'ArrowDown') setQi({ ...qi, sel: Math.min(qi.sel + 1, matches.length - 1) });
                  if (e.key === 'ArrowUp') setQi({ ...qi, sel: Math.max(qi.sel - 1, 0) });
                  if (e.key === 'Enter' && matches[qi.sel]) insert(matches[qi.sel]);
                }} />
              <ul>
                {matches.slice(0, 8).map((f, i) => (
                  <li key={f.name} className={i === qi.sel ? 'is-active' : ''} onMouseDown={(e) => { e.preventDefault(); insert(f); }}>
                    <strong>{f.name}</strong> <span className="muted">{f.poName} · {f.executionKind}</span>
                    {f.fidelity.level !== 'exact' && <Label isCompact color={f.fidelity.level === 'deviation' ? 'orange' : 'purple'}>{f.fidelity.level === 'deviation' ? f.fidelity.deviationId : 'assumed'}</Label>}
                  </li>
                ))}
                {matches.length === 0 && <li className="muted">no function matches</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
      {dockedQueue && (
        <div className="gc__queue" data-testid="docked-queue">
          {subject ? <DisplayQueue compact queue={ev ? ev.queue : null} generating={ev?.generating} id={subject} title={subject === fm?.result && !selBox ? 'result (what the target field reads)' : 'selected box'} />
            : <span className="muted">No box yet.</span>}
        </div>
      )}
    </div>
  );
}
