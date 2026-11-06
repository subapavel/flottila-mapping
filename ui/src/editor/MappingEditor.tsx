import { Alert, AlertActionCloseButton, Button, Label, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type StoredMapping } from '../api/client';
import type { AuthoringId, FieldPath } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import { describeRefusal } from '../model/command';
import { fieldPathSteps } from '../model/field-path';
import { canvasKey, type BrowserStateStore } from './browser-state/browser-state';
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { EditorLayout } from './EditorLayout';
import { FunctionEditor, type CanvasState } from './function-editor/FunctionEditor';
import { Inspector } from './inspector/Inspector';
import { RefusedMapping } from './RefusedMapping';
import { SaveConflict } from './SaveConflict';
import { locate } from './store/locations';
import { createWorkingCopyStore, selectUnsaved, watchUnsaved } from './store/working-copy';
import { isStatusFilter, orphanedBoxes, type StatusFilter } from './structure-overview/field-status';
import { refusalAt } from './structure-overview/rows';
import { StructureOverview, useStructure, type Expanded } from './structure-overview/StructureOverview';
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

  // Refresh (ADR-0027): when a fingerprint changed, the notice names the orphaned references until it is closed.
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<number | null>(null);
  const refresh = useMutation({
    mutationFn: async () => {
      const sent = store.getState().workingCopy;
      const count = store.getState().applyRefresh(sent, await api.refresh(mappingId, sent));
      if (count !== null) setNotice(count);
    },
  });
  // The structures are refreshed when the mapping opens; "Refresh structures" also reloads the trees.
  const startRefresh = refresh.mutate;
  useEffect(() => startRefresh(), [startRefresh]);
  const refreshStructures = () => refresh.mutate(undefined, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['structure'] }) });

  // Orphaned references are marked live against the loaded source structure (spec #104, "Status derivation").
  const model = useStore(store, (s) => s.workingCopy);
  const sourceQuery = useStructure(mappingId, api, model.source);
  const source = sourceQuery.data?.kind === 'loaded' ? sourceQuery.data : undefined;
  const orphaned = useMemo(() => orphanedBoxes(model, source), [model, source]);
  // A remap to a refused source field is refused as a link to it is (ADR-0027); only an orphaned box is remapped, and
  // it is orphaned only against a loaded source structure.
  const remap = (targetField: FieldPath, box: AuthoringId, field: FieldPath) =>
    store.getState().remap(targetField, box, field, refusalAt(source!, field, 'source'));

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
  const [drawerTab, setDrawerTab] = useState<string | number>('test');
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
        <Button variant="secondary" onClick={refreshStructures} isLoading={refresh.isPending}>
          Refresh structures
        </Button>
        {unsaved && <Label color="orange">Unsaved</Label>}
      </div>
      {notice !== null && (
        <Alert
          variant="info"
          isInline
          title="The structures changed"
          actionClose={<AlertActionCloseButton onClose={() => setNotice(null)} />}
        >
          Orphaned references: {notice}
        </Alert>
      )}
      {refresh.isError && (
        <Alert variant="danger" isInline title={`The structures could not be refreshed: ${describeError(refresh.error).title}`} />
      )}
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
      <EditorLayout
        browserState={browserState}
        overview={
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
        }
        functionEditor={
          <FunctionEditor api={api} store={store} targetField={selectedField} canvasState={canvasState} orphaned={orphaned} onRemap={remap} />
        }
        inspector={<Inspector api={api} store={store} targetField={selectedField} orphaned={orphaned} source={source} onRemap={remap} />}
      />
      <Tabs activeKey={drawerTab} onSelect={(_event, key) => setDrawerTab(key)} aria-label="Test and diagnostics">
        <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>}>
          {/* a run that compile refused shows its diagnostics in the Diagnostics panel */}
          <TestPanel mappingId={mappingId} api={api} store={store} onShow={select} onRefused={() => setDrawerTab('diagnostics')} />
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
  const steps = fieldPathSteps(fieldPath);
  return steps.map((_, i) => `/${steps.slice(0, i + 1).join('/')}`);
}
