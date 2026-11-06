import '@patternfly/react-core/dist/styles/base.css';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { ApiClient, FieldDto, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

// The prototype's density (spec #145, ticket #146), measured at 1440×900 with PatternFly's base css: the values come
// from prototype.css @ 3a5ed86 (.ftree__row, .ftree__name.is-attr, body).
const field = (step: string, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min: 0,
  max: 1,
  ...(extra.type === undefined ? { valueType: 'xs:string' } : {}),
  nillable: false,
  ...extra,
});

/** Invoice holds @version and 40 leaf elements: 42 rows with only the root expanded. */
const invoice: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:invoice',
  root: field('Invoice', { type: 'invoice', min: 1 }),
  types: { invoice: [field('@version'), ...Array.from({ length: 40 }, (_, i) => field(`Line${i + 1}`))] },
};
const DRAFT = 'drafts/invoice';
const model: MappingModel = { ...(JSON.parse(corpusMappingText) as MappingModel), targetFieldMappings: {} };
const api = (): ApiClient => ({ ...fakeApiClient({ [DRAFT]: model }), loadStructure: async () => invoice });

const tree = (side: 'Source' | 'Target') => page.getByRole('tree', { name: `${side} structure` });
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const nameOf = (path: string) => targetRow(path).element().querySelector<HTMLElement>('[class*="__name"]')!;

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeAll(() => page.viewport(1440, 900));
afterAll(() => page.viewport(414, 896));

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={DRAFT} api={api()} browserState={memoryBrowserState()} />);
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the prototype density (spec #145, "Density")', () => {
  test('the editor text is 13 px', async () => {
    await expect.element(tree('Target')).toBeVisible();

    const editor = page.getByRole('heading', { name: DRAFT }).element().closest('.fm-editor')!;
    expect(getComputedStyle(editor).fontSize).toBe('13px');
  });

  test('a tree row is 26 px high', async () => {
    await expect.element(targetRow('/Invoice/Line1')).toBeVisible();

    expect(targetRow('/Invoice/Line1').element().getBoundingClientRect().height).toBe(26);
  });

  test('an attribute name is purple, an element name is not, and a name is 12 px', async () => {
    await expect.element(targetRow('/Invoice/@version')).toBeVisible();

    const attribute = getComputedStyle(nameOf('/Invoice/@version'));
    const element = getComputedStyle(nameOf('/Invoice/Line1'));
    expect(attribute.color).toBe('rgb(138, 75, 175)');
    expect(element.color).not.toBe(attribute.color);
    expect(element.fontSize).toBe('12px');
  });

  // measured at the default split with the page tabs (#146): a rows area of 325 px / 26 px rows = 12 rows
  test('the target tree shows at least 12 rows in the overview’s default height', async () => {
    await expect.element(targetRow('/Invoice/Line1')).toBeVisible();

    const scroll = tree('Target').element().getBoundingClientRect();
    const shown = [...tree('Target').element().querySelectorAll('[role="treeitem"]')].filter((row) => {
      const r = row.getBoundingClientRect();
      return r.top >= scroll.top && r.bottom <= scroll.bottom;
    });
    expect(shown.length).toBeGreaterThanOrEqual(12);
  });
});
