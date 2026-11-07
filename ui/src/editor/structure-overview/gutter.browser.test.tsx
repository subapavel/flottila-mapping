import '@patternfly/react-core/dist/styles/base.css';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { ApiClient, Diagnostic, FieldDto, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel, TargetFieldMapping } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

// The link gutter's reading (spec #145 "Gutter", ticket #148), measured at 1440×900 with PatternFly's base css: the
// values come from LinkedTrees.tsx and prototype-round2.css (.lk*, .fx*, .lt__count*) and prototype.css (.mk--used)
// @ 3a5ed86.
const field = (step: string): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min: 0,
  max: 1,
  valueType: 'xs:string',
  nillable: false,
});

/** Invoice holds @version and 40 leaf elements: 42 rows of 26 px, about 12 of them in the overview's height. */
const invoice: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:invoice',
  root: { ...field('Invoice'), type: 'invoice', min: 1 },
  types: { invoice: [field('@version'), ...Array.from({ length: 40 }, (_, i) => field(`Line${i + 1}`))] },
};
const line = (n: number) => `/Invoice/Line${n}`;
const copy = (id: string, source: string): TargetFieldMapping => ({ id, result: `${id}a`, boxes: { [`${id}a`]: { kind: 'source', field: source } } });

/**
 * Line1, Line2 and Line4 are copied from themselves, Line4 marked unmapped mandatory by compile; Line5 reads a source
 * field the structure lacks (orphaned); Line6 is refused by compile at its box (error); Line30 and Line31, below the
 * target tree's first screen, read Line7 and Line8, on the source tree's first screen.
 */
const model: MappingModel = {
  ...(JSON.parse(corpusMappingText) as MappingModel),
  targetFieldMappings: {
    [line(1)]: copy('t1', line(1)),
    [line(2)]: copy('t2', line(2)),
    [line(4)]: copy('t4', line(4)),
    [line(5)]: copy('t5', '/Invoice/Gone'),
    [line(6)]: copy('t6', line(6)),
    [line(30)]: copy('t30', line(7)),
    [line(31)]: copy('t31', line(8)),
  },
};
const compiled: Diagnostic[] = [
  {
    severity: 'error',
    code: 'unmapped-mandatory-leaf',
    message: 'the mandatory target leaf has no target field mapping',
    location: { kind: 'pointer', pointer: `/targetFieldMappings/${line(4).replaceAll('/', '~1')}` },
  },
  { severity: 'error', code: 'unsupported-box-kind', message: 'refused', location: { kind: 'authoring-id', authoringId: 't6a' } },
];
const DRAFT = 'drafts/gutter';
const api = (): ApiClient => ({ ...fakeApiClient({ [DRAFT]: model }, { compile: { [DRAFT]: compiled } }), loadStructure: async () => invoice });

const tree = (side: 'Source' | 'Target') => page.getByRole('tree', { name: `${side} structure` });
const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const fieldLink = (source: string, target: string) => page.getByTestId(`field-link:${source}->${target}`);
const fxMark = (target: string) => page.getByTestId(`fx-mark:${target}`);
const titleOf = (element: Element) => element.querySelector(':scope > title')?.textContent;
const style = (element: Element) => getComputedStyle(element);

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(selectedField: string | null = null) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={DRAFT} api={api()} browserState={memoryBrowserState()} selectedField={selectedField} />);
}

beforeAll(() => page.viewport(1440, 900));
afterAll(() => page.viewport(414, 896));

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

