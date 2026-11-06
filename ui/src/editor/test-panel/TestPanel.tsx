import { Alert, Button, Label, TextArea, Title } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type TestResult } from '../../api/client';
import type { AuthoringId } from '../../generated/mapping-model';
import { selectTraceStale, type WorkingCopyStore } from '../store/working-copy';

export interface TestPanelProps {
  mappingId: string;
  api: ApiClient;
  store: WorkingCopyStore;
  /** Leads to the box or target field mapping a runtime error names. */
  onShow: (id: AuthoringId) => void;
  /** Told when compile refused a run: its diagnostics are in the Diagnostics panel. */
  onRefused: () => void;
}

/**
 * The test panel (ADR-0012, GLOSSARY): runs the working copy, saved or not, on an input message typed or uploaded
 * (ADR-0013, ADR-0015), and shows the target message or the runtime error of the last run, marked while it is a stale
 * trace. A run's diagnostics go to the Diagnostics panel.
 */
export function TestPanel({ mappingId, api, store, onShow, onRefused }: TestPanelProps) {
  const [input, setInput] = useState('');
  const lastRun = useStore(store, (s) => s.lastRun);
  const stale = useStore(store, selectTraceStale);
  const run = useMutation({
    mutationFn: (message: string) => {
      const sent = store.getState().workingCopy;
      return api.runTest(mappingId, { model: sent, input: message }).then((result) => {
        store.getState().recordRun(sent, result);
        if (result.kind === 'refused') onRefused();
      });
    },
  });
  const failure = run.isError ? describeError(run.error) : undefined;
  // XML or JSON by the source root: the editor sends the text as it is (ADR-0015)
  const upload = (event: ChangeEvent<HTMLInputElement>) => void event.target.files?.[0]?.text().then(setInput);

  return (
    <section aria-label="Test panel">
      <Title headingLevel="h2">Test</Title>
      <TextArea aria-label="Input message" value={input} onChange={(_, value) => setInput(value)} rows={8} />
      <input type="file" aria-label="Upload input message" onChange={upload} />
      <Button onClick={() => run.mutate(input)} isLoading={run.isPending} isDisabled={run.isPending}>
        Run test
      </Button>
      {failure && (
        <Alert variant="danger" isInline title={failure.title}>
          {failure.detail}
        </Alert>
      )}
      {lastRun && <LastRun result={lastRun} stale={stale} onShow={onShow} />}
    </section>
  );
}

function LastRun({ result, stale, onShow }: { result: TestResult; stale: boolean; onShow: (id: AuthoringId) => void }) {
  const staleMark = stale && (
    <p>
      <Label color="orange">stale</Label> The working copy changed since this run.
    </p>
  );
  switch (result.kind) {
    case 'output':
      return (
        <>
          {staleMark}
          <figure aria-label="Target message">
            <pre>{result.output}</pre>
          </figure>
        </>
      );
    case 'error': {
      const { code, message, authoringId } = result.error;
      return (
        <>
          {staleMark}
          <Alert variant="danger" isInline title={`Runtime error ${code}`}>
            <p>{message}</p>
            {authoringId !== undefined && (
              <Button variant="link" isInline onClick={() => onShow(authoringId)}>
                Show {authoringId}
              </Button>
            )}
          </Alert>
        </>
      );
    }
    case 'refused':
      return <p>Compile refused the working copy: nothing ran. Its diagnostics are in the Diagnostics panel.</p>;
  }
}
