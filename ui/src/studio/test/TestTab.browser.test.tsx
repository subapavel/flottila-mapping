import '@patternfly/react-core/dist/styles/base.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { ApiClient, Diagnostic, TestResult } from '../../api/client';
import { fakeApiClient, type FakeScenario } from '../../api/fake/fake-api';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import type { WorkingCopyStore } from '../../editor/store/working-copy';
import { studioStore } from '../shell/Studio';
import { StudioShell } from '../shell/StudioShell';

const MAPPING = 'mappings/order-id-copy';
const INPUT = '<Order xmlns="urn:flottila:corpus:skeleton"><OrderId>PO-1</OrderId></Order>';
const OUTPUT = '<Order xmlns="urn:flottila:corpus:skeleton"><OrderId>PO-1</OrderId></Order>';
const TIME = String.raw`\d{2}:\d{2}:\d{2}`;

const unreachable: Diagnostic = {
  severity: 'warning',
  code: 'unreachable-box',
  message: 'the box is not reached from the result',
  location: { kind: 'authoring-id', authoringId: 'a1' },
};
const output: TestResult = {
  kind: 'output',
  output: OUTPUT,
  diagnostics: [unreachable],
  trace: { a1: { kind: 'queue', contexts: [['PO-1']], capped: false, slotCount: 1, contextCount: 1 } },
};

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

/** The studio on the Test tab over a store the test holds. */
async function renderTest(options: { api?: ApiClient; editing?: boolean; browserState?: BrowserStateStore } = {}): Promise<WorkingCopyStore> {
  const api = options.api ?? fakeApiClient();
  const store = studioStore(api, MAPPING, await api.getMapping(MAPPING));
  store.getState().setTab('test');
  if (options.editing ?? true) store.getState().startEditing();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <QueryClientProvider client={queryClient}>
      <StudioShell mappingId={MAPPING} api={api} store={store} browserState={options.browserState ?? memoryBrowserState()} listHref="/" />
    </QueryClientProvider>,
  );
  return store;
}

const scenario = (fixtures: FakeScenario) => fakeApiClient(undefined, fixtures);
const source = () => page.getByRole('region', { name: 'Source', exact: true });
const result = () => page.getByRole('region', { name: 'Result', exact: true });
const log = () => page.getByRole('region', { name: 'Processing log' });
const runButton = () => page.getByRole('button', { name: 'Run simulation' });

