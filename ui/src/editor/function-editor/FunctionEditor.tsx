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
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import type { ApiClient, FunctionCatalogue } from '../../api/client';
import type { AuthoringId, FieldPath, TargetFieldMapping, Udfs } from '../../generated/mapping-model';
import { SOURCE_FIELD_DRAG } from '../store/drag';
import type { WorkingCopyStore } from '../store/working-copy';
import { boxIds, boxView, liveMarks, reachable, SINK, stepName, wires, type BoxView } from './graph';
import { arrange, BOX, place, type Positions } from './layout';
import { FUNCTION_DRAG } from './palette';
import { PaletteView } from './PaletteView';
import { QuickInsert } from './QuickInsert';

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
  /** Remaps an orphaned source-field box of a target field mapping to a dropped source field. */
  onRemap: (targetField: FieldPath, box: AuthoringId, field: FieldPath) => void;
}

/**
 * The function editor (ADR-0012): the palette, and the canvas with the function graph of the selected target field
 * mapping, its boxes and wires and a sink for the target field. Dropping a palette entry inserts a box, also into a
 * target field without a mapping. Boxes that `result` cannot reach are dimmed. An orphaned source-field box is marked,
 * and a source row dropped on it remaps it. Positions and zoom are browser state only; moving a box never touches the
 * working copy.
 *
 * The canvas takes the focus and its keys: `/` or a typed character opens quick insert, Delete deletes the selected
 * box, Ctrl+C copies the selected boxes and Ctrl+V pastes them. A key typed into a field inside the canvas, quick
 * insert's own, is the field's.
 */
export function FunctionEditor({ api, store, targetField, canvasState, orphaned, onRemap }: FunctionEditorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const mapping = useStore(store, (s) => (targetField === null ? undefined : s.workingCopy.targetFieldMappings?.[targetField]));
  const udfs = useStore(store, (s) => s.workingCopy.udfs);
  const selection = useStore(store, (s) => s.selection);
  // the store's selection may be a box of another target field mapping: it is not on this canvas
  const selectedBox = mapping !== undefined && selection !== null && Object.hasOwn(mapping.boxes, selection) ? selection : null;
  const canvas = useRef<HTMLDivElement>(null);
  /** The search quick insert opened with; `null` while it is closed. */
  const [quickInsert, setQuickInsert] = useState<string | null>(null);
  const closeQuickInsert = (focusCanvas: boolean) => {
    setQuickInsert(null);
    if (focusCanvas) canvas.current!.focus();
  };

  const onKeyDown = (event: KeyboardEvent, field: FieldPath) => {
    if (event.target instanceof HTMLInputElement) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey && key === 'c') store.getState().copy(field);
    else if (event.ctrlKey && key === 'v') store.getState().paste(field);
    else if (event.key === 'Delete' && selectedBox !== null) {
      store.getState().deleteBox(selectedBox);
      // the deleted box may have had the focus
      canvas.current!.focus();
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
      setQuickInsert(event.key === '/' ? '' : event.key);
    } else return;
    event.preventDefault();
  };

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
            ref={canvas}
            data-testid={`canvas:${targetField}`}
            role="group"
            aria-label={`Canvas of ${stepName(targetField)}`}
            tabIndex={0}
            onKeyDown={(event) => onKeyDown(event, targetField)}
            style={{ flex: '1 1 24rem', minWidth: 0, position: 'relative' }}
            // only a palette entry drops here
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(FUNCTION_DRAG)) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              store.getState().insertBox(targetField, event.dataTransfer.getData(FUNCTION_DRAG));
            }}
          >
            {quickInsert !== null && (
              <QuickInsert
                catalogue={catalogue.data}
                initial={quickInsert}
                onInsert={(fn) => {
                  store.getState().insertBox(targetField, fn);
                  closeQuickInsert(true);
                }}
                onCancel={() => closeQuickInsert(true)}
                onLeave={() => closeQuickInsert(false)}
              />
            )}
            {mapping === undefined ? (
              <>
                <p>{stepName(targetField)} has no function graph yet.</p>
                <p>Drag a function here from the palette, or press / to insert one.</p>
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
                onRemap={onRemap}
                selectedBox={selectedBox}
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
  /** The store's selection when it is a box of this canvas. */
  selectedBox: AuthoringId | null;
}

function Canvas({ store, mapping, targetField, catalogue, udfs, canvasState, orphaned, onRemap, selectedBox }: CanvasProps) {
  const [opened] = useState(() => canvasState.read(mapping.id));
  const [positions, setPositions] = useState(() => (opened?.positions ? place(mapping, opened.positions) : arrange(mapping)));
  const [measured, setMeasured] = useState<Readonly<Record<string, { width: number; height: number }>>>({});
  const selected = useStore(store, (s) => s.selected);
  // the selected boxes of this canvas, in the order selected
  const chosen = selected.filter((id) => Object.hasOwn(mapping.boxes, id));
  const canPaste = useStore(store, (s) => s.clipboard?.targetField === targetField);

  // A box added or removed since the last render: place it and keep the others (ADR-0012, "Layout").
  const shown = place(mapping, positions, selectedBox);
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
        selected: chosen.includes(id),
        data: {
          view: boxView(mapping.boxes[id]!, catalogue, udfs),
          reachable: reached.has(id),
          unconnected: marks.unconnectedInputs[id] ?? [],
          remap: orphaned.has(id) ? (field) => onRemap(targetField, id, field) : undefined,
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
    // A click selects one box, Ctrl adds or removes one, the pane clears them: React Flow reports each as select changes.
    const selects = changes.filter((c) => c.type === 'select');
    if (selects.length > 0) {
      const next = new Set(chosen);
      for (const c of selects) {
        if (c.selected) next.add(c.id);
        else next.delete(c.id);
      }
      store.getState().selectBoxes([...next]);
    }
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
      </Button>{' '}
      <Button variant="secondary" isDisabled={chosen.length === 0} onClick={() => store.getState().copy(targetField)}>
        Copy
      </Button>{' '}
      <Button variant="secondary" isDisabled={!canPaste} onClick={() => store.getState().paste(targetField)}>
        Paste
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
