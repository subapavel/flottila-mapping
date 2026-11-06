import { Button } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, FunctionCatalogue } from '../../api/client';
import type { AuthoringId, FieldPath, TargetFieldMapping, Udfs } from '../../generated/mapping-model';
import type { WorkingCopyStore } from '../store/working-copy';
import { boxIds, boxView, reachable, SINK, stepName, wires, type BoxView } from './graph';
import { arrange, BOX, place, type Positions } from './layout';

/** A target field mapping's canvas in the browser state: its box positions and zoom (ADR-0012, ADR-0013). */
export interface CanvasState {
  positions?: Positions;
  viewport?: Viewport;
}

/** The browser state of the canvases, by target field mapping id. */
export interface CanvasStatePort {
  read(targetFieldMappingId: AuthoringId): CanvasState | undefined;
  write(targetFieldMappingId: AuthoringId, state: CanvasState): void;
}

export interface FunctionEditorProps {
  api: ApiClient;
  store: WorkingCopyStore;
  /** The selected target field, whose function graph the canvas shows. */
  targetField: FieldPath | null;
  selectedBox: AuthoringId | null;
  onSelectBox: (box: AuthoringId | null) => void;
  canvasState: CanvasStatePort;
}

/**
 * The function editor (ADR-0012): the canvas with the function graph of the selected target field mapping, its boxes
 * and wires and a sink for the target field. Boxes that `result` cannot reach are dimmed. Positions and zoom are
 * browser state only; moving a box never touches the working copy.
 */
export function FunctionEditor({ api, store, targetField, selectedBox, onSelectBox, canvasState }: FunctionEditorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const mapping = useStore(store, (s) => (targetField === null ? undefined : s.workingCopy.targetFieldMappings?.[targetField]));
  const udfs = useStore(store, (s) => s.workingCopy.udfs);

  return (
    <section aria-label="Function editor">
      {targetField === null ? (
        <p>Select a target field to see its function graph.</p>
      ) : mapping === undefined ? (
        <p>{stepName(targetField)} has no function graph yet.</p>
      ) : catalogue.isPending ? (
        <p>Loading the function catalogue…</p>
      ) : catalogue.isError ? (
        <p role="alert">{catalogue.error.message}</p>
      ) : (
        <Canvas
          key={mapping.id}
          mapping={mapping}
          targetField={targetField}
          catalogue={catalogue.data}
          udfs={udfs}
          selectedBox={selectedBox}
          onSelectBox={onSelectBox}
          canvasState={canvasState}
        />
      )}
    </section>
  );
}

type BoxNode = Node<{ view: BoxView; reachable: boolean }, 'box'>;
type SinkNode = Node<{ field: FieldPath }, 'sink'>;

const nodeTypes = { box: BoxNodeView, sink: SinkNodeView };

interface CanvasProps extends Omit<FunctionEditorProps, 'api' | 'store' | 'targetField'> {
  mapping: TargetFieldMapping;
  targetField: FieldPath;
  catalogue: FunctionCatalogue;
  udfs: Udfs | undefined;
}

function Canvas({ mapping, targetField, catalogue, udfs, selectedBox, onSelectBox, canvasState }: CanvasProps) {
  const [opened] = useState(() => canvasState.read(mapping.id));
  const [positions, setPositions] = useState(() => (opened?.positions ? place(mapping, opened.positions) : arrange(mapping)));
  const [measured, setMeasured] = useState<Readonly<Record<string, { width: number; height: number }>>>({});

  // A box added or removed since the last render: place it and keep the others (ADR-0012, "Layout").
  const shown = place(mapping, positions);
  if (shown !== positions) setPositions(shown);

  const keep = (state: CanvasState) => canvasState.write(mapping.id, { ...canvasState.read(mapping.id), ...state });
  const reached = reachable(mapping);
  const nodes: (BoxNode | SinkNode)[] = [
    ...boxIds(mapping).map(
      (id): BoxNode => ({
        id,
        type: 'box',
        position: shown[id]!,
        measured: measured[id],
        selected: id === selectedBox,
        data: { view: boxView(mapping.boxes[id]!, catalogue, udfs), reachable: reached.has(id) },
      }),
    ),
    { id: SINK, type: 'sink', position: shown[SINK]!, measured: measured[SINK], selectable: false, data: { field: targetField } },
  ];
  const edges: Edge[] = wires(mapping).map((w) => ({
    id: w.id,
    source: w.source,
    target: w.target,
    targetHandle: w.slot === undefined ? undefined : `in-${w.slot}`,
  }));

  const change = (changes: NodeChange<BoxNode | SinkNode>[]) => {
    const moved: Record<string, { x: number; y: number }> = {};
    const sized: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (c.type === 'position' && c.position) moved[c.id] = c.position;
      if (c.type === 'dimensions' && c.dimensions) sized[c.id] = c.dimensions;
    }
    setPositions((p) => ({ ...p, ...moved }));
    setMeasured((m) => ({ ...m, ...sized }));
    const selects = changes.filter((c) => c.type === 'select');
    if (selects.length > 0) onSelectBox(selects.find((c) => c.selected)?.id ?? null);
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setPositions(arrange(mapping));
          canvasState.write(mapping.id, { viewport: canvasState.read(mapping.id)?.viewport });
        }}
      >
        Arrange
      </Button>
      <div style={{ height: '24rem' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={change}
          onNodeDragStop={(_event, _node, dragged) =>
            keep({ positions: { ...shown, ...Object.fromEntries(dragged.map((n) => [n.id, n.position])) } })
          }
          onMoveEnd={(_event, viewport) => keep({ viewport })}
          defaultViewport={opened?.viewport}
          fitView={opened?.viewport === undefined}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}

/** A box: its title, one input handle per input slot with the slot's name, and its output on the right. */
function BoxNodeView({ id, data }: NodeProps<BoxNode>) {
  return (
    <div
      data-testid={`box:${id}`}
      style={{
        width: BOX.width,
        minHeight: BOX.height,
        opacity: data.reachable ? 1 : 0.4,
        border: '1px solid var(--pf-t--global--border--color--default, #8a8d90)',
        borderRadius: 4,
        background: 'var(--pf-t--global--background--color--primary--default, #fff)',
        padding: '0.25rem 0.5rem',
      }}
    >
      <strong>{data.view.title}</strong>
      {data.view.slots.map((name, slot) => (
        <div key={slot} style={{ position: 'relative' }}>
          <Handle type="target" position={Position.Left} id={`in-${slot}`} />
          {name}
        </div>
      ))}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** The sink: the target field, fed by `result`. */
function SinkNodeView({ data }: NodeProps<SinkNode>) {
  return (
    <div
      data-testid={`sink:${data.field}`}
      style={{ width: BOX.width, minHeight: BOX.height, border: '2px solid var(--pf-t--global--border--color--default, #8a8d90)', padding: '0.25rem 0.5rem' }}
    >
      <Handle type="target" position={Position.Left} />
      {stepName(data.field)}
    </div>
  );
}
