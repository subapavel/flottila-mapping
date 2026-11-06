import { Alert, Button, Label } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient } from '../api/client';
import type { AuthoringId, FieldPath, MappingModel } from '../generated/mapping-model';
import { newAuthoringId } from '../model/authoring-id';
import { canvasKey, type BrowserStateStore } from './browser-state/browser-state';
import { FunctionEditor, type CanvasState } from './function-editor/FunctionEditor';
import { locate } from './function-editor/graph';
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
  if (mapping.isError) {
    const failure = describeError(mapping.error);
    return (
      <Alert variant="danger" isInline title={failure.title}>
        {failure.detail}
      </Alert>
    );
  }
  return <OpenMapping key={mappingId} {...props} loaded={mapping.data} />;
}

function OpenMapping({
  mappingId,
  api,
  browserState,
  selectedField = null,
  onSelectField,
  loaded,
}: MappingEditorProps & { loaded: MappingModel }) {
  const [store] = useState(() =>
    createWorkingCopyStore(loaded, { newId: () => newAuthoringId(), save: (model) => api.saveMapping(mappingId, model) }),
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

  const [selectedBox, setSelectedBox] = useState<AuthoringId | null>(null);
  /** Selects what an authoring id names: its target field, and the box when it is a box's id. */
  const select = (id: AuthoringId) => {
    const where = locate(store.getState().workingCopy, id);
    if (!where) return;
    onSelectField?.(where.field);
    setSelectedBox(where.box);
  };
  const [canvasState] = useState(() => ({
    read: (tfm: AuthoringId) => browserState.read(canvasKey(mappingId, tfm)) as CanvasState | undefined,
    write: (tfm: AuthoringId, state: CanvasState) => browserState.write(canvasKey(mappingId, tfm), state),
  }));

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
      <StructureOverview
        mappingId={mappingId}
        api={api}
        store={store}
        expanded={expanded}
        onExpandedChange={changeExpanded}
      />
      <FunctionEditor
        api={api}
        store={store}
        targetField={selectedField}
        selectedBox={selectedBox}
        onSelectBox={setSelectedBox}
        canvasState={canvasState}
      />
      <TestPanel mappingId={mappingId} api={api} store={store} />
    </div>
  );
}