describe('the link gutter (spec #145, "Gutter")', () => {
  test('with a target field selected, its links are strong and titled, and the others are dimmed', async () => {
    render(line(1));
    await expect.element(fieldLink(line(2), line(2))).toBeInTheDocument();

    const selected = fieldLink(line(1), line(1)).element();
    expect(selected.classList).toContain('fm-gutter__link--sel');
    expect(titleOf(selected)).toBe('Invoice/Line1 → Invoice/Line1');
    expect(style(selected).strokeWidth).toBe('2.6px');
    expect(style(selected).opacity).toBe('1');
    const other = fieldLink(line(2), line(2)).element();
    expect(other.classList).toContain('fm-gutter__link--dim');
    expect(Number(style(other).opacity)).toBeLessThan(0.3);
    expect(titleOf(other)).toBe('Invoice/Line2 → Invoice/Line2');
  });

  test('with none selected, every link is drawn at 1.3 px and 0.8 opacity', async () => {
    render();
    await expect.element(fieldLink(line(1), line(1))).toBeInTheDocument();

    const link = fieldLink(line(1), line(1)).element();
    expect(style(link).strokeWidth).toBe('1.3px');
    expect(style(link).opacity).toBe('0.8');
  });

  test('each mapped target row has one fx mark, titled and coloured by its field status, the selected one filled', async () => {
    render(line(1));
    await expect.element(targetRow(line(4)).getByRole('img', { name: 'Unmapped mandatory' })).toBeVisible();

    const rect = (target: string) => style(fxMark(target).element().querySelector('rect')!);
    expect(titleOf(fxMark(line(4)).element())).toBe('Unmapped mandatory');
    expect(rect(line(4)).stroke).toBe('rgb(201, 25, 11)');
    expect(rect(line(4)).fill).toBe('rgb(250, 234, 232)');
    expect(titleOf(fxMark(line(5)).element())).toBe('Orphaned');
    expect(rect(line(5)).stroke).toBe('rgb(236, 122, 8)');
    expect(titleOf(fxMark(line(6)).element())).toBe('Error');
    expect(rect(line(6)).stroke).toBe('rgb(201, 25, 11)');
    expect(titleOf(fxMark(line(2)).element())).toBe('Mapped');
    expect(rect(line(2)).stroke).toBe('rgb(0, 102, 204)');
    expect(rect(line(2)).fill).toBe('rgb(231, 241, 250)');
    expect(rect(line(1)).fill).toBe('rgb(0, 102, 204)');
    await expect.element(fxMark(line(3))).not.toBeInTheDocument();
  });

  test('scrolling the target tree so that mapped rows leave the view counts them in the gutter’s corners, titled', async () => {
    render();
    await expect.element(targetRow(line(1))).toBeVisible();
    const below = page.getByTitle('links to target rows scrolled below');
    const above = page.getByTitle('links to target rows scrolled above');
    await expect.element(below).toHaveTextContent('↓2');
    await expect.element(above).not.toBeInTheDocument();

    const target = tree('Target').element() as HTMLElement;
    target.scrollTop = target.scrollHeight;

    // Line1, Line2, Line4 and Line6; Line5's link has no source row
    await expect.element(above).toHaveTextContent('↑4');
    await expect.element(below).not.toBeInTheDocument();
    await expect.element(fxMark(line(1))).not.toBeInTheDocument();

    target.scrollTop = 0;

    await expect.element(below).toHaveTextContent('↓2');
    const gutter = page.getByLabelText('Field links').element().parentElement!.getBoundingClientRect();
    const count = below.element().getBoundingClientRect();
    expect(gutter.right - count.right).toBeLessThanOrEqual(4);
    expect(gutter.bottom - count.bottom).toBeLessThanOrEqual(4);
    expect(style(below.element()).fontSize).toBe('10px');
  });

  test('a source field the mapping reads has the used mark at its row’s end; an unread one has none', async () => {
    render();
    await expect.element(sourceRow(line(9))).toBeVisible();

    const used = sourceRow(line(1)).getByTitle('used by the mapping');
    await expect.element(used).toBeVisible();
    expect(style(used.element()).color).toBe('rgb(0, 102, 204)');
    await expect.element(sourceRow(line(7)).getByTitle('used by the mapping')).toBeVisible();
    await expect.element(sourceRow(line(9)).getByTitle('used by the mapping')).not.toBeInTheDocument();
    await expect.element(targetRow(line(1)).getByTitle('used by the mapping')).not.toBeInTheDocument();
  });

  test('a source field keeps its used mark when the status filter hides its link (the prototype reads the model, not the drawn links)', async () => {
    render();
    await expect.element(fieldLink(line(1), line(1))).toBeInTheDocument();

    await page.getByRole('group', { name: 'Status filter' }).getByRole('button', { name: 'Error', exact: true }).click();

    await expect.element(fieldLink(line(6), line(6))).toBeInTheDocument();
    await expect.element(fieldLink(line(1), line(1))).not.toBeInTheDocument();
    await expect.element(sourceRow(line(1)).getByTitle('used by the mapping')).toBeVisible();
  });
});