beforeEach(async () => {
  await page.viewport(1440, 900);
  history.replaceState(null, '', window.location.pathname);
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  history.replaceState(null, '', window.location.pathname);
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the Test tab (#158)', () => {
  test('Run sends the working copy and the source document; the Result pane shows the output and the log the run', async () => {
    const api = scenario({ test: { [MAPPING]: output } });
    const runTest = vi.spyOn(api, 'runTest');
    const store = await renderTest({ api });
    await expect.element(log()).toMatchTextContent(/Ready\./);
    await expect.element(result()).toMatchTextContent('Run the simulation to display the XML result.');

    await source().getByRole('textbox', { name: 'Input XML' }).fill(INPUT);
    await runButton().click();

    await expect.element(result()).toMatchTextContent(OUTPUT);
    // only the working copy and the input go to the service: the trace level and parameters are previews (ADR-0028)
    expect(runTest).toHaveBeenCalledExactlyOnceWith(MAPPING, { model: store.getState().workingCopy, input: INPUT });
    await expect.element(log()).toMatchTextContent(new RegExp(`${TIME}Start of test`));
    await expect.element(log()).toMatchTextContent('Warning unreachable-box: the box is not reached from the result');
    await expect.element(log()).toMatchTextContent('Executed successfully');
    await expect.element(log()).toMatchTextContent(new RegExp(`${TIME}End of test$`));
    expect(store.getState().lastRun).toEqual(output);
  });

  test('a run compile refused shows its diagnostics in the log, and the Result pane that it failed', async () => {
    const refused: TestResult = {
      kind: 'refused',
      diagnostics: [{ severity: 'error', code: 'unconnected-target-field', message: 'the result is not connected', location: { kind: 'authoring-id', authoringId: 't1' } }],
    };
    await renderTest({ api: scenario({ test: { [MAPPING]: refused } }) });

    await source().getByRole('textbox', { name: 'Input XML' }).fill(INPUT);
    await runButton().click();

    await expect.element(log()).toMatchTextContent('Error unconnected-target-field: the result is not connected');
    await expect.element(log()).toMatchTextContent('Compile refused the working copy: nothing ran.');
    await expect.element(result()).toMatchTextContent('The simulation failed.');
  });

  test('a runtime error names its code, message and authoring id in the log', async () => {
    const failed: TestResult = { kind: 'error', error: { code: 'po:MINOCCURS', message: 'Row occurs 0 times', authoringId: 't1' }, diagnostics: [], trace: {} };
    await renderTest({ api: scenario({ test: { [MAPPING]: failed } }) });

    await source().getByRole('textbox', { name: 'Input XML' }).fill(INPUT);
    await runButton().click();

    await expect.element(log()).toMatchTextContent('Runtime error po:MINOCCURS: Row occurs 0 times (t1)');
    await expect.element(result()).toMatchTextContent('The simulation failed.');
  });

  test('a run the service answers with an error puts its title in the log', async () => {
    // the fake has no corpus case for this input
    await renderTest();

    await source().getByRole('textbox', { name: 'Input XML' }).fill('<Order/>');
    await runButton().click();

    await expect.element(log()).toMatchTextContent('The test could not run: Invalid request');
    await expect.element(result()).toMatchTextContent('The simulation failed.');
  });

  test('the latest compile of the working copy lists its diagnostics in the log, with its time', async () => {
    const missing: Diagnostic = { severity: 'error', code: 'unknown-function', message: 'no function named foo', location: { kind: 'authoring-id', authoringId: 'a1' } };
    const store = await renderTest({ api: scenario({ compile: { [MAPPING]: [missing] } }) });

    store.getState().setDescription('An edit compiles the working copy');

    await expect.element(log()).toMatchTextContent(new RegExp(`${TIME}Compile of the working copy`));
    await expect.element(log()).toMatchTextContent('Error unknown-function: no function named foo');
  });

  test('the result shows as a tree of its fields and values', async () => {
    await renderTest({ api: scenario({ test: { [MAPPING]: output } }) });
    await source().getByRole('textbox', { name: 'Input XML' }).fill(INPUT);
    await runButton().click();
    await expect.element(result()).toMatchTextContent(OUTPUT);

    await result().getByRole('button', { name: 'Tree', exact: true }).click();

    const tree = result().getByRole('table', { name: 'Result structure and values' });
    await expect.element(tree.getByRole('row', { name: /OrderId PO-1/ })).toBeVisible();
  });

  test('in view mode Run is disabled and the source read-only, as in the prototype', async () => {
    await renderTest({ editing: false });

    await expect.element(runButton()).toBeDisabled();
    await expect.element(source().getByRole('textbox', { name: 'Input XML' })).toHaveAttribute('readonly');
  });

  test('the trace level and the parameters are previews', async () => {
    await renderTest();

    const controls = page.getByRole('toolbar', { name: 'Simulation controls' });
    await expect.element(controls.getByRole('combobox', { name: 'Trace Level' })).toHaveValue('Warning');
    await expect.element(controls.getByText('Preview')).toBeVisible();
    await source().getByRole('button', { name: 'Parameters' }).click();
    await expect.element(source().getByRole('table', { name: 'Header Parameters' })).toBeVisible();
    await expect.element(source().getByText('Preview').first()).toBeVisible();
  });

  test('the source document stays when the tab is left and opened again', async () => {
    const store = await renderTest();
    await source().getByRole('textbox', { name: 'Input XML' }).fill(INPUT);

    store.getState().setTab('overview');
    await expect.element(source()).not.toBeInTheDocument();
    store.getState().setTab('test');

    await expect.element(source().getByRole('textbox', { name: 'Input XML' })).toHaveValue(INPUT);
  });
});
