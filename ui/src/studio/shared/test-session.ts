import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createStore } from 'zustand/vanilla';
import { describeError, type ApiClient, type Diagnostic, type TestRequest, type TestResult } from '../../api/client';
import { testSourceKey, type BrowserStateStore } from '../browser-state/browser-state';
import type { WorkingCopyStore } from '../store/working-copy';
import { currentInstance, testInput, testInstances, type TestInstance } from '../mock/test-instances';
import { testPreview } from '../mock/test-preview';
import { formatOf } from './documents';

/** A line of the processing log: its time when it opens a section, else a detail of the section above it. */
export interface LogLine {
  time?: string;
  message: string;
  detail?: boolean;
}

/** A section of the processing log: the lines of one compile or one run, and when it began. */
export interface LogSection {
  at: number;
  lines: LogLine[];
}

/** A log line's time as the prototype stamps it: hours, minutes and seconds on a 24-hour clock. */
export const stamp = (at: Date) => at.toLocaleTimeString('en-GB', { hour12: false });

const diagnosticLine = ({ severity, code, message }: Diagnostic): LogLine => ({
  message: `${severity === 'error' ? 'Error' : 'Warning'} ${code}: ${message}`,
  detail: true,
});

/** The log section of a compile that answered at `at`: its diagnostics, or the transport error it failed with. */
export function compileLines(at: Date, diagnostics: readonly Diagnostic[], failure: string | null): LogLine[] {
  const head: LogLine = { time: stamp(at), message: 'Compile of the working copy' };
  if (failure !== null) return [head, { message: `The mapping could not be compiled: ${failure}`, detail: true }];
  return [head, ...(diagnostics.length > 0 ? diagnostics.map(diagnosticLine) : [{ message: 'No diagnostics.', detail: true }])];
}

/** What a run ended in: the service's answer, or the title of the error the call failed with. */
export type RunAnswer = { result: TestResult } | { failure: string };

function outcome(result: TestResult): LogLine {
  switch (result.kind) {
    case 'output':
      return { message: 'Executed successfully' };
    case 'refused':
      return { message: 'Compile refused the working copy: nothing ran.' };
    case 'error': {
      const { code, message, authoringId } = result.error;
      return { message: `Runtime error ${code}: ${message}${authoringId === undefined ? '' : ` (${authoringId})`}` };
    }
  }
}

/** The log section of a run from `start` to `end` (the prototype's Start and End of test): its diagnostics and outcome. */
export function runLines(start: Date, end: Date, answer: RunAnswer): LogLine[] {
  const body = 'failure' in answer ? [{ message: `The test could not run: ${answer.failure}` }] : [...answer.result.diagnostics.map(diagnosticLine), outcome(answer.result)];
  return [{ time: stamp(start), message: 'Start of test' }, ...body, { time: stamp(end), message: 'End of test' }];
}

/** The processing log: the latest compile's section and the last run's, in the order they began. */
export function logLines(...sections: (LogSection | null)[]): LogLine[] {
  return sections
    .filter((s): s is LogSection => s !== null)
    .sort((a, b) => a.at - b.at)
    .flatMap((s) => s.lines);
}

/** The log as text to copy: a detail indented, each line after its time. */
export const logText = (lines: readonly LogLine[]) => lines.map((l) => `${l.detail ? '  ' : ''}${l.time ? `${l.time} ` : ''}${l.message}`).join('\n');

export interface TestSessionState {
  /** The source document as typed; kept in the browser per mapping. */
  source: string;
  /** The latest compile's log section, from when the studio opened. */
  compileLog: LogSection | null;
  /** The last run's log section, with the trace level it showed (a preview, never sent). */
  runLog: (LogSection & { level: string }) | null;
  /** Whether the last run ended without an output: refused, a runtime error, or a failed call. */
  runFailed: boolean;
  running: boolean;
  setSource: (source: string) => void;
  /**
   * Runs the working copy on the source document (ADR-0013: the working copy, saved or not) and keeps the answer in the
   * working copy's store (its trace for the display queue) and the log; a run under way ignores another.
   */
  runTest: (level: string) => Promise<void>;
}

