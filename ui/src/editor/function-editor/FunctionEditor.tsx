import { Button } from '@patternfly/react-core';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  BackgroundVariant,
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
import { localPath } from '../../model/field-path';
import { reachedBoxes } from '../../model/reached';
import { SOURCE_FIELD_DRAG } from '../store/drag';
import type { WorkingCopyStore } from '../store/working-copy';
import { boxIds, boxView, cardHeights, cardView, liveMarks, SINK, wires, type BoxView, type CardView } from './graph';
import { arrange, BOX, place, type Positions } from './layout';
import { FUNCTION_DRAG } from './palette';
import './function-editor.css';
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
 * target field without a mapping. A box that `result` cannot reach (an unreachable box) has a dashed border, a muted
 * head with a "not reached" mark, and a title saying so (F-31). An orphaned source-field box is marked,
 * and a source row dropped on it remaps it. Positions and zoom are browser state only; moving a box never touches the
 * working copy.
 *
 * The canvas takes the focus and its keys: `/` or a typed character opens quick insert, Delete deletes the selected
 * boxes as one undo step, Ctrl+C copies the selected boxes and Ctrl+V pastes them. A key typed into a field inside the canvas, quick
 * insert's own, is the field's.
 */
export function FunctionEditor({ api, store, targetField, canvasState, orphaned, onRemap }: FunctionEditorProps) {
  const catalogue = useQuery({ queryKey: ['catalogue'], queryFn: () => api.getCatalogue() });
  const mapping = useStore(store, (s) => (targetField === null ? undefined : s.workingCopy.targetFieldMappings?.[targetField]));
  const udfs = useStore(store, (s) => s.workingCopy.udfs);
  const selection = useStore(store, (s) => s.selection);
  const selected = useStore(store, (s) => s.selected);
  // the store's selection may be a box of another target field mapping: it is not on this canvas
  const selectedBox = mapping !== undefined && selection !== null && Object.hasOwn(mapping.boxes, selection) ? selection : null;
  const selectedBoxes = mapping === undefined ? [] : selected.filter((id) => Object.hasOwn(mapping.boxes, id));
  const canvas = useRef<HTMLDivElement>(null);
  /** The search quick insert opened with; `null` while it is closed. */
  const [quickInsert, setQuickInsert] = useState<string | null>(null);
  const closeQuickInsert = (focusCanvas: boolean) => {
    setQuickInsert(null);
    if (focusCanvas) canvas.current!.focus();
  };

  const onKeyDown = (event: KeyboardEvent, field: FieldPath) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const key = event.key.toLowerCase();
    if (event.ctrlKey && key === 'c') store.getState().copy(field);
    else if (event.ctrlKey && key === 'v') store.getState().paste(field);
    else if (event.key === 'Delete' && selectedBoxes.length > 0) {
      store.getState().deleteBoxes(selectedBoxes);
      // a deleted box may have had the focus
      canvas.current!.focus();
    } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
      setQuickInsert(event.key === '/' ? '' : event.key);
    } else return;
    event.preventDefault();
  };

  return (
    // the canvas fills the height the editor gives it and shrinks with its pane, down to 16rem; below that the pane
    // scrolls (ADR-0012, "splitter"; spec #135)
    <section aria-label="Function editor" className="fm-function-editor">
      {targetField === null ? (
        <p>Select a target field to see its function graph.</p>
      ) : catalogue.isPending ? (
        <p>Loading the function catalogue…</p>
      ) : catalogue.isError ? (
        <p role="alert">{catalogue.error.message}</p>
      ) : (
        // the canvas goes below the palette when the two do not fit side by side
        <div className="fm-function-editor__work">
          <PaletteView catalogue={catalogue.data} onInsert={(fn) => store.getState().insertBox(targetField, fn)} />
          <div
            ref={canvas}
            data-testid={`canvas:${targetField}`}
            role="group"
            aria-label={`Canvas of ${localPath(targetField)}`}
            tabIndex={0}
            onKeyDown={(event) => onKeyDown(event, targetField)}
            className="fm-function-editor__canvas"
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
                <p>{localPath(targetField)} has no function graph yet.</p>
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
                chosen={selectedBoxes}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A box node's data; `remap` points an orphaned source-field box at a dropped source field, and is absent otherwise. */
type BoxNode = Node<
  {
    view: BoxView;
    card: CardView;
    reachable: boolean;
    unconnected: number[];
    /** The card's edits: the same store commands as the inspector's, so a change is one undo step. */
    edit: { param: (name: string, value: string) => void; context: (context: FieldPath) => void };
    remap?: (field: FieldPath) => void;
  },
  'box'
>;
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
  /** The selected boxes of this canvas, in the order selected. */
  chosen: readonly AuthoringId[];
}

function Canvas({ store, mapping, targetField, catalogue, udfs, canvasState, orphaned, onRemap, selectedBox, chosen }: CanvasProps) {
  const [opened] = useState(() => canvasState.read(mapping.id));
  // each card's height from its content, so that no layout puts two cards over each other
  const heights = cardHeights(mapping, catalogue, udfs, orphaned);
  const [positions, setPositions] = useState(() => (opened?.positions ? place(mapping, opened.positions, null, heights) : arrange(mapping, heights)));
  const [measured, setMeasured] = useState<Readonly<Record<string, { width: number; height: number }>>>({});
  const canPaste = useStore(store, (s) => s.clipboard?.targetField === targetField);

  // A box added or removed since the last render: place it and keep the others (ADR-0012, "Layout").
  const shown = place(mapping, positions, selectedBox, heights);
  if (shown !== positions) setPositions(shown);

  const keep = (state: CanvasState) => canvasState.write(mapping.id, { ...canvasState.read(mapping.id), ...state });
  const reached = new Set(reachedBoxes(mapping));
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
          card: cardView(mapping.boxes[id]!, catalogue),
          reachable: reached.has(id),
          edit: {
            param: (name, value) => store.getState().setParam(targetField, id, name, value, catalogue),
            context: (context) => store.getState().setContext(targetField, id, context),
          },
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
      <div className="fm-toolbar">
        <strong className="fm-toolbar__title" title={targetField}>
          {localPath(targetField)}
        </strong>
        <code className="fm-toolbar__id">{mapping.id}</code>
        <span className="fm-toolbar__hint">type or press / on the canvas to insert a function</span>
        <span className="fm-toolbar__spacer" />
        <Button variant="secondary" isDisabled={chosen.length === 0} onClick={() => store.getState().copy(targetField)}>
          Copy ({chosen.length})
        </Button>
        <Button variant="secondary" isDisabled={!canPaste} onClick={() => store.getState().paste(targetField)}>
          Paste
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setPositions(arrange(mapping, heights));
            canvasState.write(mapping.id, { viewport: canvasState.read(mapping.id)?.viewport });
          }}
        >
          Arrange
        </Button>
      </div>
      <div className="fm-function-editor__flow">
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
          <Background variant={BackgroundVariant.Dots} gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </>
  );
}

