import { Alert, Button, Label, TextArea, Title } from '@patternfly/react-core';
import { useMutation } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { useStore } from 'zustand';
import { describeError, type ApiClient, type Diagnostic, type TestResult } from '../../api/client';
import type { AuthoringId } from '../../generated/mapping-model';
import { selectTraceStale, type WorkingCopyStore } from '../store/working-copy';
import './test-panel.css';

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
 * The test panel (ADR-0012, GLOSSARY), laid out as the prototype's (spec #135): on the left Run, the run's status line
 * and the input message, typed or uploaded; on the right the errors of the last run, then its target message. It runs
 * the working copy, saved or not (ADR-0013, ADR-0015). The last run stays shown, marked while it is a stale trace; its
 * diagnostics also go to the Diagnostics panel.
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
    <section aria-label="Test panel" className="fm-test">
      <div className="fm-test__input">
        <div className="fm-test__bar">
          <Title headingLevel="h2" size="md">
            Input message
          </Title>
          <Button size="sm" onClick={() => run.mutate(input)} isLoading={run.isPending} isDisabled={run.isPending}>
            Run test
          </Button>
          <RunStatus result={lastRun} stale={stale} />
        </div>
        <input type="file" aria-label="Upload input message" onChange={upload} />
        <TextArea
          className="fm-test__text"
          aria-label="Input message"
          value={input}
          onChange={(_, value) => setInput(value)}
          resizeOrientation="none"
          spellCheck={false}
        />
      </div>
      <div className="fm-test__result">
        {failure && (
          <Alert variant="danger" isInline title={failure.title}>
            {failure.detail}
          </Alert>
        )}
        <Errors result={lastRun} onShow={onShow} />
        <section aria-label="Generated target" className="fm-test__output">
          <Title headingLevel="h3" size="md">
            Generated target
          </Title>
          <Output result={lastRun} />
        </section>
      </div>
    </section>
  );
}

/** The status line beside Run: no run yet, or whether the last run is live or a stale trace. */
function RunStatus({ result, stale }: { result: TestResult | null; stale: boolean }) {
  if (result === null) return <span className="fm-test__status">No run yet</span>;
  if (!stale) {
    return (
      <span className="fm-test__status">
        <Label color="green" isCompact>
          live
        </Label>
      </span>
    );
  }
  return (
    <span className="fm-test__status">
      <Label color="orange" isCompact>
        stale
      </Label>{' '}
      The working copy changed since this run.
    </span>
  );
}

/**
 * The last run's errors: its runtime error, then its diagnostics of severity error, each with a link to the authoring
 * id it names; warnings are left to the Diagnostics panel.
 */
function Errors({ result, onShow }: { result: TestResult | null; onShow: (id: AuthoringId) => void }) {
  const runtime = result?.kind === 'error' ? result.error : undefined;
  const diagnostics = (result?.diagnostics ?? []).filter((d) => d.severity === 'error');
  return (
    <section aria-label="Errors" className="fm-test__errors">
      <Title headingLevel="h3" size="md">
        Errors ({diagnostics.length + (runtime ? 1 : 0)})
      </Title>
      {runtime && (
        <Alert variant="danger" isInline isPlain title={`Runtime error ${runtime.code}`}>
          <p>{runtime.message}</p>
          {runtime.authoringId !== undefined && <ShowLink id={runtime.authoringId} onShow={onShow} />}
        </Alert>
      )}
      {diagnostics.length > 0 && (
        <ul className="fm-test__list">
          {diagnostics.map((d, i) => (
            <li key={i}>
              <span className="fm-test__code">{d.code}</span> {d.message}
              <Place location={d.location} onShow={onShow} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A link to the authoring id a diagnostic names; the Diagnostics panel shows its other locations. */
function Place({ location, onShow }: { location: Diagnostic['location']; onShow: (id: AuthoringId) => void }) {
  if (location.kind !== 'authoring-id') return null;
  return (
    <>
      {' · '}
      <ShowLink id={location.authoringId} onShow={onShow} />
    </>
  );
}

function ShowLink({ id, onShow }: { id: AuthoringId; onShow: (id: AuthoringId) => void }) {
  return (
    <Button variant="link" isInline onClick={() => onShow(id)}>
      Show {id}
    </Button>
  );
}

/** The target message of the last run, or why there is none. */
function Output({ result }: { result: TestResult | null }) {
  switch (result?.kind) {
    case undefined:
      return <p className="fm-test__empty">No run yet.</p>;
    case 'output':
      return (
        <figure aria-label="Target message" className="fm-test__message">
          <pre>{result.output}</pre>
        </figure>
      );
    case 'error':
      return <p className="fm-test__empty">The run stopped at a runtime error: no target message.</p>;
    case 'refused':
      return <p className="fm-test__empty">Compile refused the working copy: nothing ran. Its diagnostics are in the Diagnostics panel.</p>;
  }
}
