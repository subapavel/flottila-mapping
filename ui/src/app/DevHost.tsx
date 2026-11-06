import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { describeError, type ApiClient } from '../api/client';
import { MappingEditor, type BrowserStateStore } from '../editor';
import { NewMappingForm } from './NewMappingForm';

export interface DevHostProps {
  api: ApiClient;
  browserState: BrowserStateStore;
  /**
   * The mapping to open at start, from `?mapping=`, with the target field to select in it, from `?field=`. Without
   * it the host starts at the list.
   */
  start?: { mapping: string; field?: string };
}

/**
 * The dev host (ADR-0013): the workspace's mappings, a New mapping form, and one open mapping in the editor. It asks
 * before the page unloads or the author leaves a mapping while the editor reports unsaved changes.
 */
export function DevHost(props: DevHostProps) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <Host {...props} />
    </QueryClientProvider>
  );
}

function Host({ api, browserState, start }: DevHostProps) {
  const [open, setOpen] = useState(start?.mapping);
  // The selected target field is the host's controlled state (ADR-0013).
  const [selectedField, setSelectedField] = useState(start?.field ?? null);
  const [unsaved, setUnsaved] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!unsaved) return undefined;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [unsaved]);

  // The editor reports no change when it closes, so the host forgets the flag itself, and the field with the mapping.
  const toList = () => {
    setAsking(false);
    setUnsaved(false);
    setSelectedField(null);
    setOpen(undefined);
  };

  if (open === undefined) return <MappingList api={api} onOpen={setOpen} />;
  return (
    <>
      <Button variant="link" isInline onClick={() => (unsaved ? setAsking(true) : toList())}>
        All mappings
      </Button>
      <h2>{open}</h2>
      <MappingEditor
        key={open}
        mappingId={open}
        api={api}
        browserState={browserState}
        onUnsavedChange={setUnsaved}
        selectedField={selectedField}
        onSelectField={setSelectedField}
      />
      <Modal variant="small" isOpen={asking} onClose={() => setAsking(false)} aria-labelledby="unsaved-guard-title">
        <ModalHeader title="Unsaved changes" labelId="unsaved-guard-title" />
        <ModalBody>The working copy of {open} has unsaved changes. Leaving it discards them.</ModalBody>
        <ModalFooter>
          <Button variant="danger" onClick={toList}>
            Discard changes
          </Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function MappingList({ api, onOpen }: { api: ApiClient; onOpen: (id: string) => void }) {
  const mappings = useQuery({ queryKey: ['mappings'], queryFn: () => api.listMappings() });
  const [creating, setCreating] = useState(false);

  const list = () => {
    if (mappings.isPending) return <p>Loading the mappings…</p>;
    if (mappings.isError) {
      const failure = describeError(mappings.error);
      return (
        <Alert variant="danger" isInline title={failure.title}>
          {failure.detail}
        </Alert>
      );
    }
    if (mappings.data.length === 0) return <p>The workspace has no mappings.</p>;
    return (
      <ul aria-label="Mappings">
        {mappings.data.map((m) => (
          <li key={m.id}>
            <Button variant="link" isInline onClick={() => onOpen(m.id)}>
              {m.id}
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <h2>Mappings</h2>
      {list()}
      {creating ? (
        <NewMappingForm api={api} onCreated={onOpen} onCancel={() => setCreating(false)} />
      ) : (
        <Button variant="primary" onClick={() => setCreating(true)}>
          New mapping
        </Button>
      )}
    </>
  );
}
