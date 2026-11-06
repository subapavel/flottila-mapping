import {
  ActionGroup,
  Alert,
  Button,
  Form,
  FormGroup,
  FormSection,
  FormSelect,
  FormSelectOption,
  TextArea,
  TextInput,
} from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { describeError, type ApiClient, type CreateMappingRequest, type RootSelector } from '../api/client';

type Direction = 'input' | 'output' | 'fault';

/** What the author typed for one side: the bundle, one reference per line, and the root selector's fields. */
interface SideDraft {
  bundle: string;
  kind: 'element' | 'json' | 'wsdl';
  element: string;
  wsdlInterface: string;
  operation: string;
  direction: Direction;
  fault: string;
}

const EMPTY: SideDraft = { bundle: '', kind: 'element', element: '', wsdlInterface: '', operation: '', direction: 'input', fault: '' };

/** The root selector of a side (GLOSSARY: Root selector); a fault is sent exactly when the direction is fault. */
function rootOf(side: SideDraft): RootSelector {
  switch (side.kind) {
    case 'element':
      return { element: side.element };
    case 'json':
      return { json: '$' };
    case 'wsdl':
      return {
        wsdl: {
          interface: side.wsdlInterface,
          operation: side.operation,
          direction: side.direction,
          ...(side.direction === 'fault' ? { fault: side.fault } : {}),
        },
      };
  }
}

function choiceOf(side: SideDraft): CreateMappingRequest['source'] {
  const bundle = side.bundle
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return { bundle, root: rootOf(side) };
}

export interface NewMappingFormProps {
  api: ApiClient;
  /** Told the new mapping's id once the service created it. */
  onCreated: (id: string) => void;
  onCancel: () => void;
}

/**
 * The New mapping form of the dev host: an id, and per side the bundle references and a root selector. The service
 * checks everything; a refusal (400, 409 `mapping-exists`, 422) is shown with its diagnostics.
 */
export function NewMappingForm({ api, onCreated, onCancel }: NewMappingFormProps) {
  const [id, setId] = useState('');
  const [source, setSource] = useState(EMPTY);
  const [target, setTarget] = useState(EMPTY);
  const create = useMutation({
    mutationFn: (request: CreateMappingRequest) => api.createMapping(request),
    onSuccess: (_, request) => onCreated(request.id),
  });
  const failure = create.isError ? describeError(create.error) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ id, source: choiceOf(source), target: choiceOf(target) });
  };

  return (
    <Form onSubmit={submit} aria-label="New mapping">
      <FormGroup label="Mapping id" fieldId="new-mapping-id">
        <TextInput id="new-mapping-id" value={id} onChange={(_, value) => setId(value)} />
      </FormGroup>
      <SideFields side="Source" draft={source} onChange={setSource} />
      <SideFields side="Target" draft={target} onChange={setTarget} />
      {failure && (
        <Alert variant="danger" isInline title={failure.title}>
          <p>{failure.detail}</p>
          <ul aria-label="Create diagnostics">
            {failure.diagnostics.map((d, i) => (
              <li key={i}>
                {d.severity} <code>{d.code}</code>: {d.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <ActionGroup>
        <Button type="submit" isLoading={create.isPending} isDisabled={create.isPending}>
          Create
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </ActionGroup>
    </Form>
  );
}

function SideFields({ side, draft, onChange }: { side: 'Source' | 'Target'; draft: SideDraft; onChange: (draft: SideDraft) => void }) {
  const fieldId = (name: string) => `new-mapping-${side.toLowerCase()}-${name}`;
  const set = (change: Partial<SideDraft>) => onChange({ ...draft, ...change });
  const text = (name: string, label: string, value: string, change: (value: string) => void) => (
    <FormGroup label={label} fieldId={fieldId(name)}>
      <TextInput id={fieldId(name)} value={value} onChange={(_, next) => change(next)} />
    </FormGroup>
  );

  return (
    <FormSection title={side} titleElement="h3">
      <FormGroup label={`${side} bundle`} fieldId={fieldId('bundle')}>
        <TextArea id={fieldId('bundle')} value={draft.bundle} onChange={(_, bundle) => set({ bundle })} placeholder="One path per line, relative to the mapping's directory" />
      </FormGroup>
      <FormGroup label={`${side} root`} fieldId={fieldId('kind')}>
        <FormSelect id={fieldId('kind')} value={draft.kind} onChange={(_, kind) => set({ kind: kind as SideDraft['kind'] })}>
          <FormSelectOption value="element" label="Element" />
          <FormSelectOption value="json" label="JSON" />
          <FormSelectOption value="wsdl" label="WSDL operation" />
        </FormSelect>
      </FormGroup>
      {draft.kind === 'element' && text('element', `${side} root element`, draft.element, (element) => set({ element }))}
      {draft.kind === 'wsdl' && (
        <>
          {text('interface', `${side} interface`, draft.wsdlInterface, (wsdlInterface) => set({ wsdlInterface }))}
          {text('operation', `${side} operation`, draft.operation, (operation) => set({ operation }))}
          <FormGroup label={`${side} direction`} fieldId={fieldId('direction')}>
            <FormSelect id={fieldId('direction')} value={draft.direction} onChange={(_, direction) => set({ direction: direction as Direction })}>
              <FormSelectOption value="input" label="input" />
              <FormSelectOption value="output" label="output" />
              <FormSelectOption value="fault" label="fault" />
            </FormSelect>
          </FormGroup>
          {draft.direction === 'fault' && text('fault', `${side} fault`, draft.fault, (fault) => set({ fault }))}
        </>
      )}
    </FormSection>
  );
}
