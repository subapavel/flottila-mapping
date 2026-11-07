import '@patternfly/react-core/dist/styles/base.css';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import type { ApiClient, TestResult } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

// The inspector's density (spec #145, ticket #147), measured at 1440×900 with PatternFly's base css: the values come
// from prototype-round2.css @ 3a5ed86 (.insp, .insp__kind, .insp__title, .insp__path, .insp__param).
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';
const DRAFT = 'drafts/density';
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;
/** OrderId: its source-field box a1, the result, and a formatNum n1, which has a pattern param. */
const model: MappingModel = {
  ...corpusMapping,
  targetFieldMappings: {
    [ORDER_ID]: { ...corpusMapping.targetFieldMappings![ORDER_ID]!, boxes: { ...corpusMapping.targetFieldMappings![ORDER_ID]!.boxes, n1: { kind: 'function', fn: 'formatNum' } } },
  },
};
/** A run whose trace holds a1's queue of two contexts, three values. */
const run: TestResult = {
  kind: 'output',
  output: '<Order/>',
  diagnostics: [],
  trace: { a1: { kind: 'queue', contexts: [['42', '43'], ['44']], capped: false, slotCount: 3, contextCount: 2 } },
};
const api = (): ApiClient => fakeApiClient({ [DRAFT]: model }, { test: { [DRAFT]: run } });

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

const inspector = page.getByRole('complementary', { name: 'Inspector' });
const px = (element: Element, property: 'fontSize' | 'width') => getComputedStyle(element)[property];

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
  root.render(<MappingEditor mappingId={DRAFT} api={api()} browserState={memoryBrowserState()} selectedField={ORDER_ID} />);
});

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = undefined;
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the inspector density (spec #145, "Inspector density")', () => {
  test('the target field view: 12 px text, the kind 10 px upper case, the title 16 px bold, the path 11 px mono', async () => {
    const title = inspector.getByRole('heading', { name: 'OrderId', exact: true });
    await expect.element(title).toBeVisible();

    expect(px(inspector.element(), 'fontSize')).toBe('12px');
    const kind = inspector.getByText('target field', { exact: true }).element();
    expect(px(kind, 'fontSize')).toBe('10px');
    expect(getComputedStyle(kind).textTransform).toBe('uppercase');
    expect(px(title.element(), 'fontSize')).toBe('16px');
    expect(getComputedStyle(title.element()).fontWeight).toBe('700');
    const path = inspector.getByText(ORDER_ID, { exact: true }).element();
    expect(px(path, 'fontSize')).toBe('11px');
    expect(getComputedStyle(path).fontFamily).toMatch(/mono/i);
  });

  test('the box view: the title 16 px, a section heading ruled below, a param label 90 px wide', async () => {
    const node = page.getByTestId('rf__node-n1');
    await expect.element(node).toBeVisible();
    (node.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    const title = inspector.getByTestId('inspector:n1');
    await expect.element(title).toBeVisible();

    expect(px(title.element(), 'fontSize')).toBe('16px');
    const parameters = inspector.getByRole('heading', { name: 'Parameters' }).element();
    expect(getComputedStyle(parameters).borderBottomStyle).toBe('solid');
    const label = inspector.getByText('pattern', { exact: true }).element();
    expect(px(label, 'width')).toBe('90px');
  });

  test("the display queue as the prototype's compact .dq: result, id and size on the heading line, ctx n over a 3 px bar, 1 px value boxes", async () => {
    const queue = inspector.getByRole('region', { name: 'Display queue', exact: true });
    // before a run, the result box's queue under its heading line
    await expect.element(queue).toHaveTextContent('Display queue result a1No trace: run a test.');

    await page.getByRole('tab', { name: 'Test' }).click();
    await page.getByRole('button', { name: 'Run test' }).click();
    await expect.element(page.getByRole('figure', { name: 'Target message' })).toBeVisible();
    await page.getByRole('tab', { name: 'Editor' }).click();

    const result = inspector.getByRole('region', { name: 'Display queue of the target field' });
    await expect.element(result).toMatchTextContent('Result queue a1 · 2 contexts, 3 slots');
    const first = result.getByTitle('context 1', { exact: true });
    await expect.element(first).toHaveTextContent('4243');
    await expect.element(result.getByTitle('context 2', { exact: true })).toHaveTextContent('44');
    const bar = getComputedStyle(first.element());
    expect([bar.borderLeftWidth, bar.borderLeftStyle, bar.borderLeftColor]).toEqual(['3px', 'solid', 'rgb(21, 21, 21)']);
    expect(getComputedStyle(first.element(), '::before').content).toMatch(/^"ctx "/);
    const value = getComputedStyle(first.getByText('42', { exact: true }).element());
    expect([value.borderTopWidth, value.borderTopColor, value.paddingLeft]).toEqual(['1px', 'rgb(184, 187, 190)', '5px']);
    expect(value.fontFamily).toMatch(/mono/i);
    // its slot number, counted across the contexts, superscript in the box (.dq__slot sup)
    const number = getComputedStyle(first.getByText('42', { exact: true }).element(), '::before');
    expect([number.content, number.verticalAlign, number.fontSize]).toEqual(['counter(fm-slot)', 'super', '8px']);
    // the last context closes the bracket
    expect(getComputedStyle(result.getByTitle('context 2', { exact: true }).element()).borderRightWidth).toBe('3px');
  });
});
