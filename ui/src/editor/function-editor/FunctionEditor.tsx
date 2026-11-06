import { Button } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, FunctionCatalogue } from '../../api/client';
import type { AuthoringId, FieldPath, TargetFieldMapping, Udfs } from '../../generated/mapping-model';
import { SOURCE_FIELD_DRAG } from '../store/drag';
import type { WorkingCopyStore } from '../store/working-copy';
import { boxIds, boxView, liveMarks, reachable, SINK, stepName, wires, type BoxView } from './graph';
import { arrange, BOX, place, type Positions } from './layout';
import { FUNCTION_DRAG } from './palette';
import { PaletteView } from './PaletteView';

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
  /** The working copy; it also holds the selected box (ADR-0013). */
  store: WorkingCopyStore;
  /** The selected target field, whose function graph the canvas shows. */
  targetField: FieldPath | null;
  canvasState: CanvasStatePort;
  /** The orphaned source-field boxes (GLOSSARY: Orphaned reference), marked on the canvas. */
  orphaned: ReadonlySet<AuthoringId>;
}

/**
 * The function editor (ADR-0012): the palette, and the canvas with the function graph of the selected target field
 * mapping, its boxes and wires and a sink for the target field. Dropping a palette entry inserts a box, also into a
 * target field without a mapping. Boxes that `result` cannot reach are dimmed. An orphaned source-field box is marked,
 * and a source row dropped on it remaps it. Positions and zoom are browser state only; moving a box never touches the
 * working copy.
 */
