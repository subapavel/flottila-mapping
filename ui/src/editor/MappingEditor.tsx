import { Alert, Button, Label, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type StoredMapping } from '../api/client';
import type { AuthoringId, FieldPath } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import { describeRefusal } from '../model/command';
import { canvasKey, type BrowserStateStore } from './browser-state/browser-state';
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { FunctionEditor, type CanvasState } from './function-editor/FunctionEditor';
import { locate } from './function-editor/graph';
import { Inspector } from './inspector/Inspector';
import { RefusedMapping } from './RefusedMapping';
import { SaveConflict } from './SaveConflict';
import { createWorkingCopyStore, selectUnsaved, watchUnsaved } from './store/working-copy';
import { isStatusFilter, type StatusFilter } from './structure-overview/field-status';
import { StructureOverview, type Expanded } from './structure-overview/StructureOverview';
import { TestPanel } from './test-panel/TestPanel';

export interface MappingEditorProps {
  /** The mapping's id: its path in the workspace without the file suffix (ADR-0014). */
  mappingId: string;
  /** The port to the service. */
  api: ApiClient;
  /** The port for layout and view state. */
  browserState: BrowserStateStore;
  /** Told each time the working copy starts or stops having unsaved changes, so the host can guard leaving. */
  onUnsavedChange?: (unsaved: boolean) => void;
  /** The selected target field, controlled by the host (ADR-0013); the function editor shows its graph. */
  selectedField?: FieldPath | null;
  /** Asks the host to select a target field. */
  onSelectField?: (field: FieldPath) => void;
}

/** The mapping editor (ADR-0013): router-free, over injected ports, with its own query client. */
export function MappingEditor(props: MappingEditorProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // The loaded mapping is the baseline's source; a refetch must not replace it behind the working copy.
        defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Editor {...props} />
    </QueryClientProvider>
  );
}

function Editor(props: MappingEditorProps) {
  const { mappingId, api } = props;
  const mapping = useQuery({ queryKey: ['mapping', mappingId], queryFn: () => api.getMapping(mappingId) });

  if (mapping.isPending) return <p>Opening {mappingId}…</p>;
  // A file the service refuses opens read-only: its problem and diagnostics, and Retry (ADR-0027).
  if (mapping.isError) {
    return <RefusedMapping error={mapping.error} retrying={mapping.isFetching} onRetry={() => void mapping.refetch()} />;
  }
  return <OpenMapping key={mappingId} {...props} opened={mapping.data} />;
}

/** Ctrl+Z undoes and Ctrl+Shift+Z redoes, except in a text field, which keeps its own undo. */
function undoKey(event: KeyboardEvent): 'undo' | 'redo' | undefined {
  const target = event.target;
  if (!event.ctrlKey || event.key.toLowerCase() !== 'z') return undefined;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return undefined;
  return event.shiftKey ? 'redo' : 'undo';
}

