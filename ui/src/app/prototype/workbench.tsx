/*
 * PROTOTYPE (spec #145, ticket #145, branch prototype/pf-native) — throwaway. The open mapping's state, lifted out of
 * MappingEditor.tsx's OpenMapping so that each variant can lay the pieces out in its own PF shell. It renders the
 * reused editor components (structure overview, function editor, inspector) but no layout: the variants do that.
 * It does not import MappingEditor.tsx, so editor.css (the 13 px density) never loads on the prototype route.
 */
import { Alert, AlertActionCloseButton, Bullseye, Spinner } from '@patternfly/react-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type StoredMapping, type StructureResponse } from '../../api/client';
import type { AuthoringId, FieldPath } from '../../generated/mapping-model';
import { newAuthoringId } from '../../model/authoring-id';
import { describeRefusal } from '../../model/command';
import { fieldPathSteps, stepName } from '../../model/field-path';
import { canvasKey, targetFieldKey, type BrowserStateStore } from '../../editor/browser-state/browser-state';
import { FunctionEditor, type CanvasState } from '../../editor/function-editor/FunctionEditor';
import { BoxQueue } from '../../editor/inspector/DisplayQueue';
import { Inspector } from '../../editor/inspector/Inspector';
import { openingField } from '../../editor/inspector/target-field';
import { Splitter } from '../../editor/layout/Splitter';
import type { Split, SplitRules } from '../../editor/layout/split';
import { RefusedMapping } from '../../editor/RefusedMapping';
import { SaveConflict } from '../../editor/SaveConflict';
import { locate } from '../../editor/store/locations';
import { createWorkingCopyStore, selectTraceStale, selectUnsaved, type WorkingCopyStore } from '../../editor/store/working-copy';
import { fieldStatuses, orphanedBoxes, type StatusFilter } from '../../editor/structure-overview/field-status';
import { refusalAt } from '../../editor/structure-overview/rows';
import { StructureOverview, useStructure, type Expanded, type Sides } from '../../editor/structure-overview/StructureOverview';

export type PageTab = 'editor' | 'test';

const SIDES: SplitRules = { initial: 0.5, collapsible: ['start', 'end'] };
const rootName = (s: StructureResponse | undefined) => (s?.kind === 'loaded' ? stepName(s.root.step) : '…');

export interface Workbench {
  mappingId: string;
  store: WorkingCopyStore;
  unsaved: boolean;
  canUndo: boolean;
  canRedo: boolean;
  errorCount: number;
  warningCount: number;
  sourceRoot: string;
  targetRoot: string;
  mappingCount: number;
  undo: () => void;
  redo: () => void;
  save: () => void;
  saving: boolean;
  refreshStructures: () => void;
  refreshing: boolean;
  /** The notices above the work area: structure refresh, save failure, refusal, save conflict. */
  alerts: ReactNode;
  selectedField: FieldPath | null;
  /** Selects what an authoring id names and opens the Editor tab. */
  show: (id: AuthoringId) => void;
  /** Leads to a field's row and opens the Editor tab. */
  showField: (side: 'source' | 'target', field: FieldPath) => void;
  structures: ReactNode;
  functionEditor: ReactNode;
  inspector: ReactNode;
  test: TestState;
}

export interface TestState {
  input: string;
  setInput: (input: string) => void;
  filename: string;
  setFilename: (name: string) => void;
  run: () => void;
  running: boolean;
  failure: string | undefined;
}

export interface WorkbenchProps {
  mappingId: string;
  api: ApiClient;
  browserState: BrowserStateStore;
  tab: PageTab;
  onTab: (tab: PageTab) => void;
  /** Laid out by the variant once the mapping has opened. */
  children: (wb: Workbench) => ReactNode;
}

/** Opens the mapping, then hands its workbench to the variant; loading and a refused file are shown in PF. */
export function OpenWorkbench(props: WorkbenchProps) {
  const { mappingId, api } = props;
  const mapping = useQuery({ queryKey: ['mapping', mappingId], queryFn: () => api.getMapping(mappingId) });
  if (mapping.isSuccess) return <Opened key={mappingId} {...props} opened={mapping.data} />;
  if (mapping.isPending) {
    return (
      <Bullseye>
        <Spinner aria-label={`Opening ${mappingId}`} />
      </Bullseye>
    );
  }
  return <RefusedMapping error={mapping.error} retrying={mapping.isFetching} onRetry={() => void mapping.refetch()} />;
}