export function FunctionEditor({ api, store, targetField, canvasState, orphaned }: FunctionEditorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const mapping = useStore(store, (s) => (targetField === null ? undefined : s.workingCopy.targetFieldMappings?.[targetField]));
  const udfs = useStore(store, (s) => s.workingCopy.udfs);

  return (
    <section aria-label="Function editor">
      {targetField === null ? (
        <p>Select a target field to see its function graph.</p>
      ) : catalogue.isPending ? (
        <p>Loading the function catalogue…</p>
      ) : catalogue.isError ? (
        <p role="alert">{catalogue.error.message}</p>
      ) : (
        // the canvas goes below the palette when the two do not fit side by side
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <PaletteView catalogue={catalogue.data} />
          <div
            data-testid={`canvas:${targetField}`}
            style={{ flex: '1 1 24rem', minWidth: 0 }}
            // only a palette entry drops here
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(FUNCTION_DRAG)) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              store.getState().insertBox(targetField, event.dataTransfer.getData(FUNCTION_DRAG));
            }}
          >
            {mapping === undefined ? (
              <>
                <p>{stepName(targetField)} has no function graph yet.</p>
                <p>Drag a function here from the palette.</p>
              </>
            ) : (
              <Canvas
                key={mapping.id}
                store={store}
                mapping={mapping}
                targetField={targetField}
                catalogue={catalogue.data}
                udfs={udfs}
                canvasState={canvasState}
                orphaned={orphaned}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A box node's data; `remap` points an orphaned source-field box at a dropped source field, and is absent otherwise. */
type BoxNode = Node<{ view: BoxView; reachable: boolean; unconnected: number[]; remap?: (field: FieldPath) => void }, 'box'>;
type SinkNode = Node<{ field: FieldPath; connected: boolean }, 'sink'>;

const nodeTypes = { box: BoxNodeView, sink: SinkNodeView };

/** The input slot of an input handle id, `in-<slot>`. */
const slotOf = (handle: string) => Number(handle.slice('in-'.length));

interface CanvasProps extends Omit<FunctionEditorProps, 'api' | 'targetField'> {
  mapping: TargetFieldMapping;
  targetField: FieldPath;
  catalogue: FunctionCatalogue;
  udfs: Udfs | undefined;
}

function Canvas({ store, mapping, targetField, catalogue, udfs, canvasState, orphaned }: CanvasProps) {
  const [opened] = useState(() => canvasState.read(mapping.id));
  const [positions, setPositions] = useState(() => (opened?.positions ? place(mapping, opened.positions) : arrange(mapping)));
  const [measured, setMeasured] = useState<Readonly<Record<string, { width: number; height: number }>>>({});
  const selection = useStore(store, (s) => s.selection);
  // the store's selection may be a box of another target field mapping: it is not on this canvas
  const selectedBox = selection !== null && Object.hasOwn(mapping.boxes, selection) ? selection : null;

  // A box added or removed since the last render: place it and keep the others (ADR-0012, "Layout").
  const shown = place(mapping, positions);
  if (shown !== positions) setPositions(shown);

  const keep = (state: CanvasState) => canvasState.write(mapping.id, { ...canvasState.read(mapping.id), ...state });
  const reached = reachable(mapping);
  const marks = liveMarks(mapping, catalogue, udfs);
  const nodes: (BoxNode | SinkNode)[] = [
    ...boxIds(mapping).map(
      (id): BoxNode => ({
        id,
        type: 'box',
        position: shown[id]!,
        measured: measured[id],
        selected: id === selectedBox,
        data: {
          view: boxView(mapping.boxes[id]!, catalogue, udfs),
          reachable: reached.has(id),
          unconnected: marks.unconnectedInputs[id] ?? [],
          remap: orphaned.has(id) ? (field) => store.getState().remap(targetField, id, field) : undefined,
        },
      }),
    ),
    {
      id: SINK,
      type: 'sink',
      position: shown[SINK]!,
      measured: measured[SINK],
      selectable: false,
      data: { field: targetField, connected: !marks.resultUnconnected },
    },
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
    if (selects.length > 0) store.getState().select(selects.find((c) => c.selected)?.id ?? null);
  };

  /** A wire into the sink sets `result`; any other wire goes into an input slot. */
  const connect = ({ source, target, targetHandle }: Connection) => {
    if (target === SINK) store.getState().setResult(targetField, source);
    else store.getState().wire(targetField, source, target, slotOf(targetHandle!));
  };
  const disconnect = ({ target, targetHandle }: Edge) => {
    if (target === SINK) store.getState().setResult(targetField, null);
    else store.getState().unwire(targetField, target, slotOf(targetHandle!));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Delete' || selectedBox === null) return;
    event.preventDefault();
    store.getState().deleteBox(selectedBox);
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
      <div style={{ height: '24rem' }} onKeyDown={onKeyDown}>
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
          onConnect={connect}
          // A wire's end dropped off any input removes the wire. Dropped on an input, the wire stays as it was:
          // moving a wire's end is not offered; drag a new wire instead. onReconnect is what makes ends draggable.
          onReconnect={() => undefined}
          onReconnectEnd={(_event, edge, _handleType, connection) => {
            if (!connection.isValid) disconnect(edge);
          }}
          deleteKeyCode={null}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}

const MARK = { color: 'var(--pf-t--global--text--color--status--danger--default, #c9190b)' } as const;

/** Only a source row's drag may end on an orphaned source-field box; any other drag goes on to the canvas. */
const sourceFieldDrag = (event: DragEvent) => event.dataTransfer.types.includes(SOURCE_FIELD_DRAG);

/**
 * A box: its title, a constant's value, one input handle per input slot with the slot's name and a mark when it reads
 * no box, and its output on the right. An orphaned source-field box is marked and takes a dropped source row.
 */
function BoxNodeView({ id, data }: NodeProps<BoxNode>) {
  const { remap } = data;
  return (
    <div
      data-testid={`box:${id}`}
      onDragOver={
        remap &&
        ((event) => {
          if (sourceFieldDrag(event)) event.preventDefault();
        })
      }
      onDrop={
        remap &&
        ((event) => {
          if (!sourceFieldDrag(event)) return;
          event.preventDefault();
          event.stopPropagation();
          remap(event.dataTransfer.getData(SOURCE_FIELD_DRAG));
        })
      }
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
      {data.view.value !== undefined && <code data-testid={`value:${id}`}> {data.view.value}</code>}
      {remap && (
        <div data-testid={`orphaned:${id}`} title="The source structure has no such field: drop a source row here to remap" style={MARK}>
          Orphaned
        </div>
      )}
      {data.view.slots.map((name, slot) => (
        <div key={slot} style={{ position: 'relative' }}>
          <Handle type="target" position={Position.Left} id={`in-${slot}`} data-testid={`in:${id}#${slot}`} />
          {name}
          {data.unconnected.includes(slot) && (
            <span data-testid={`unconnected:${id}#${slot}`} title="Not connected" style={MARK}>
              {' '}
              !
            </span>
          )}
        </div>
      ))}
      <Handle type="source" position={Position.Right} data-testid={`out:${id}`} />
    </div>
  );
}

/** The sink: the target field, fed by `result`; marked while `result` is `null`. */
function SinkNodeView({ data }: NodeProps<SinkNode>) {
  return (
    <div
      data-testid={`sink:${data.field}`}
      style={{ width: BOX.width, minHeight: BOX.height, border: '2px solid var(--pf-t--global--border--color--default, #8a8d90)', padding: '0.25rem 0.5rem' }}
    >
      <Handle type="target" position={Position.Left} data-testid="in:sink" />
      {stepName(data.field)}
      {!data.connected && (
        <div data-testid="unconnected:sink" style={MARK}>
          No result connected
        </div>
      )}
    </div>
  );
}
