import { Modal, ModalBody, ModalHeader } from '@patternfly/react-core';
import { CopyIcon, CubeIcon, LayerGroupIcon, ListIcon, PasteIcon, TrashIcon } from '@patternfly/react-icons';
import {
  Background,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type FinalConnectionState,
  type OnConnectStartParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { useStore } from 'zustand';
import type { FunctionCatalogue as Catalogue } from '../../../api/client';
import type { BrowserStateStore } from '../../../editor/browser-state/browser-state';
import { selectTrace, selectTraceStale, type WorkingCopyStore } from '../../../editor/store/working-copy';
import type { BoxPosition, FieldPath, MappingModel } from '../../../generated/mapping-model';
import type { CommandResult } from '../../../model/command';
import { stepName } from '../../../model/field-path';
import { rewire, type WireEnd } from '../../../model/rewire';
import { properAncestors } from '../../../model/set-context';
import { setResult, wire } from '../../../model/wire';
import { PreviewBadge } from '../../mock/PreviewBadge';
import { QueueDialog } from '../../test/QueueDialog';
import type { Side } from '../definition-model';
import { SideBySide } from '../SplitLayout';
import { action, ActionMenu, deleteAction, isContextMenuKey, useActionMenu, type MenuItem } from './ActionMenu';
import { expressionGraph, inspectExpression, NODE_WIDTH, portId, TARGET, upstream, wireEnd, type ExpressionEdge, type ExpressionNode } from './expression-graph';
import { arrange, layoutOf, shownPositions, type Positions } from './expression-layout';
import './expression.css';
import { FunctionCatalogue, functionDragType } from './FunctionCatalogue';
import { FunctionParameters } from './FunctionParameters';
import { MappingHint } from './MappingHint';
import { MappingNode, nodeRole, type MappingFlowNode } from './MappingNode';

const types = { mapping: MappingNode };
const fixedView = { minZoom: 1, maxZoom: 1, padding: 0 };
const EDGE_COLOR = '#567187';

/** The wire end a wire ends at. */
const endOf = (edge: ExpressionEdge): WireEnd => (edge.target === TARGET ? 'target' : { box: edge.target, slot: edge.slot! });

/** The input handle a wire ends at. */
const handleOf = (edge: ExpressionEdge) => portId(edge.slot ?? 0);

/** A wire from `source` into a handle, or `moving` moved there: the rewire command, else the wire or set result command. */
function connection(model: MappingModel, targetField: FieldPath, source: string, target: string, handle: string | null | undefined, moving?: ExpressionEdge): CommandResult {
  const to = wireEnd(target, handle);
  if (moving) return rewire(model, { targetField, source, from: endOf(moving), to });
  return to === 'target' ? setResult(model, { targetField, box: source }) : wire(model, { targetField, source, target: to.box, slot: to.slot });
}

/** The prototype's ViewFit: the first view fits the nodes at zoom 1, an added node off screen is centred, a resize keeps the centre. */
function ViewFit({ nodeIds, host }: { nodeIds: string; host: RefObject<HTMLElement | null> }) {
  const flow = useReactFlow();
  const initialized = useNodesInitialized();
  const lastIds = useRef<string[] | null>(null);
  useEffect(() => {
    if (!initialized) return;
    const ids = JSON.parse(nodeIds) as string[];
    const before = lastIds.current;
    lastIds.current = ids;
    // the first view is the canvas's own fitView; a queued fitView call would run at the next node change instead
    if (!before) return;
    const added = ids.findLast((id) => !before.includes(id));
    if (!added) return;
    const bounds = flow.getNodesBounds([added]);
    const rect = host.current!.getBoundingClientRect();
    const pos = flow.flowToScreenPosition({ x: bounds.x, y: bounds.y });
    if (pos.x < rect.left || pos.x + bounds.width > rect.right || pos.y < rect.top || pos.y + bounds.height > rect.bottom) {
      void flow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { zoom: 1 });
    }
  }, [initialized, nodeIds, host, flow]);
  useEffect(() => {
    let previous: { width: number; height: number } | null = null;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (width && height && previous) {
        const view = flow.getViewport();
        void flow.setViewport({ x: view.x + (width - previous.width) / 2, y: view.y + (height - previous.height) / 2, zoom: 1 });
      }
      previous = width && height ? { width, height } : null;
    });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, [host, flow]);
  return null;
}