/** Only a source row's drag may end on an orphaned source-field box; any other drag goes on to the canvas. */
const sourceFieldDrag = (event: DragEvent) => event.dataTransfer.types.includes(SOURCE_FIELD_DRAG);

/**
 * A box: its title, a constant's value, one input handle per input slot with the slot's name and a mark when it reads
 * no box, and its output on the right. An orphaned source-field box is marked and takes a dropped source row.
 */
function BoxNodeView({ id, data, selected }: NodeProps<BoxNode>) {
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
      // the width is the layout's; an unreachable box has a dashed border and a muted head, not a faded card (F-31)
      style={{ width: BOX.width }}
      title={data.reachable ? undefined : 'Not reached by the result'}
      className={`fm-card fm-card--${data.card.kind}${selected ? ' fm-card--selected' : ''}${remap ? ' fm-card--orphaned' : ''}${data.reachable ? '' : ' fm-card--unreachable'}`}
    >
      <div className="fm-card__head">
        <div className="fm-card__name">
          <span className="fm-card__kind">{data.card.caption}</span>
          <strong className="fm-card__title" title={data.view.path}>
            {data.view.title}
          </strong>
        </div>
        {(data.card.badges.length > 0 || !data.reachable) && (
          <div className="fm-card__marks">
            {data.card.badges.map((badge) => (
              <span key={badge.kind} className={`fm-fid fm-fid--${badge.kind}`} title={badge.kind === 'deviation' ? badge.text : undefined}>
                {badge.kind}
              </span>
            ))}
            {!data.reachable && <span className="fm-card__reach">not reached</span>}
          </div>
        )}
      </div>
      <code className="fm-card__id">{id}</code>
      {data.view.value !== undefined && (
        <code className="fm-card__value" data-testid={`value:${id}`}>
          {data.view.value}
        </code>
      )}
      {remap && (
        <div
          className="fm-card__mark fm-card__mark--block"
          data-testid={`orphaned:${id}`}
          title="The source structure has no such field: drop a source row here to remap"
        >
          Orphaned
        </div>
      )}
      {data.view.slots.map((name, slot) => (
        <div key={slot} className="fm-card__slot">
          <Handle type="target" position={Position.Left} id={`in-${slot}`} data-testid={`in:${id}#${slot}`} />
          {name}
          {data.unconnected.includes(slot) && (
            <span className="fm-card__mark" data-testid={`unconnected:${id}#${slot}`} title="Not connected">
              !
            </span>
          )}
        </div>
      ))}
      {data.card.context !== undefined && (
        <label className="fm-card__param">
          <span>read in</span>
          <select className="nodrag nokey" value={data.card.context.value} onChange={(event) => data.edit.context(event.target.value)}>
            {data.card.context.choices.map((choice) => (
              <option key={choice.path} value={choice.path}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {data.card.params.map((param) => (
        <label key={param.name} className="fm-card__param">
          <span>{param.name}</span>
          {param.table ? (
            <span title={param.text}>{param.text}</span>
          ) : !param.editable ? (
            <input className="nodrag nokey" readOnly value={param.text} />
          ) : param.values ? (
            <select className="nodrag nokey" value={param.text} onChange={(event) => data.edit.param(param.name, event.target.value)}>
              {param.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <CardText value={param.text} onSet={(value) => data.edit.param(param.name, value)} />
          )}
        </label>
      ))}
      <Handle type="source" position={Position.Right} data-testid={`out:${id}`} />
    </div>
  );
}

/**
 * A text param on a card: the author's draft is kept until the field loses the focus or Enter is pressed, as in the
 * inspector; a model change under it (undo, the inspector) shows the model's value. Neither a drag of the node nor a
 * canvas key starts from it.
 */
function CardText({ value, onSet }: { value: string; onSet: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => onSet(draft);
  return (
    <input
      className="nodrag nokey"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

/** The sink: the target field, fed by `result`; marked while `result` is `null`. */
function SinkNodeView({ data }: NodeProps<SinkNode>) {
  return (
    <div data-testid={`sink:${data.field}`} className="fm-sink" style={{ width: BOX.width }}>
      <Handle type="target" position={Position.Left} data-testid="in:sink" />
      <span className="fm-sink__caption">target field</span>
      <span className="fm-sink__name" title={data.field}>
        {localPath(data.field)}
      </span>
      {!data.connected && (
        <div className="fm-card__mark" data-testid="unconnected:sink">
          No result connected
        </div>
      )}
    </div>
  );
}