/**
 * The Test tab's session of one open mapping (the prototype's useSimulationSession): the source document, the processing
 * log and the run under way. It outlives the tab, so that the log and the source stay while another tab is open.
 * `run` sends a test run of the mapping to the service.
 */
export function createTestSession(
  workingCopy: WorkingCopyStore,
  run: (request: TestRequest) => Promise<TestResult>,
  mappingId: string,
  browserState: BrowserStateStore,
  now: () => Date = () => new Date(),
) {
  const kept = browserState.read(testSourceKey(mappingId));
  return createStore<TestSessionState>()((set, get) => ({
    source: typeof kept === 'string' ? kept : '',
    compileLog: null,
    runLog: null,
    runFailed: false,
    running: false,
    setSource: (source) => {
      set({ source });
      browserState.write(testSourceKey(mappingId), source);
    },
    runTest: async (level) => {
      if (get().running) return;
      const sent = workingCopy.getState().workingCopy;
      const start = now();
      set({ running: true });
      let answer: RunAnswer;
      try {
        const result = await run({ model: sent, input: get().source });
        workingCopy.getState().recordRun(sent, result);
        answer = { result };
      } catch (error) {
        answer = { failure: describeError(error).title };
      }
      set({
        running: false,
        runFailed: !('result' in answer) || answer.result.kind !== 'output',
        runLog: { at: start.getTime(), level, lines: runLines(start, now(), answer) },
      });
    },
  }));
}

export type TestSession = ReturnType<typeof createTestSession>;

/** Keeps each compile of the working copy as the log's compile section, stamped when it answered; returns the unsubscribe. */
export function followCompiles(session: TestSession, workingCopy: WorkingCopyStore, now: () => Date = () => new Date()): () => void {
  return workingCopy.subscribe((state, previous) => {
    if (state.compiles === previous.compiles) return;
    const at = now();
    session.setState({ compileLog: { at: at.getTime(), lines: compileLines(at, state.diagnostics, state.compileFailure) } });
  });
}

const instanceKey = (i: TestInstance | undefined) => (i ? `${i.id}:${i.lastUsed}:${i.revision ?? 0}` : '');

/**
 * Makes the source document follow the test instance library (#170, the prototype's useSimulationSession): a change of
 * the current instance of the source's format, by selection, a save over it, a new one, a delete or a revert, loads its
 * document and values, as does a document the instance tools load from a file. At the start an empty source takes the
 * current instance's document. Returns the unsubscribe.
 */
export function followInstances(session: TestSession, workingCopy: WorkingCopyStore, browserState: BrowserStateStore, mappingId: string): () => void {
  const library = testInstances(workingCopy, browserState, mappingId);
  const preview = testPreview(workingCopy, browserState, mappingId);
  const current = () => {
    const source = workingCopy.getState().workingCopy.source;
    return source && currentInstance(library.getState().value, formatOf(source));
  };
  const take = (instance: TestInstance) => {
    session.getState().setSource(instance.text);
    preview.setState({ values: instance.values });
  };
  let shown = current();
  if (shown && session.getState().source === '') take(shown);
  const unfollowLibrary = library.subscribe(() => {
    const next = current();
    if (instanceKey(next) !== instanceKey(shown) && next) take(next);
    shown = next;
  });
  const unfollowFiles = testInput(workingCopy).subscribe((state) => session.getState().setSource(state.text!));
  return () => {
    unfollowLibrary();
    unfollowFiles();
  };
}

/**
 * The test session of the open mapping, for as long as the studio is open, following its compiles and test instances;
 * its runs are a TanStack Query mutation (ADR-0013), whose `mutateAsync` stays the same for the life of the hook.
 */
export function useTestSession(workingCopy: WorkingCopyStore, api: ApiClient, mappingId: string, browserState: BrowserStateStore): TestSession {
  const { mutateAsync: run } = useMutation({ mutationFn: (request: TestRequest) => api.runTest(mappingId, request) });
  const [session] = useState(() => createTestSession(workingCopy, run, mappingId, browserState));
  useEffect(() => followCompiles(session, workingCopy), [session, workingCopy]);
  useEffect(() => followInstances(session, workingCopy, browserState, mappingId), [session, workingCopy, browserState, mappingId]);
  return session;
}
