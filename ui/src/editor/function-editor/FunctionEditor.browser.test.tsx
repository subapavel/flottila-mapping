import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { ApiProblem, type ApiClient } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import { canvasKey, type BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;
const DRAFT = 'drafts/graph';
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

/** OrderId and a constant into concat, which is the result; toUpperCase reads OrderId but feeds nothing. */
const graphMapping: MappingModel = {
  ...corpusMapping,
  targetFieldMappings: {
    [ORDER_ID]: {
      id: 't1',
      result: 'f1',
      boxes: {
        a1: { kind: 'source', field: ORDER_ID },
        c1: { kind: 'function', fn: 'constant', params: { value: '-' } },
        f1: { kind: 'function', fn: 'concat', inputs: ['a1', 'c1'] },
        u1: { kind: 'function', fn: 'toUpperCase', inputs: ['a1'] },
      },
    },
  },
};

const box = (id: string) => page.getByTestId(`box:${id}`);
const node = (id: string) => page.getByTestId(`rf__node-${id}`);
const edges = () => page.getByTestId(/^rf__edge-/);
const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const transformOf = (id: string) => (node(id).element() as HTMLElement).style.transform;
const viewportTransform = () => (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform;
/** React Flow starts a drag on the first pointer move and moves the box on the next ones. */
const dragBox = (id: string, onto: ReturnType<typeof page.getByRole>) => userEvent.dragAndDrop(box(id), onto, { steps: 5 });

function memoryBrowserState(): BrowserStateStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return { values, read: (key) => structuredClone(values.get(key)), write: (key, value) => void values.set(key, structuredClone(value)) };
}

interface Canvas {
  positions?: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}
const canvasOf = (state: BrowserStateStore) => state.read(canvasKey(DRAFT, 't1')) as Canvas | undefined;

/** A host that owns the selected target field, as ADR-0013 asks: controlled state. */
function Host({ api, browserState, field }: { api: ApiClient; browserState: BrowserStateStore; field: string | null }) {
  const [selected, setSelected] = useState(field);
  return <MappingEditor mappingId={DRAFT} api={api} browserState={browserState} selectedField={selected} onSelectField={setSelected} />;
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(options: { api?: ApiClient; browserState?: BrowserStateStore; field?: string | null } = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <Host
      api={options.api ?? fakeApiClient({ [DRAFT]: graphMapping })}
      browserState={options.browserState ?? memoryBrowserState()}
      field={options.field === undefined ? ORDER_ID : options.field}
    />,
  );
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = undefined;
}

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  unmount();
  // every test fails on console.error (ADR-0013)
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('the canvas of the selected target field', () => {
  test('renders one node per box, one wire per used input slot, and the target field as a sink fed by result', async () => {
    render();

    for (const id of ['a1', 'c1', 'f1', 'u1']) await expect.element(box(id)).toBeVisible();
    await expect.element(box('f1')).toHaveTextContent('concatab');
    await expect.element(box('a1')).toHaveTextContent('OrderId');
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toHaveTextContent('OrderId');
    await expect.poll(() => edges().elements().map((e) => e.dataset.testid).sort()).toEqual(
      ['rf__edge-a1->f1#0', 'rf__edge-a1->u1#0', 'rf__edge-c1->f1#1', 'rf__edge-f1->:sink'].sort(),
    );
    // opened without a kept zoom, the canvas fits the graph into view
    await expect.poll(viewportTransform).not.toBe('translate(0px, 0px) scale(1)');
  });

  test('dims an unreachable box', async () => {
    render();

    await expect.element(box('u1')).toHaveStyle({ opacity: '0.4' });
    for (const id of ['a1', 'c1', 'f1']) await expect.element(box(id)).toHaveStyle({ opacity: '1' });
  });

  test('without a selected target field it asks for one, and a field without a mapping says so', async () => {
    render({ field: null });
    await expect.element(page.getByText('Select a target field to see its function graph.')).toBeVisible();
    unmount();

    render({ field: NOTE });
    await expect.element(page.getByText('Note has no function graph yet.')).toBeVisible();
  });

  test('a catalogue that cannot be read shows the error instead of the canvas', async () => {
    render({ api: { ...fakeApiClient({ [DRAFT]: graphMapping }), getCatalogue: () => Promise.reject(new TypeError('Failed to fetch')) } });

    await expect.element(page.getByRole('region', { name: 'Function editor' }).getByRole('alert')).toHaveTextContent('Failed to fetch');
    await expect.element(box('f1')).not.toBeInTheDocument();
  });
});

describe('positions and zoom (browser state, never the model)', () => {
  test('dragging a box moves it, keeps the working copy the same model, and the position survives a reload', async () => {
    const browserState = memoryBrowserState();
    render({ browserState });
    await expect.element(box('u1')).toBeVisible();
    const arranged = transformOf('u1');

    await dragBox('u1', page.getByTestId(`sink:${ORDER_ID}`));

    await expect.poll(() => transformOf('u1')).not.toBe(arranged);
    const dragged = transformOf('u1');
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(canvasOf(browserState)?.positions?.u1).toBeDefined();

    unmount();
    render({ browserState });
    await expect.element(box('u1')).toBeVisible();
    expect(transformOf('u1')).toBe(dragged);
  });

  test('Arrange lays the graph out again and clears the kept positions, and keeps the zoom', async () => {
    const browserState = memoryBrowserState();
    browserState.write(canvasKey(DRAFT, 't1'), { viewport: { x: 10, y: 20, zoom: 0.5 } });
    render({ browserState });
    await expect.element(box('u1')).toBeVisible();
    const arranged = transformOf('u1');
    await dragBox('u1', page.getByTestId(`sink:${ORDER_ID}`));
    await expect.poll(() => transformOf('u1')).not.toBe(arranged);

    await page.getByRole('button', { name: 'Arrange' }).click();

    await expect.poll(() => transformOf('u1')).toBe(arranged);
    expect(canvasOf(browserState)).toEqual({ viewport: { x: 10, y: 20, zoom: 0.5 } });
  });

  test('a new box appears next to the graph, the boxes already there keep their positions, and so does it', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    await dragBox('u1', page.getByTestId(`sink:${ORDER_ID}`));
    const dragged = transformOf('u1');
    const before = ['a1', 'c1', 'f1'].map(transformOf);

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await expect.poll(() => page.getByTestId(/^box:/).elements().length).toBe(5);
    expect(transformOf('u1')).toBe(dragged);
    expect(['a1', 'c1', 'f1'].map(transformOf)).toEqual(before);
    const added = page.getByTestId(/^box:/).elements().map((e) => e.dataset.testid!.slice('box:'.length)).find((id) => !['a1', 'c1', 'f1', 'u1'].includes(id))!;
    const placed = transformOf(added);

    // the new box went below the graph; moving another box further down must not move it again
    await dragBox('u1', page.getByRole('button', { name: 'Run test' }));

    await expect.poll(() => transformOf('u1')).not.toBe(dragged);
    expect(transformOf(added)).toBe(placed);
  });

  test('the zoom is kept per target field mapping and restored on open, next to the kept positions', async () => {
    const browserState = memoryBrowserState();
    browserState.write(canvasKey(DRAFT, 't1'), { viewport: { x: 10, y: 20, zoom: 0.75 } });
    render({ browserState });
    await expect.element(box('u1')).toBeVisible();
    expect(viewportTransform()).toBe('translate(10px, 20px) scale(0.75)');
    await dragBox('u1', page.getByTestId(`sink:${ORDER_ID}`));
    await expect.poll(() => canvasOf(browserState)?.positions?.u1).toBeDefined();

    await page.getByRole('button', { name: 'Zoom In' }).click();

    await expect.poll(() => canvasOf(browserState)?.viewport?.zoom ?? 0).toBeGreaterThan(0.75);
    expect(canvasOf(browserState)?.positions?.u1).toBeDefined();
  });
});

