import { Alert, AlertActionCloseButton, Button, Label, Tab, TabContent, Tabs, TabTitleText } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type StoredMapping, type StructureResponse } from '../api/client';
import type { AuthoringId, FieldPath } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import { describeRefusal } from '../model/command';
import { fieldPathSteps, stepName } from '../model/field-path';
import { canvasKey, type BrowserStateStore } from './browser-state/browser-state';
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { EditorLayout } from './EditorLayout';
import { FunctionEditor, type CanvasState } from './function-editor/FunctionEditor';
import { BoxQueue } from './inspector/DisplayQueue';
import { Inspector } from './inspector/Inspector';
import { ModelJson } from './model-json/ModelJson';
import { RefusedMapping } from './RefusedMapping';
import { SaveConflict } from './SaveConflict';
import { locate } from './store/locations';
import { createWorkingCopyStore, selectUnsaved, watchUnsaved } from './store/working-copy';
import { isStatusFilter, orphanedBoxes, type StatusFilter } from './structure-overview/field-status';
import { refusalAt } from './structure-overview/rows';
import { StructureOverview, useStructure, type Expanded } from './structure-overview/StructureOverview';
import { TestPanel } from './test-panel/TestPanel';
import './editor.css';

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
  /** The host's own controls at the end of the header bar, such as the way back to its list of mappings. */
  headerActions?: ReactNode;
}

/** The page tabs (spec #135); the active one is browser state. */
const PAGE_TABS = ['editor', 'test', 'diagnostics', 'model-json'] as const;
type PageTab = (typeof PAGE_TABS)[number];
const isPageTab = (value: unknown): value is PageTab => (PAGE_TABS as readonly unknown[]).includes(value);

/** `n` and the noun, plural unless `n` is 1. */
const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** A structure root's local name, as its tree shows it; an ellipsis while the structure is not loaded. */
const rootName = (structure: StructureResponse | undefined) => (structure?.kind === 'loaded' ? stepName(structure.root.step) : '…');