export interface CanvasProps {
  store: WorkingCopyStore;
  targetField: FieldPath;
  catalogue: Catalogue;
  browserState: BrowserStateStore;
  /** The type icon of each field by side: `structure` or a value type's local name. */
  fieldTypes: Record<Side, ReadonlyMap<FieldPath, string>>;
  /** Selects a field in its pane (the node menu's Find Field). */
  findField: (side: Side, path: FieldPath) => void;
}

function Drawing({ store, targetField, catalogue, browserState, fieldTypes, findField }: CanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const edgeDrag = useRef<string | null>(null);
  const inputDrag = useRef<ExpressionEdge | undefined>(undefined);
  const flow = useReactFlow();
  const model = useStore(store, (s) => s.workingCopy);
  const editing = useStore(store, (s) => s.editing);
  const canPaste = useStore(store, (s) => s.clipboard !== null);
  const trace = useStore(store, selectTrace);
  const stale = useStore(store, selectTraceStale);
  const mapping = model.targetFieldMappings?.[targetField];
  const graph = useMemo(() => expressionGraph(targetField, mapping, catalogue, model.udfs), [targetField, mapping, catalogue, model.udfs]);
  const shown = useMemo(() => shownPositions(graph, mapping?.layout), [graph, mapping?.layout]);
  const { states, floating } = useMemo(() => inspectExpression(graph), [graph]);
  const edgeById = useMemo(() => new Map(graph.edges.map((e) => [e.id, e])), [graph]);
  const [moving, setMoving] = useState<Positions>({});
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [parameters, setParameters] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** The node whose Display Queue is open. */
  const [queue, setQueue] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const { menu, showMenu, closeMenu } = useActionMenu();
  const actions = store.getState();
  const selectedNode = graph.nodes.find((n) => selected.has(n.id));

  const canConnect = (source: string, target: string, handle: string | null | undefined, moving?: ExpressionEdge) => {
    const result = connection(model, targetField, source, target, handle, moving);
    return result.kind === 'applied' && result.model !== model;
  };
  const connect = (source: string, target: string, handle: string | null | undefined, moving?: ExpressionEdge) => {
    const to = wireEnd(target, handle);
    if (moving) actions.rewire(targetField, source, endOf(moving), to);
    else if (to === 'target') actions.setResult(targetField, source);
    else actions.wire(targetField, source, to.box, to.slot);
  };
  const disconnect = (edge: ExpressionEdge) => {
    if (edge.target === TARGET) actions.setResult(targetField, null);
    else actions.unwire(targetField, edge.target, edge.slot!);
  };
  const togglePalette = () => setPaletteOpen(!paletteOpen);
  /** A spot below every node, for a function added by a click. */
  const freeSpot = (): BoxPosition => {
    const all = Object.values(shown);
    return { x: Math.min(...all.map((p) => p.x)), y: Math.max(...all.map((p) => p.y)) + 72 };
  };
  const addFunction = (fn: string, at: BoxPosition = freeSpot()) => actions.insertBox(targetField, fn, at, layoutOf(shown));
  const layOut = () => actions.setPositions(targetField, layoutOf(arrange(graph)));
  const deleteFloatingObjects = () => actions.deleteBoxes(floating);
  const copyBranch = (id: string) => {
    const branch = [...upstream(graph, id)];
    actions.copy(targetField, branch, Object.fromEntries(branch.map((box) => [box, shown[box]!])));
  };
  const paste = () => actions.paste(targetField, layoutOf(shown));

  const connectionActions = (from: ExpressionNode): MenuItem[] =>
    graph.nodes.flatMap((destination) =>
      destination.inputs
        .filter((port) => canConnect(from.id, destination.id, port.id))
        .map((port) => action(`${destination.name} · ${port.label}`, () => connect(from.id, destination.id, port.id), { key: `${destination.id} ${port.id}` })),
    );
  const nodeMenu = (event: ReactMouseEvent | KeyboardEvent, id: string, element: Element) => {
    const n = graph.nodes.find((item) => item.id === id)!;
    setSelected(new Set([id]));
    const items: MenuItem[] = [action('Display Queue', () => setQueue(id))];
    if (n.fn && catalogue[n.fn]?.params?.length) items.push(action('Properties', () => setParameters(id)));
    const destinations = editing && n.output ? connectionActions(n) : [];
    if (destinations.length) items.push(action('Connect to', null, { children: destinations }));
    const wired = graph.edges.some((e) => e.source === id || e.target === id);
    items.push(
      action('Disconnect', () => (n.kind === 'target' ? actions.setResult(targetField, null) : actions.disconnectBox(targetField, id)), { disabled: !editing || !wired }),
      deleteAction('Delete', () => actions.deleteBoxes([id]), { disabled: !editing || n.kind === 'target' }),
    );
    if (n.kind !== 'function') items.push(action('Find Field', () => findField(n.kind === 'source' ? 'source' : 'target', n.path!)));
    if (n.kind !== 'target') items.push(action('Copy', () => copyBranch(id)));
    if (n.kind === 'source') {
      const choices = properAncestors(n.path!);
      const context = n.context ?? choices[0];
      items.push(
        action('Context', null, {
          disabled: !editing || choices.length === 0,
          children: choices.map((c) => action(stepName(c), () => actions.setContext(targetField, id, c), { key: c, checked: c === context })),
        }),
      );
    }
    showMenu(event, `Node actions for ${n.name}`, items, element);
  };
  const canvasMenu = (event: ReactMouseEvent | MouseEvent | KeyboardEvent) =>
    showMenu(
      event,
      'Canvas actions',
      [
        deleteAction('Delete Floating Objects', deleteFloatingObjects, { disabled: !editing || floating.length === 0 }),
        action('Lay Out Mapping', layOut, { disabled: !editing }),
        action('Paste', paste, { disabled: !editing || !canPaste }),
      ],
      host.current,
    );
  const edgeMenu = (event: ReactMouseEvent | KeyboardEvent, edge: ExpressionEdge, element: Element) =>
    showMenu(event, 'Connection actions', [action('Disconnect', () => disconnect(edge), { disabled: !editing })], element);

  const onCanvasKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isContextMenuKey(event)) return;
    const target = event.target as Element;
    const element = target.closest<HTMLElement>('.react-flow__node');
    if (element) return nodeMenu(event, element.dataset.id!, element);
    const edgeElement = target.closest<HTMLElement>('.react-flow__edge');
    if (edgeElement) return edgeMenu(event, edgeById.get(edgeElement.dataset.id!)!, edgeElement);
    canvasMenu(event);
  };
  const startPortDrag = (_: unknown, port: OnConnectStartParams) => {
    if (edgeDrag.current || port.handleType !== 'target') return;
    inputDrag.current = graph.edges.find((e) => e.target === port.nodeId && handleOf(e) === port.handleId);
  };
  const endPortDrag = (_: unknown, state: FinalConnectionState) => {
    const edge = inputDrag.current;
    const to = state.toHandle;
    inputDrag.current = undefined;
    // React Flow connects an output to an input; an occupied input dragged onto another input moves the wire's end there
    if (edge && to?.type === 'target' && (edge.target !== to.nodeId || handleOf(edge) !== to.id)) connect(edge.source, to.nodeId, to.id, edge);
  };
  const onNodesChange = (changes: NodeChange<MappingFlowNode>[]) => {
    const sizes = changes.flatMap((c) => (c.type === 'dimensions' && c.dimensions ? [c] : []));
    if (sizes.length) setMeasured((previous) => ({ ...previous, ...Object.fromEntries(sizes.map((c) => [c.id, c.dimensions!])) }));
    const selections = changes.flatMap((c) => (c.type === 'select' ? [c] : []));
    if (selections.length) {
      setSelected((previous) => {
        const next = new Set(previous);
        for (const c of selections) {
          if (c.selected) next.add(c.id);
          else next.delete(c.id);
        }
        return next;
      });
    }
    const moves = changes.flatMap((c) => (c.type === 'position' && c.position ? [c] : []));
    const live = moves.filter((c) => c.dragging);
    if (live.length) setMoving((previous) => ({ ...previous, ...Object.fromEntries(live.map((c) => [c.id, c.position!])) }));
    const ended = moves.filter((c) => !c.dragging);
    if (ended.length) {
      setMoving({});
      actions.setPositions(targetField, layoutOf({ ...shown, ...Object.fromEntries(ended.map((c) => [c.id, c.position!])) }));
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const selections = changes.flatMap((c) => (c.type === 'select' ? [c] : []));
    if (selections.length === 0) return;
    setSelected((previous) => {
      const next = new Set(previous);
      for (const c of selections) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  };
  const onDelete = ({ nodes: gone, edges: cut }: { nodes: MappingFlowNode[]; edges: Edge[] }) => {
    const boxes = gone.map((n) => n.id);
    if (boxes.length) actions.deleteBoxes(boxes);
    else for (const e of cut) disconnect(edgeById.get(e.id)!);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    const fn = event.dataTransfer.getData(functionDragType);
    if (!editing || !fn) return;
    const at = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    addFunction(fn, { x: at.x - NODE_WIDTH / 2, y: at.y - 24 });
  };

  const nodes: MappingFlowNode[] = graph.nodes.map((n) => {
    const state = states.get(n.id)!;
    const settings = Object.entries(n.params ?? {})
      .flatMap(([name, value]) => (typeof value === 'string' ? [`${name} ${value}`] : []))
      .join(' · ');
    return {
      id: n.id,
      type: 'mapping',
      position: moving[n.id] ?? shown[n.id]!,
      data: {
        node: n,
        state,
        fieldType: n.path === undefined ? undefined : fieldTypes[n.kind === 'source' ? 'source' : 'target'].get(n.path),
        ...(n.fn && catalogue[n.fn]?.params?.length && { editParameters: () => setParameters(n.id) }),
        ...(settings && { settings }),
      },
      measured: measured[n.id],
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selected: selected.has(n.id),
      deletable: n.kind !== 'target',
      ariaLabel: `${nodeRole(n)} ${n.name}. ${state.description}`,
    };
  });
  const edges: Edge[] = graph.edges.map((e) => {
    const on = selected.has(e.id);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: 'out',
      targetHandle: handleOf(e),
      type: 'smoothstep',
      selected: on,
      markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: EDGE_COLOR },
      style: { stroke: on ? '#0066cc' : EDGE_COLOR, strokeWidth: on ? 3 : 2 },
    };
  });
  const editingBox = parameters === null ? undefined : graph.nodes.find((n) => n.id === parameters);

  return (
    <section className="canvas-panel panel" aria-label="Field mapping canvas">
      <SideBySide
        className="expression-workspace"
        label="Resize functions panel"
        leftId="mapping-functions"
        browserState={browserState}
        widthKey="definition.functions.width"
        initialShare={0.1}
        showDivider={paletteOpen}
      >
        <aside id="mapping-functions" className="mapping-functions" hidden={!paletteOpen}>
          <h3>Functions</h3>
          {paletteOpen && <FunctionCatalogue catalogue={catalogue} disabled={!editing} add={(fn) => addFunction(fn)} />}
        </aside>
        <div className="expression-drawing">
          <div className="function-rail" role="toolbar" aria-label="Mapping tools" aria-orientation="vertical">
            <button
              type="button"
              aria-label={paletteOpen ? 'Hide functions' : 'Show functions'}
              title={paletteOpen ? 'Hide functions' : 'Show functions'}
              aria-controls="mapping-functions"
              aria-expanded={paletteOpen}
              onClick={togglePalette}
            >
              <LayerGroupIcon />
            </button>
            <button type="button" disabled={!editing} aria-label="Add node" title="Add node" onClick={() => setAdding(true)}>
              <CubeIcon />
            </button>
            <button
              type="button"
              disabled={!selectedNode}
              aria-label="Display Queue"
              title="Display Queue: the queue of the selected node in the last test run"
              onClick={() => setQueue(selectedNode!.id)}
            >
              <ListIcon />
            </button>
            <button
              type="button"
              disabled={!editing || floating.length === 0}
              aria-label="Delete Floating Objects"
              title="Delete Floating Objects: remove all objects with no path to the target"
              onClick={deleteFloatingObjects}
            >
              <TrashIcon />
            </button>
            <button type="button" aria-label="Layout mapping" title="Lay Out Mapping" disabled={!editing} onClick={layOut}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M8 5h3v14H8m3-7h5" />
                <g fill="currentColor" stroke="none">
                  <rect x="1" y="2" width="7" height="6" rx="1.2" />
                  <rect x="1" y="16" width="7" height="6" rx="1.2" />
                  <rect x="16" y="9" width="7" height="6" rx="1.2" />
                </g>
              </svg>
            </button>
            <button type="button" disabled={!selectedNode || selectedNode.kind === 'target'} aria-label="Copy" title="Copy" onClick={() => copyBranch(selectedNode!.id)}>
              <CopyIcon />
            </button>
            <button type="button" disabled={!editing || !canPaste} aria-label="Paste" title="Paste" onClick={paste}>
              <PasteIcon />
            </button>
          </div>
          <div className="flow-host" ref={host} role="group" aria-label="Mapping canvas" tabIndex={0} onKeyDown={onCanvasKey} onDragOver={(e) => e.preventDefault()} onDrop={drop}>
            <ReactFlow<MappingFlowNode>
              nodes={nodes}
              edges={edges}
              nodeTypes={types}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onDelete={onDelete}
              onConnect={(c: Connection) => connect(c.source, c.target, c.targetHandle, inputDrag.current)}
              onConnectStart={startPortDrag}
              onConnectEnd={endPortDrag}
              nodesDraggable={editing}
              nodesConnectable={editing}
              edgesReconnectable={editing}
              reconnectRadius={10}
              connectionRadius={15}
              onReconnectStart={(_, edge) => {
                edgeDrag.current = edge.id;
              }}
              onReconnectEnd={() => {
                edgeDrag.current = null;
              }}
              onReconnect={(edge, c) => connect(c.source, c.target, c.targetHandle, edgeById.get(edge.id))}
              onEdgeContextMenu={(event, edge) => edgeMenu(event, edgeById.get(edge.id)!, event.currentTarget as Element)}
              isValidConnection={(c) => canConnect(c.source, c.target, c.targetHandle, edgeById.get(edgeDrag.current ?? '') ?? inputDrag.current)}
              onNodeContextMenu={(event, n) => nodeMenu(event, n.id, (event.target as Element).closest('.react-flow__node')!)}
              onNodeDoubleClick={(_, n) => {
                if (n.data.editParameters) setParameters(n.id);
              }}
              onPaneContextMenu={canvasMenu}
              minZoom={1}
              maxZoom={1}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              zoomActivationKeyCode={null}
              panOnScroll
              onlyRenderVisibleElements={false}
              nodesFocusable
              edgesFocusable
              deleteKeyCode={editing ? ['Delete', 'Backspace'] : null}
              proOptions={{ hideAttribution: true }}
              fitView
              fitViewOptions={fixedView}
            >
              <Background gap={18} size={1} color="#bfd0d9" />
              <ViewFit nodeIds={JSON.stringify(nodes.map((n) => n.id))} host={host} />
            </ReactFlow>
            <MappingHint host={host} />
          </div>
        </div>
      </SideBySide>
      <footer className="canvas-footer">
        <span>
          {nodes.length} nodes <i>·</i> {edges.length} connections
        </span>
        <span className="mapping-legend" aria-label="Mapping status key">
          <span>✓ Complete</span>
          <span>! Incomplete</span>
          <span>– No target path</span>
        </span>
      </footer>
      {editingBox && (
        <FunctionParameters
          fn={editingBox.fn!}
          params={catalogue[editingBox.fn!]!.params!}
          values={editingBox.params}
          readOnly={!editing}
          close={() => setParameters(null)}
          save={(params) => {
            actions.setParams(targetField, editingBox.id, params, catalogue);
            setParameters(null);
          }}
        />
      )}
      {adding && (
        <Modal isOpen variant="small" aria-label="Add node" onClose={() => setAdding(false)}>
          <ModalHeader title="Add node" />
          <ModalBody>
            <FunctionCatalogue
              catalogue={catalogue}
              add={(fn) => {
                addFunction(fn);
                setAdding(false);
              }}
            />
            <p className="muted">
              Variables <PreviewBadge feature="Variables" issue={163} />
            </p>
          </ModalBody>
        </Modal>
      )}
      {queue !== null && (
        <QueueDialog graph={graph} nodeId={queue} trace={trace} stale={stale} mappingId={mapping?.id} browserState={browserState} onClose={() => setQueue(null)} />
      )}
      <ActionMenu menu={menu} onClose={closeMenu} />
    </section>
  );
}

/** The mapping expression canvas of one target field mapping (the prototype's Canvas), with its functions drilldown and tools. */
export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Drawing {...props} />
    </ReactFlowProvider>
  );
}