describe('selection', () => {
  test('clicking a box selects it, and clicking the canvas pane clears it', async () => {
    render();
    await expect.element(box('c1')).toBeVisible();

    await box('c1').click();
    await expect.element(node('c1')).toHaveClass('selected');

    // the sink is the target field, not a box: clicking it leaves the selected box selected
    await page.getByTestId(`sink:${ORDER_ID}`).click();
    await expect.element(node(':sink')).not.toHaveClass('selected');
    await expect.element(node('c1')).toHaveClass('selected');

    await userEvent.click(page.getByTestId('rf__wrapper'), { position: { x: 5, y: 5 } });
    await expect.element(node('c1')).not.toHaveClass('selected');
  });

  test("a diagnostic at a box's authoring id selects its target field and the box; an id the model lacks selects nothing", async () => {
    const refused = new ApiProblem({
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [
        { severity: 'error', code: 'box-cycle', message: 'a cycle', location: { kind: 'authoring-id', authoringId: 'c1' } },
        { severity: 'error', code: 'box-cycle', message: 'gone', location: { kind: 'authoring-id', authoringId: 'zz' } },
      ],
    });
    render({ api: { ...fakeApiClient({ [DRAFT]: graphMapping }), saveMapping: () => Promise.reject(refused) }, field: null });
    await userEvent.dragAndDrop(sourceRow(NOTE), targetRow(NOTE));
    await page.getByRole('button', { name: 'Save' }).click();

    await page.getByRole('button', { name: 'Show zz' }).click();
    await expect.element(page.getByText('Select a target field to see its function graph.')).toBeVisible();

    await page.getByRole('button', { name: 'Show c1' }).click();
    await expect.element(node('c1')).toHaveClass('selected');
    await expect.element(node('f1')).not.toHaveClass('selected');
  });
});