function Opened({ mappingId, api, browserState, onTab, children, opened }: WorkbenchProps & { opened: StoredMapping }) {
  const [store] = useState(() =>
    createWorkingCopyStore(opened, {
      newId: () => newAuthoringId(),
      save: (model, etag) => api.saveMapping(mappingId, model, etag),
      load: () => api.getMapping(mappingId),
      compile: (model, signal) => api.compile(mappingId, model, signal).then((c) => c.diagnostics),
    }),
  );
  const unsaved = useStore(store, selectUnsaved);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const diagnostics = useStore(store, (s) => s.diagnostics);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const save = useMutation({ mutationFn: () => store.getState().save() });
  const saveFailure = save.isError ? describeError(save.error) : undefined;

  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<number | null>(null);
  const refresh = useMutation({
    mutationFn: async () => {
      const sent = store.getState().workingCopy;
      const count = store.getState().applyRefresh(sent, await api.refresh(mappingId, sent));
      if (count !== null) setNotice(count);
    },
  });
  const startRefresh = refresh.mutate;
  useEffect(() => startRefresh(), [startRefresh]);

  const model = useStore(store, (s) => s.workingCopy);
  const sourceQuery = useStructure(mappingId, api, model.source);
  const source = sourceQuery.data?.kind === 'loaded' ? sourceQuery.data : undefined;
  const targetQuery = useStructure(mappingId, api, model.target);
  const target = targetQuery.data?.kind === 'loaded' ? targetQuery.data : undefined;
  const orphaned = useMemo(() => orphanedBoxes(model, source), [model, source]);
  const statuses = useMemo(() => fieldStatuses(model, diagnostics, source), [model, diagnostics, source]);
  const remap = (field: FieldPath, box: AuthoringId, to: FieldPath) => store.getState().remap(field, box, to, refusalAt(source!, to, 'source'));

  // the selected target field: kept per mapping, the first mapped one on open (as MappingEditor's opening selection)
  const fieldKey = targetFieldKey(mappingId);
  const [selectedField, setSelectedField] = useState<FieldPath | null>(null);
  const selectField = (field: FieldPath) => {
    setSelectedField(field);
    browserState.write(fieldKey, field);
  };
  const opening = useRef(true);
  useEffect(() => {
    if (!opening.current || target === undefined) return;
    opening.current = false;
    const field = openingField(target, store.getState().workingCopy, browserState.read(fieldKey));
    if (field !== undefined) setSelectedField(field);
  }, [target, store, browserState, fieldKey]);

  useEffect(() => {
    store.getState().scheduleCompile();
    return () => store.getState().cancelCompile();
  }, [store]);

  const expandedKey = `mapping:${mappingId}:expanded`;
  const [expanded, setExpanded] = useState<Expanded>(() => (browserState.read(expandedKey) as Expanded | undefined) ?? {});
  const changeExpanded = (next: Expanded) => {
    setExpanded(next);
    browserState.write(expandedKey, next);
  };
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState({ source: '', target: '' });
  const [trees, setTrees] = useState<Split>({ ratio: 0.5, collapsed: null });
  const id = useId();
  const sides: Sides = {
    source: trees.collapsed === 'end' ? 1 : trees.ratio,
    target: trees.collapsed === 'start' ? 1 : 1 - trees.ratio,
    collapsed: trees.collapsed === 'start' ? 'source' : trees.collapsed === 'end' ? 'target' : null,
    sourceId: `${id}source`,
  };

  const showField = (side: 'source' | 'target', fieldPath: FieldPath) => {
    setSearch({ ...search, [side]: '' });
    const steps = fieldPathSteps(fieldPath);
    const paths = steps.map((_, i) => `/${steps.slice(0, i + 1).join('/')}`);
    changeExpanded({ ...expanded, [side]: [...new Set([...(expanded[side] ?? [paths[0]!]), ...paths.slice(0, -1)])] });
    onTab('editor');
    if (side === 'target') {
      setStatusFilter('all');
      selectField(fieldPath);
    }
  };
  const show = (authoringId: AuthoringId) => {
    const where = locate(store.getState().workingCopy, authoringId);
    if (!where) return;
    onTab('editor');
    selectField(where.field);
    store.getState().select(where.box);
  };

  const [canvasState] = useState(() => ({
    read: (tfm: AuthoringId) => browserState.read(canvasKey(mappingId, tfm)) as CanvasState | undefined,
    write: (tfm: AuthoringId, state: CanvasState) => browserState.write(canvasKey(mappingId, tfm), state),
  }));

  // the test input lives here, so that it survives the Test tab being unmounted
  const [input, setInput] = useState('');
  const [filename, setFilename] = useState('');
  const run = useMutation({
    mutationFn: (message: string) => {
      const sent = store.getState().workingCopy;
      return api.runTest(mappingId, { model: sent, input: message }).then((result) => store.getState().recordRun(sent, result));
    },
  });

  const refusal = useStore(store, (s) => s.refusal);
  const alerts = (
    <>
      {notice !== null && (
        <Alert variant="info" isInline title="The structures changed" actionClose={<AlertActionCloseButton onClose={() => setNotice(null)} />}>
          Orphaned references: {notice}
        </Alert>
      )}
      {refresh.isError && <Alert variant="danger" isInline title={`The structures could not be refreshed: ${describeError(refresh.error).title}`} />}
      {saveFailure && (
        <Alert variant="danger" isInline title={saveFailure.title}>
          {saveFailure.detail}
        </Alert>
      )}
      {refusal && <Alert variant="warning" isInline title={describeRefusal(refusal)} />}
      <SaveConflict store={store} />
    </>
  );

  const wb: Workbench = {
    mappingId,
    store,
    unsaved,
    canUndo,
    canRedo,
    errorCount,
    warningCount: diagnostics.length - errorCount,
    sourceRoot: rootName(sourceQuery.data),
    targetRoot: rootName(targetQuery.data),
    mappingCount: Object.keys(model.targetFieldMappings ?? {}).length,
    undo: () => store.getState().undo(),
    redo: () => store.getState().redo(),
    save: () => save.mutate(),
    saving: save.isPending,
    refreshStructures: () => refresh.mutate(undefined, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['structure'] }) }),
    refreshing: refresh.isPending,
    alerts,
    selectedField,
    show,
    showField,
    structures: (
      <StructureOverview
        mappingId={mappingId}
        api={api}
        store={store}
        expanded={expanded}
        onExpandedChange={changeExpanded}
        selectedField={selectedField}
        onSelectField={selectField}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        sides={sides}
        splitter={
          <Splitter
            orientation="vertical"
            label="Resize the source and the target structure"
            controls={sides.sourceId}
            split={trees}
            rules={SIDES}
            onChange={setTrees}
          />
        }
      />
    ),
    functionEditor: (
      <FunctionEditor
        api={api}
        store={store}
        targetField={selectedField}
        canvasState={canvasState}
        orphaned={orphaned}
        onRemap={remap}
        boxQueue={(qid, last, label, subject) => <BoxQueue id={qid} last={last} label={label} subject={subject} />}
      />
    ),
    inspector: (
      <Inspector
        api={api}
        store={store}
        targetField={selectedField}
        orphaned={orphaned}
        source={source}
        target={target}
        targetStatus={selectedField === null ? undefined : statuses.get(selectedField)}
        onRemap={remap}
      />
    ),
    test: {
      input,
      setInput,
      filename,
      setFilename,
      run: () => run.mutate(input),
      running: run.isPending,
      failure: run.isError ? describeError(run.error).title : undefined,
    },
  };
  return children(wb);
}

/** The last run and whether it is a stale trace. */
export function useLastRun(store: WorkingCopyStore) {
  const lastRun = useStore(store, (s) => s.lastRun);
  const stale = useStore(store, selectTraceStale);
  return { lastRun, stale };
}
