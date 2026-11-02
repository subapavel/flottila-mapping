import { Alert, Button, TextArea, Title } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError, type ApiClient, type Diagnostic } from '../../api/client';
import type { WorkingCopyStore } from '../store/working-copy';

export interface TestPanelProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
}

/** The test panel (ADR-0012): runs the working copy, saved or not, on an input message (ADR-0013, ADR-0015). */
export function TestPanel({ mappingId, api, store }: TestPanelProps) {
  const [input, setInput] = useState('');
  const run = useMutation({
    mutationFn: (message: string) => api.runTest(mappingId, { model: store.getState().workingCopy, input: message }),
  });
  const failure = run.isError ? describeError(run.error) : undefined;

  return (
    <section aria-label="Test panel">
      <Title headingLevel="h2">Test</Title>
      <TextArea aria-label="Input message" value={input} onChange={(_, value) => setInput(value)} rows={8} />
      <Button onClick={() => run.mutate(input)} isLoading={run.isPending} isDisabled={run.isPending}>
        Run test
      </Button>
      {failure && (
        <Alert variant="danger" isInline title={failure.title}>
          {failure.detail}
        </Alert>
      )}
      {run.data?.kind === 'output' && (
        <figure aria-label="Target message">
          <pre>{run.data.output}</pre>
        </figure>
      )}
      {run.data && <Diagnostics diagnostics={run.data.diagnostics} />}
    </section>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <ul aria-label="Diagnostics">
      {diagnostics.map((d, i) => (
        <li key={i}>
          {d.severity} <code>{d.code}</code>: {d.message}
        </li>
      ))}
    </ul>
  );
}
