// PROTOTYPE (#10, throwaway). Variant (b) "One data-flow canvas": the WHOLE mapping on one React
// Flow canvas: source fields left, all boxes in between, target fields right, one dagre layout.
// The structure trees are a collapsible side drawer used only to add fields.
import { Button, Switch, ToggleGroup, ToggleGroupItem } from '@patternfly/react-core';
import {
  Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { findBox, inputNames, isOrphanedBox } from '../model/derive';
import { newAuthoringId } from '../model/ids';
import { addBox, connect, setParam } from '../model/ops';
import { shortPath } from '../model/structures';
import type { AuthoringId, FieldPath } from '../model/types';
import { layoutDagre, loadManual, resetManual, saveManual, wholeMappingGraph } from '../layout/autoLayout';
import { DisplayQueue } from '../shared/DisplayQueue';
import { useEditor } from '../shared/editorState';
import { FieldTree } from '../shared/FieldTree';
import { nodeTypes } from '../shared/flowNodes';
import { StatusMarker, useStatus } from '../shared/StatusMarker';

export function VariantB() {
  return (
    <ReactFlowProvider>
      <WholeCanvas />
    </ReactFlowProvider>
  );
}

function WholeCanvas() {
  const ed = useEditor();
  const { model, update, src, tgt, run, select, field, box: selBox, errorsByPath } = ed;
  const url = new URLSearchParams(location.search);
  const [visibleOnly, setVisibleOnly] = useState(url.get('visibleOnly') === '1');
  const [copies, setCopies] = useState(Number(url.get('scale') ?? 1));
  const [treesOpen, setTreesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [layoutGen, setLayoutGen] = useState(0);
  const [layoutMs, setLayoutMs] = useState(0);
  const rf = useReactFlow();
  const status = useStatus();
  (window as unknown as Record<string, unknown>).__protoRf = rf;

  const onParam = useCallback((id: AuthoringId, name: string, value: string) => {
    const f = findBox(model, id);
    if (f) update((m) => setParam(m, f.path, id, name, value));
  }, [model, update]);

  const computed = useMemo(() => {
    const t0 = performance.now();
    const g = wholeMappingGraph(model, copies);
    const auto = layoutDagre(g);
    const ms = performance.now() - t0;
    const manual = loadManual('b', g.nodes.map((n) => n.id));
    const errorsByBox = new Map<string, string[]>();
    for (const errs of errorsByPath.values()) for (const e of errs) if ('boxId' in e && e.boxId) errorsByBox.set(e.boxId, [...(errorsByBox.get(e.boxId) ?? []), e.message]);
    const nodes: Node[] = g.nodes.map((n) => {
      const position = manual[n.id] ?? auto[n.id];
      const [base, copy] = n.id.split('~');
      const readOnly = !!copy;
      if (base.startsWith('field:')) {
        const p = base.slice(6);
        return { id: n.id, type: 'field', position, data: { path: p, side: 'source', orphaned: !src.fields.has(p) }, connectable: false };
      }
      if (base.startsWith('target:')) {
        const p = base.slice(7);
        return { id: n.id, type: 'field', position, data: { path: p, side: 'target', status: status(p) } };
      }
      const f = findBox(model, base)!;
      return {
        id: n.id, type: 'box', position,
        data: { box: f.box, id: base, inputNames: inputNames(model, f.box), orphaned: isOrphanedBox(f.box, src), errors: errorsByBox.get(base) ?? [], src, editable: !readOnly, onParam }
      };
    });
    const edges: Edge[] = g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: 'out', targetHandle: e.targetHandle }));
    return { nodes, edges, ms };
  }, [model, copies, src, errorsByPath, onParam, status, layoutGen]);

  const [nodes, setNodes] = useState<Node[]>(computed.nodes);
  useEffect(() => { setNodes(computed.nodes); setLayoutMs(computed.ms); }, [computed]);
  // Default view: the top of the graph at a readable zoom; ?fit=all (or the fit button) shows everything.
  useEffect(() => {
    setTimeout(() => {
      if (url.get('fit') === 'all' || copies > 1) { rf.fitView({ padding: 0.05 }); return; }
      const top = [...computed.nodes].sort((a, b) => a.position.y - b.position.y).slice(0, 30);
      rf.fitView({ nodes: top, padding: 0.05, maxZoom: 1 });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copies, rf]);
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((ns) => applyNodeChanges(ch, ns)), []);

  const owner = (nodeId: string): FieldPath | null => {
    if (nodeId.includes('~')) return null;
    if (nodeId.startsWith('target:')) return nodeId.slice(7);
    return findBox(model, nodeId)?.path ?? null;
  };
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const a = owner(c.source), b = owner(c.target);
    if (!a || !b) return;
    if (a !== b) {
      setNotice(`Refused: ${c.source} belongs to ${shortPath(a).split('/').pop()}, ${c.target.replace('target:', '')} to ${shortPath(b).split('/').pop()}. ADR-0010: a box of another target field mapping cannot be referenced in milestone 1.`);
      return;
    }
    const idx = Number((c.targetHandle ?? 'in-0').slice(3));
    update((m) => connect(m, a, c.source!, c.target!.startsWith('target:') ? 'target' : c.target!, idx));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const path = e.dataTransfer.getData('application/x-field-path');
    if (!path) return;
    if (!field) { setNotice('Select a target field first: a new box must belong to one target field mapping.'); return; }
    const id = newAuthoringId();
    saveManual('b', id, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    update((m) => addBox(m, field, { kind: 'source', field: path }, id)[0]);
    setNotice(`Added a source-field box to the mapping of ${shortPath(field).split('/').pop()}.`);
  };

  const subject = selBox ? run.boxQueues.get(selBox) : field ? run.boxQueues.get(model.targetFieldMappings[field]?.result ?? '') : undefined;
  return (
    <div className="vb" data-testid="variant-b">
      {treesOpen && (
        <aside className="vb__trees">
          <div className="vb__treeshead">Drag a source field onto the canvas. It joins the mapping of the selected target field{field ? `: ${shortPath(field).split('/').pop()}` : ' (none selected)'}.</div>
          <FieldTree structure={src} testId="b-source-tree" draggable dense />
          <FieldTree structure={tgt} testId="b-target-tree" dense selected={field} onSelect={(p) => select(p, null)} marker={(p) => <StatusMarker path={p} />} />
        </aside>
      )}
      <div className="vb__canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ReactFlow
          nodes={nodes} edges={computed.edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onConnect={onConnect}
          onNodeDragStop={(_e, n) => saveManual('b', n.id, n.position)}
          onNodeClick={(_e, n) => {
            if (n.id.includes('~')) return;
            if (n.id.startsWith('target:')) select(n.id.slice(7), null);
            else if (n.type === 'box') select(findBox(model, n.id)?.path ?? null, n.id);
          }}
          onlyRenderVisibleElements={visibleOnly} minZoom={0.02} maxZoom={2} deleteKeyCode={null}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
          <Panel position="top-left" className="vb__toolbar">
            <Button size="sm" variant={treesOpen ? 'primary' : 'secondary'} onClick={() => setTreesOpen(!treesOpen)}>Structures</Button>
            <Switch id="vis-only" label="onlyRenderVisibleElements" isChecked={visibleOnly} onChange={(_e, v) => setVisibleOnly(v)} />
            <ToggleGroup aria-label="scale" isCompact>
              {[1, 5, 10].map((n) => <ToggleGroupItem key={n} text={`×${n}`} isSelected={copies === n} onChange={() => setCopies(n)} />)}
            </ToggleGroup>
            <Button size="sm" variant="link" onClick={() => { resetManual('b', nodes.map((n) => n.id)); setLayoutGen((g) => g + 1); }}>Reset layout</Button>
            <span className="muted">{nodes.length} nodes · {computed.edges.length} edges · dagre {layoutMs.toFixed(0)} ms{copies > 1 ? ' · copies are read-only' : ''}</span>
          </Panel>
          {notice && <Panel position="top-center" className="vb__notice" onClick={() => setNotice(null)}>{notice} ✕</Panel>}
          {(selBox || field) && (
            <Panel position="top-right" className="vb__queue">
              <DisplayQueue compact queue={subject ? subject.queue : null} generating={subject?.generating} id={selBox ?? model.targetFieldMappings[field ?? '']?.id}
                title={selBox ? `box of ${shortPath(field ?? '').split('/').pop()}` : `${shortPath(field ?? '').split('/').pop()} (target field)`} />
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}
