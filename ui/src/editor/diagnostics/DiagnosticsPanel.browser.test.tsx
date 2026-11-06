import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import type { Diagnostic } from '../../api/client';
import type { MappingModel } from '../../generated/mapping-model';
import { createWorkingCopyStore } from '../store/working-copy';
import { DiagnosticsPanel } from './DiagnosticsPanel';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;
// the corpus mapping: OrderId <- a1 at the target field mapping t1
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

/** Renders the panel over a store of the corpus mapping holding `diagnostics`; resolves to the selection spy. */
function render(diagnostics: Diagnostic[], compileFailure: string | null = null) {
  const store = createWorkingCopyStore(corpusMapping, {
    newId: () => 'x1',
    save: async (model) => model,
    compile: () => new Promise<Diagnostic[]>(() => {}),
  });
  store.setState({ diagnostics, compileFailure });
  const onSelectField = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<DiagnosticsPanel store={store} onSelectField={onSelectField} />);
  return onSelectField;
}

const item = (code: string) => page.getByRole('listitem').filter({ hasText: code });

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the Diagnostics panel', () => {
  test('lists each diagnostic with its severity, code, location and message', async () => {
    render([
      { severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 'f9' } },
      { severity: 'error', code: 'unconnected-target-field', message: 'not connected', location: { kind: 'authoring-id', authoringId: 't1' } },
    ]);

    const list = page.getByRole('list', { name: 'Working copy diagnostics' });
    await expect.element(list.getByRole('listitem').nth(0)).toHaveTextContent('warning unreachable-box f9: not reached');
    await expect.element(list.getByRole('listitem').nth(1)).toHaveTextContent('error unconnected-target-field t1: not connected');
  });

  test('says so when there are no diagnostics', async () => {
    render([]);

    await expect.element(page.getByText('No diagnostics')).toBeVisible();
    await expect.element(page.getByRole('list')).not.toBeInTheDocument();
  });

  test("an authoring id selects its target field mapping's field, by a box id or the mapping id", async () => {
    const onSelectField = render([
      { severity: 'error', code: 'orphaned-reference', message: 'gone', location: { kind: 'authoring-id', authoringId: 'a1' } },
      { severity: 'error', code: 'unsupported-field', message: 'unsupported', location: { kind: 'authoring-id', authoringId: 't1' } },
    ]);

    await item('orphaned-reference').getByRole('button', { name: 'a1' }).click();
    await item('unsupported-field').getByRole('button', { name: 't1' }).click();

    expect(onSelectField.mock.calls).toEqual([
      ['target', ORDER_ID],
      ['target', ORDER_ID],
    ]);
  });

  test('a /targetFieldMappings/<path> pointer selects that target row', async () => {
    const pointer = '/targetFieldMappings/~1Q{urn:flottila:corpus:skeleton}Order~1Note';
    const onSelectField = render([
      { severity: 'error', code: 'unmapped-mandatory-leaf', message: 'unmapped', location: { kind: 'pointer', pointer } },
    ]);

    await item('unmapped-mandatory-leaf').getByRole('button', { name: pointer }).click();

    expect(onSelectField.mock.calls).toEqual([['target', NOTE]]);
  });

  test('a {side, fieldPath} location selects that tree row', async () => {
    const onSelectField = render([
      {
        severity: 'error',
        code: 'orphaned-reference',
        message: 'gone',
        location: { kind: 'field-path', side: 'source', fieldPath: NOTE },
      },
    ]);

    await item('orphaned-reference').getByRole('button', { name: NOTE }).click();

    expect(onSelectField.mock.calls).toEqual([['source', NOTE]]);
  });

  test('a file position shows as file:line:column text', async () => {
    render([
      {
        severity: 'error',
        code: 'schema-not-well-formed',
        message: 'not well-formed',
        location: { kind: 'file-position', file: '../structures/skeleton/order.xsd', line: 12, column: 7 },
      },
    ]);

    await expect.element(item('schema-not-well-formed')).toHaveTextContent('error schema-not-well-formed ../structures/skeleton/order.xsd:12:7: not well-formed');
    await expect.element(item('schema-not-well-formed').getByRole('button')).not.toBeInTheDocument();
  });

  test('an authoring id the working copy lacks, and a pointer outside the target field mappings, show as text', async () => {
    render([
      { severity: 'error', code: 'fingerprint-mismatch', message: 'stale', location: { kind: 'pointer', pointer: '/source/fingerprint' } },
      { severity: 'error', code: 'box-cycle', message: 'a cycle', location: { kind: 'authoring-id', authoringId: 'gone' } },
    ]);

    await expect.element(item('fingerprint-mismatch')).toHaveTextContent('error fingerprint-mismatch /source/fingerprint: stale');
    await expect.element(item('box-cycle')).toHaveTextContent('error box-cycle gone: a cycle');
    await expect.element(page.getByRole('button')).not.toBeInTheDocument();
  });

  test('a compile that failed in transport is shown above the diagnostics', async () => {
    render([], 'Not found');

    await expect.element(page.getByRole('heading', { name: /could not be compiled/ })).toBeVisible();
    await expect.element(page.getByText('Not found')).toBeVisible();
  });
});
