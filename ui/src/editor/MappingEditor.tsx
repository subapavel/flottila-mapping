import { Alert, Button, Label, Tab, Tabs, TabTitleText } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient } from '../api/client';
import type { MappingModel } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import type { BrowserStateStore } from './browser-state/browser-state';
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel';
import { createWorkingCopyStore, selectUnsaved } from './store/working-copy';
import { StructureOverview, type Expanded } from './structure-overview/StructureOverview';
import { TestPanel } from './test-panel/TestPanel';

export interface MappingEditorProps {
  /** The mapping's id: its path in the workspace without the file suffix (ADR-0014). */
  mappingId: string;
  /** The port to the service. */
  api: ApiClient;
  /** The port for layout and view state. */
  browserState: BrowserStateStore;
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

function Editor({ mappingId, api, browserState }: MappingEditorProps) {
  const mapping = useQuery({ queryKey: ['mapping', mappingId], queryFn: () => api.getMapping(mappingId) });

  if (mapping.isPending) return <p>Opening {mappingId}…</p>;
  if (mapping.isError) {
    const failure = describeError(mapping.error);
    return (
      <Alert variant="danger" isInline title={failure.title}>
        {failure.detail}
      </Alert>
    );
  }
  return <OpenMapping key={mappingId} mappingId={mappingId} api={api} browserState={browserState} loaded={mapping.data} />;
}

function OpenMapping({ mappingId, api, browserState, loaded }: MappingEditorProps & { loaded: MappingModel }) {
  const [store] = useState(() =>
    createWorkingCopyStore(loaded, {
      newId: () => newAuthoringId(),
      save: (model) => api.saveMapping(mappingId, model),
      compile: (model, signal) => api.compile(mappingId, model, signal).then((compiled) => compiled.diagnostics),
    }),
  );
  const unsaved = useStore(store, selectUnsaved);
  const diagnosticCount = useStore(store, (s) => s.diagnostics.length);
  const save = useMutation({ mutationFn: () => store.getState().save() });
  const failure = save.isError ? describeError(save.error) : undefined;

  const expandedKey = `mapping:${mappingId}:expanded`;
  const [expanded, setExpanded] = useState<Expanded>(() => (browserState.read(expandedKey) as Expanded | null | undefined) ?? {});
  const changeExpanded = (next: Expanded) => {
    setExpanded(next);
    browserState.write(expandedKey, next);
  };

  // The working copy is compiled on open, then after every edit (ADR-0013).
  useEffect(() => {
    store.getState().scheduleCompile();
    return () => store.getState().cancelCompile();
  }, [store]);

  // A field the Diagnostics panel leads to: its branch is expanded, then its row takes the focus.
  const editor = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{ testId: string } | null>(null);
  const selectField = (side: 'source' | 'target', fieldPath: string) => {
    const paths = pathsDownTo(fieldPath);
    const open = new Set([...(expanded[side] ?? [paths[0]!]), ...paths.slice(0, -1)]);
    changeExpanded({ ...expanded, [side]: [...open] });
    setSelected({ testId: `${side}-field:${fieldPath}` });
  };
  useEffect(() => {
    if (selected === null) return;
    const rows = editor.current!.querySelectorAll<HTMLElement>('[data-testid]');
    [...rows].find((row) => row.dataset.testid === selected.testId)?.focus();
  }, [selected]);

  return (
    <div ref={editor}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Button onClick={() => save.mutate()} isDisabled={!unsaved || save.isPending} isLoading={save.isPending}>
          Save
        </Button>
        {unsaved && <Label color="orange">Unsaved</Label>}
      </div>
      {failure && (
        <Alert variant="danger" isInline title={failure.title}>
          <p>{failure.detail}</p>
          <ul aria-label="Save diagnostics">
            {failure.diagnostics.map((d, i) => (
              <li key={i}>
                {d.severity} <code>{d.code}</code>: {d.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <StructureOverview
        mappingId={mappingId}
        api={api}
        store={store}
        expanded={expanded}
        onExpandedChange={changeExpanded}
      />
      <Tabs defaultActiveKey="test" aria-label="Test and diagnostics">
        <Tab eventKey="test" title={<TabTitleText>Test</TabTitleText>}>
          <TestPanel mappingId={mappingId} api={api} store={store} />
        </Tab>
        <Tab eventKey="diagnostics" title={<TabTitleText>Diagnostics ({diagnosticCount})</TabTitleText>}>
          <DiagnosticsPanel store={store} onSelectField={selectField} />
        </Tab>
      </Tabs>
    </div>
  );
}

/** The field paths from the root down to `fieldPath`, itself last; a step's `{namespace}` may hold a `/` (ADR-0007). */
function pathsDownTo(fieldPath: string): string[] {
  const steps = [...fieldPath.matchAll(/(?:\{[^}]*\}|[^/{])+/g)].map((step) => step[0]);
  return steps.map((_, i) => `/${steps.slice(0, i + 1).join('/')}`);
}
