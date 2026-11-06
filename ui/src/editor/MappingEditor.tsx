import { Alert, Button, Label } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient } from '../api/client';
import type { MappingModel } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import type { BrowserStateStore } from './browser-state/browser-state';
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
  const save = useMutation({ mutationFn: () => store.getState().save() });
  const failure = save.isError ? describeError(save.error) : undefined;

  const expandedKey = `mapping:${mappingId}:expanded`;
  const [expanded, setExpanded] = useState<Expanded>(() => (browserState.read(expandedKey) as Expanded | null | undefined) ?? {});
  const changeExpanded = (next: Expanded) => {
    setExpanded(next);
    browserState.write(expandedKey, next);
  };

  return (
    <div>
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
      <TestPanel mappingId={mappingId} api={api} store={store} />
    </div>
  );
}