function OpenMapping({
  mappingId,
  api,
  browserState,
  onUnsavedChange,
  selectedField = null,
  onSelectField,
  opened,
}: MappingEditorProps & { opened: StoredMapping }) {
  const [store] = useState(() =>
    createWorkingCopyStore(opened, {
      newId: () => newAuthoringId(),
      save: (model, etag) => api.saveMapping(mappingId, model, etag),
      load: () => api.getMapping(mappingId),
      compile: (model, signal) => api.compile(mappingId, model, signal).then((compiled) => compiled.diagnostics),
    }),
  );
  useEffect(() => (onUnsavedChange ? watchUnsaved(store, onUnsavedChange) : undefined), [store, onUnsavedChange]);
  const unsaved = useStore(store, selectUnsaved);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const diagnosticCount = useStore(store, (s) => s.diagnostics.length);
  const save = useMutation({ mutationFn: () => store.getState().save() });
  const failure = save.isError ? describeError(save.error) : undefined;

  const expandedKey = `mapping:${mappingId}:expanded`;
  const [expanded, setExpanded] = useState<Expanded>(() => (browserState.read(expandedKey) as Expanded | null | undefined) ?? {});
  const changeExpanded = (next: Expanded) => {
    setExpanded(next);
    browserState.write(expandedKey, next);
  };
  const statusFilterKey = `mapping:${mappingId}:status-filter`;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const kept = browserState.read(statusFilterKey);
    return isStatusFilter(kept) ? kept : 'all';
  });
  const changeStatusFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    browserState.write(statusFilterKey, next);
  };

  // The working copy is compiled on open, then after every change of it (ADR-0013).
  useEffect(() => {
    store.getState().scheduleCompile();
    return () => store.getState().cancelCompile();
  }, [store]);

  // A field the Diagnostics panel leads to: its branch is expanded, then its row takes the focus; a target field is
  // also selected for the function editor, and the status filter shows all rows again so that a filter never hides it.
  const editor = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<{ testId: string } | null>(null);
  const selectTreeField = (side: 'source' | 'target', fieldPath: FieldPath) => {
    const paths = pathsDownTo(fieldPath);
    const open = new Set([...(expanded[side] ?? [paths[0]!]), ...paths.slice(0, -1)]);
    changeExpanded({ ...expanded, [side]: [...open] });
    setFocused({ testId: `${side}-field:${fieldPath}` });
    if (side === 'target') {
      changeStatusFilter('all');
      onSelectField?.(fieldPath);
    }
  };
  useEffect(() => {
    if (focused === null) return;
    const rows = editor.current!.querySelectorAll<HTMLElement>('[data-testid]');
    [...rows].find((row) => row.dataset.testid === focused.testId)?.focus();
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = undoKey(event);
    if (!step) return;
    event.preventDefault();
    store.getState()[step]();
  };

  const refusal = useStore(store, (s) => s.refusal);
  /** Selects what an authoring id names: its target field, and the box when it is a box's id (the store's selection). */
  const select = (id: AuthoringId) => {
    const where = locate(store.getState().workingCopy, id);
    if (!where) return;
    onSelectField?.(where.field);
    store.getState().select(where.box);
  };
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [canvasState] = useState(() => ({
    read: (tfm: AuthoringId) => browserState.read(canvasKey(mappingId, tfm)) as CanvasState | undefined,
    write: (tfm: AuthoringId, state: CanvasState) => browserState.write(canvasKey(mappingId, tfm), state),
  }));

  return (
    <div ref={editor} onKeyDown={onKeyDown}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Button variant="secondary" onClick={() => store.getState().undo()} isDisabled={!canUndo}>
          Undo
        </Button>
        <Button variant="secondary" onClick={() => store.getState().redo()} isDisabled={!canRedo}>
          Redo
        </Button>
        <Button onClick={() => save.mutate()} isDisabled={!unsaved || save.isPending} isLoading={save.isPending}>
          Save
        </Button>
        {unsaved && <Label color="orange">Unsaved</Label>}
      </div>
      {failure && (
        <Alert variant="danger" isInline title={failure.title}>
          <p>{failure.detail}</p>
          <ul aria-label="Save diagnostics">
            {failure.diagnostics.map(({ severity, code, message, location }, i) => (
              <li key={i}>
                {severity} <code>{code}</code>: {message}
                {location.kind === 'authoring-id' && (
                  <Button variant="link" isInline onClick={() => select(location.authoringId)}>
                    Show {location.authoringId}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {refusal && <Alert variant="warning" isInline title={describeRefusal(refusal)} />}
      <SaveConflict store={store} />
      <StructureOverview
        mappingId={mappingId}
        api={api}
        store={store}
        expanded={expanded}
        onExpandedChange={changeExpanded}
        selectedField={selectedField}
        onSelectField={onSelectField}
        statusFilter={statusFilter}
        onStatusFilterChange={changeStatusFilter}
      />
      {/* the function editor, with the collapsible inspector on its right; below it when the two do not fit (ADR-0012) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.5rem' }}>
        <div style={{ flex: '1 1 34rem', minWidth: 0 }}>
          <FunctionEditor api={api} store={store} targetField={selectedField} canvasState={canvasState} />
        </div>
        <div style={{ flex: 'none' }}>
          <Button variant="link" isInline aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(!inspectorOpen)}>
            {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          </Button>
          {inspectorOpen && <Inspector api={api} store={store} targetField={selectedField} />}
        </div>
      </div>
      <Tabs defaultActiveKey="test" aria-label="Test and diagnostics">
        <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>}>
          <TestPanel mappingId={mappingId} api={api} store={store} />
        </Tab>
        <Tab eventKey="diagnostics" title={<TabTitleText>Diagnostics ({diagnosticCount})</TabTitleText>}>
          <DiagnosticsPanel store={store} onSelectField={selectTreeField} />
        </Tab>
      </Tabs>
    </div>
  );
}

/** The field paths from the root down to `fieldPath`, itself last; a step's `{namespace}` may hold a `/` (ADR-0007). */
function pathsDownTo(fieldPath: FieldPath): FieldPath[] {
  const steps = [...fieldPath.matchAll(/(?:\{[^}]*\}|[^/{])+/g)].map((step) => step[0]);
  return steps.map((_, i) => `/${steps.slice(0, i + 1).join('/')}`);
}
