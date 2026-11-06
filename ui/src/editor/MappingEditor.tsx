import { Alert, Button, Label } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type StoredMapping } from '../api/client';
import { newAuthoringId } from '../model/authoring-id';
import type { BrowserStateStore } from './browser-state/browser-state';
import { RefusedMapping } from './RefusedMapping';
import { SaveConflict } from './SaveConflict';
import { createWorkingCopyStore, selectUnsaved, watchUnsaved } from './store/working-copy';
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

function OpenMapping({ mappingId, api, browserState, onUnsavedChange, opened }: MappingEditorProps & { opened: StoredMapping }) {
  const [store] = useState(() =>
    createWorkingCopyStore(opened, {
      newId: () => newAuthoringId(),
      save: (model, etag) => api.saveMapping(mappingId, model, etag),
      load: () => api.getMapping(mappingId),
    }),
  );
  useEffect(() => (onUnsavedChange ? watchUnsaved(store, onUnsavedChange) : undefined), [store, onUnsavedChange]);
  const unsaved = useStore(store, selectUnsaved);
  const canUndo = useStore(store, (s) => s.past.length > 0);
  const canRedo = useStore(store, (s) => s.future.length > 0);
  const save = useMutation({ mutationFn: () => store.getState().save() });
  const failure = save.isError ? describeError(save.error) : undefined;

  const expandedKey = `mapping:${mappingId}:expanded`;
  const [expanded, setExpanded] = useState<Expanded>(() => (browserState.read(expandedKey) as Expanded | null | undefined) ?? {});
  const changeExpanded = (next: Expanded) => {
    setExpanded(next);
    browserState.write(expandedKey, next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = undoKey(event);
    if (!step) return;
    event.preventDefault();
    store.getState()[step]();
  };

  return (
    <div onKeyDown={onKeyDown}>
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
            {failure.diagnostics.map((d, i) => (
              <li key={i}>
                {d.severity} <code>{d.code}</code>: {d.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <SaveConflict store={store} />
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