/**
 * The mapping editor (ADR-0013): router-free, over injected ports, with its own query client. It is a page of the
 * window's height (spec #135): the header bar, the page tabs, and the active tab's panel.
 */
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
  const { mappingId, api, headerActions } = props;
  const mapping = useQuery({ queryKey: ['mapping', mappingId], queryFn: () => api.getMapping(mappingId) });

  if (mapping.isSuccess) return <OpenMapping key={mappingId} {...props} opened={mapping.data} />;
  return (
    <div className="fm-editor">
      <HeaderBar mappingId={mappingId}>{headerActions}</HeaderBar>
      <div className="fm-editor__body">
        <div className="fm-editor__panel fm-editor__panel--scroll">
          {mapping.isPending ? (
            <p>Opening {mappingId}…</p>
          ) : (
            // A file the service refuses opens read-only: its problem and diagnostics, and Retry (ADR-0027).
            <RefusedMapping error={mapping.error} retrying={mapping.isFetching} onRetry={() => void mapping.refetch()} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The header bar: the mapping id, a summary once the mapping is open, then the controls given as children. */
function HeaderBar({ mappingId, summary, children }: { mappingId: string; summary?: string; children?: ReactNode }) {
  return (
    <header className="fm-editor__header">
      <h1 className="fm-editor__title">{mappingId}</h1>
      <span className="fm-editor__summary">{summary}</span>
      <span className="fm-editor__spacer" />
      {children}
    </header>
  );
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
  headerActions,
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
  const errorCount = useStore(store, (s) => s.diagnostics.filter((d) => d.severity === 'error').length);
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
  const targetQuery = useStructure(mappingId, api, model.target);
  const orphaned = useMemo(() => orphanedBoxes(model, source), [model, source]);
  const mappingCount = Object.keys(model.targetFieldMappings ?? {}).length;
  const summary = `${rootName(sourceQuery.data)} → ${rootName(targetQuery.data)} · ${counted(mappingCount, 'target field mapping')}`;
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
  const tabKey = `mapping:${mappingId}:page-tab`;
  const [tab, setTab] = useState<PageTab>(() => {
    const kept = browserState.read(tabKey);
    return isPageTab(kept) ? kept : 'editor';
  });
  const changeTab = (next: PageTab) => {
    setTab(next);
    browserState.write(tabKey, next);
  };

  // The working copy is compiled on open, then after every change of it (ADR-0013).
  useEffect(() => {
    store.getState().scheduleCompile();
    return () => store.getState().cancelCompile();
  }, [store]);

  // A field the Diagnostics panel leads to opens the Editor tab: the field's branch is expanded, then its row takes the
  // focus, or the tab's panel when the trees show no such row; a target field is also selected for the function
  // editor, and the status filter shows all rows again so that a filter never hides it. The search of the field's own
  // tree is cleared, so that it never hides the row or its ancestors either.
  const editorPanel = useRef<HTMLElement>(null);
  const [focused, setFocused] = useState<{ testId: string } | null>(null);
  const [search, setSearch] = useState({ source: '', target: '' });
  const selectTreeField = (side: 'source' | 'target', fieldPath: FieldPath) => {
    setSearch({ ...search, [side]: '' });
    const paths = pathsDownTo(fieldPath);
    const open = new Set([...(expanded[side] ?? [paths[0]!]), ...paths.slice(0, -1)]);
    changeExpanded({ ...expanded, [side]: [...open] });
    changeTab('editor');
    setFocused({ testId: `${side}-field:${fieldPath}` });
    if (side === 'target') {
      changeStatusFilter('all');
      onSelectField?.(fieldPath);
    }
  };
  useEffect(() => {
    if (focused === null) return;
    const rows = editorPanel.current!.querySelectorAll<HTMLElement>('[data-testid]');
    ([...rows].find((row) => row.dataset.testid === focused.testId) ?? editorPanel.current!).focus();
  }, [focused]);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = undoKey(event);
    if (!step) return;
    event.preventDefault();
    store.getState()[step]();
  };

  const refusal = useStore(store, (s) => s.refusal);
  /**
   * Selects what an authoring id names and opens the Editor tab: its target field, and the box when it is a box's id
   * (the store's selection). An id the working copy lacks selects nothing.
   */
  const select = (id: AuthoringId) => {
    const where = locate(store.getState().workingCopy, id);
    if (!where) return;
    changeTab('editor');
    setSearch({ ...search, target: '' });
    onSelectField?.(where.field);
    store.getState().select(where.box);
  };
  const [canvasState] = useState(() => ({
    read: (tfm: AuthoringId) => browserState.read(canvasKey(mappingId, tfm)) as CanvasState | undefined,
    write: (tfm: AuthoringId, state: CanvasState) => browserState.write(canvasKey(mappingId, tfm), state),
  }));
  // The page tabs and their panels: the panels sit outside Tabs so that they share the rest of the page's height.
  const pageId = useId();
  const panel = (key: PageTab) => ({ eventKey: key, id: `${pageId}${key}-panel`, 'aria-labelledby': `pf-tab-${key}-${pageId}`, hidden: tab !== key });

  return (
    <div className="fm-editor" onKeyDown={onKeyDown}>
      <HeaderBar mappingId={mappingId} summary={summary}>
        <Label status={errorCount > 0 ? 'danger' : 'success'} isCompact onClick={() => changeTab('diagnostics')}>
          {counted(errorCount, 'error')}
        </Label>
        {unsaved && <Label color="orange">Unsaved</Label>}
        <Button size="sm" variant="secondary" onClick={() => store.getState().undo()} isDisabled={!canUndo}>
          Undo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => store.getState().redo()} isDisabled={!canRedo}>
          Redo
        </Button>
        <Button size="sm" onClick={() => save.mutate()} isDisabled={!unsaved || save.isPending} isLoading={save.isPending}>
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={refreshStructures} isLoading={refresh.isPending}>
          Refresh structures
        </Button>
        {headerActions}
      </HeaderBar>
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
      <Tabs id={pageId} className="fm-editor__tabs" activeKey={tab} onSelect={(_event, key) => changeTab(key as PageTab)} aria-label="Page">
        <Tab eventKey="editor" title={<TabTitleText>Editor</TabTitleText>} tabContentId={panel('editor').id} />
        <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>} tabContentId={panel('test').id} />
        <Tab eventKey="diagnostics" title={<TabTitleText>Diagnostics ({diagnosticCount})</TabTitleText>} tabContentId={panel('diagnostics').id} />
        <Tab eventKey="model-json" title={<TabTitleText>Model JSON</TabTitleText>} tabContentId={panel('model-json').id} />
      </Tabs>
      <div className="fm-editor__body">
      <TabContent
        {...panel('editor')}
        ref={editorPanel}
        hidden={false}
        className={tab === 'editor' ? 'fm-editor__panel' : 'fm-editor__panel fm-editor__panel--inactive'}
      >
        <EditorLayout
          browserState={browserState}
          overview={(sides, splitter) => (
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
              search={search}
              onSearchChange={setSearch}
              sides={sides}
              splitter={splitter}
            />
          )}
          functionEditor={
            <FunctionEditor
              api={api}
              store={store}
              targetField={selectedField}
              canvasState={canvasState}
              orphaned={orphaned}
              onRemap={remap}
              boxQueue={(id, last) => <BoxQueue id={id} last={last} />}
            />
          }
          inspector={<Inspector api={api} store={store} targetField={selectedField} orphaned={orphaned} source={source} onRemap={remap} />}
        />
      </TabContent>
      <TabContent {...panel('test')} className="fm-editor__panel fm-editor__panel--scroll">
        {/* a run that compile refused shows its diagnostics in the Diagnostics panel */}
        <TestPanel mappingId={mappingId} api={api} store={store} onShow={select} onRefused={() => changeTab('diagnostics')} />
      </TabContent>
      <TabContent {...panel('diagnostics')} className="fm-editor__panel fm-editor__panel--scroll">
        <DiagnosticsPanel store={store} onSelectField={selectTreeField} />
      </TabContent>
      <TabContent {...panel('model-json')} className="fm-editor__panel fm-editor__panel--scroll">
        {/* serialised only while it is shown: a large working copy costs no text on every edit behind another tab */}
        {tab === 'model-json' && <ModelJson store={store} />}
      </TabContent>
      </div>
    </div>
  );
}

/** The field paths from the root down to `fieldPath`, itself last; a step's `{namespace}` may hold a `/` (ADR-0007). */
function pathsDownTo(fieldPath: FieldPath): FieldPath[] {
  const steps = fieldPathSteps(fieldPath);
  return steps.map((_, i) => `/${steps.slice(0, i + 1).join('/')}`);
}
