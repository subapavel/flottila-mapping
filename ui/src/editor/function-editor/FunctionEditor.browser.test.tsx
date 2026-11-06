import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { ApiProblem, type ApiClient, type Diagnostic } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import { canvasKey, type BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';
import { FUNCTION_DRAG } from './palette';

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
const handle = (id: string) => page.getByTestId(id);
const edgeIds = () => edges().elements().map((e) => e.dataset.testid!.slice('rf__edge-'.length)).sort();
const boxCount = () => page.getByTestId(/^box:/).elements().length;
const boxIdsShown = () => page.getByTestId(/^box:/).elements().map((e) => e.dataset.testid!.slice('box:'.length));
/** The reconnect anchor at a wire's target end, the end that sits at the input. */
const wireEnd = (id: string) => page.elementLocator(page.getByTestId(`rf__edge-${id}`).element().querySelector('.react-flow__edgeupdater-target')!);
const pane = page.getByTestId('rf__wrapper');
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
  return (
    <>
      <button onClick={() => setSelected(NOTE)}>Host: open Note</button>
      <MappingEditor mappingId={DRAFT} api={api} browserState={browserState} selectedField={selected} onSelectField={setSelected} />
    </>
  );
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

// The split view (ADR-0012) gives the function editor a pane of the bottom half: at Vitest's default 414 x 896 the
// palette wraps above a canvas that the pane cannot show at once with it, and an HTML drag that has to scroll to its
// target is lost. A desktop viewport that shows the whole split view.
beforeAll(() => page.viewport(1280, 1100));
afterAll(() => page.viewport(414, 896));

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
    // a card's text: its caption, title, id, then the input slots (spec #135: the card shows caption and id too)
    await expect.element(box('f1')).toMatchTextContent(/^fnconcat.*f1ab$/);
    await expect.element(box('a1')).toMatchTextContent(/^source fieldOrderIda1/);
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toMatchTextContent(/^target fieldOrderId$/);
    await expect.poll(() => edges().elements().map((e) => e.dataset.testid).sort()).toEqual(
      ['rf__edge-a1->f1#0', 'rf__edge-a1->u1#0', 'rf__edge-c1->f1#1', 'rf__edge-f1->:sink'].sort(),
    );
    // opened without a kept zoom, the canvas fits the graph into view
    await expect.poll(viewportTransform).not.toBe('translate(0px, 0px) scale(1)');
  });

  test("a card shows its authoring id, and its parameter input is labelled by the parameter name", async () => {
    const target = graphMapping.targetFieldMappings![ORDER_ID]!;
    const withParam: MappingModel = {
      ...graphMapping,
      targetFieldMappings: {
        [ORDER_ID]: {
          ...target,
          boxes: {
            ...target.boxes,
            n1: { kind: 'function', fn: 'formatNum', inputs: ['a1'], params: { pattern: '#,##0.00' } },
            r1: { kind: 'unresolved', name: 'ByExample', origin: 'po', params: { table: { A: 'B', C: 'D' } } },
            s1: { kind: 'source', field: ORDER },
            s2: { kind: 'source', field: ORDER_ID, context: ORDER },
          },
        },
      },
    };
    render({ api: fakeApiClient({ [DRAFT]: withParam }) });

    await expect.element(box('n1')).toMatchTextContent(/^fnformatNum.*n1/);
    await expect.element(box('n1').getByRole('textbox', { name: 'pattern' })).toHaveValue('#,##0.00');
    // a table param shows its size; a source card its context, a field with no ancestor its own name
    await expect.element(box('r1')).toMatchTextContent(/^unresolvedByExample.*r1.*tabletable, 2 rows$/);
    await expect.element(box('s1').getByRole('combobox', { name: 'read in' })).toHaveValue(ORDER);
    await expect.element(box('s2').getByRole('combobox', { name: 'read in' })).toHaveValue(ORDER);
    // a constant's value is its own mark, not a second input
    await expect.element(box('c1').getByRole('textbox')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('value:c1')).toHaveTextContent('"-"');
  });

  test('a function card shows the fidelity badge of its entry, a deviation with its text', async () => {
    const target = graphMapping.targetFieldMappings![ORDER_ID]!;
    const api = fakeApiClient({
      [DRAFT]: { ...graphMapping, targetFieldMappings: { [ORDER_ID]: { ...target, boxes: { ...target.boxes, d1: { kind: 'function', fn: 'divide' } } } } },
    });
    const { divide } = await api.getCatalogue();
    expect(divide!.fidelity.level).toBe('deviation');
    render({ api });

    await expect.element(box('d1').getByTitle(divide!.fidelity.level === 'deviation' ? divide!.fidelity.text : '')).toHaveTextContent('deviation');
  });

  test('the toolbar shows the field, its mapping id and the quick-insert hint; Copy counts the selected boxes', async () => {
    render();

    const toolbar = page.getByRole('group', { name: 'Canvas of OrderId' });
    await expect.element(toolbar.getByText('type or press / on the canvas to insert a function')).toBeVisible();
    await expect.element(toolbar.getByText('t1', { exact: true })).toBeVisible();
    await expect.element(toolbar.getByRole('button', { name: 'Copy (0)' })).toBeDisabled();

    await userEvent.click(box('f1'));

    await expect.element(toolbar.getByRole('button', { name: 'Copy (1)' })).toBeEnabled();
  });

  test('marks an unreachable box, by a class and a description rather than by fading it', async () => {
    render();

    await expect.element(box('u1')).toHaveClass('fm-card--unreached');
    await expect.element(box('u1')).toHaveAttribute('title', 'Not reached by the result');
    for (const id of ['a1', 'c1', 'f1']) {
      await expect.element(box(id)).not.toHaveClass('fm-card--unreached');
      await expect.element(box(id)).not.toHaveAttribute('title');
    }
    // the text keeps its contrast: no whole-card opacity
    expect(getComputedStyle(box('u1').element()).opacity).toBe('1');
  });

  describe('editing on the card', () => {
    const pattern = () => box('n1').getByRole('textbox', { name: 'pattern' });
    const inspector = () => page.getByRole('complementary', { name: 'Inspector' });
    const withFormatNum = () => {
      const target = graphMapping.targetFieldMappings![ORDER_ID]!;
      const boxes: typeof target.boxes = { ...target.boxes, n1: { kind: 'function', fn: 'formatNum', inputs: ['a1'], params: { pattern: '#,##0.00' } } };
      return fakeApiClient({ [DRAFT]: { ...graphMapping, targetFieldMappings: { [ORDER_ID]: { ...target, boxes } } } });
    };

    test("a text param typed on the card is the inspector's edit: it shows there, and one Undo restores it", async () => {
      render({ api: withFormatNum() });
      await expect.element(pattern()).toHaveValue('#,##0.00');

      await pattern().fill('0.0');
      await userEvent.tab();
      await userEvent.click(box('n1').getByText('formatNum', { exact: true }));

      await expect.element(inspector().getByRole('textbox', { name: 'pattern' })).toHaveValue('0.0');
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect.element(pattern()).toHaveValue('#,##0.00');
      await expect.element(inspector().getByRole('textbox', { name: 'pattern' })).toHaveValue('#,##0.00');
    });

    test('Enter commits a text param on the card', async () => {
      render({ api: withFormatNum() });

      await pattern().fill('0.0');
      await userEvent.keyboard('{Enter}');

      await expect.element(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    });

    test('typing a letter in a card input neither opens quick insert nor drags the node', async () => {
      render({ api: withFormatNum() });
      await expect.element(pattern()).toHaveClass('nodrag');
      await expect.element(pattern()).toHaveClass('nokey');

      await pattern().click();
      await userEvent.keyboard('{End}x');

      await expect.element(pattern()).toHaveValue('#,##0.00x');
      await expect.element(page.getByRole('combobox', { name: 'Quick insert' })).not.toBeInTheDocument();
    });
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
    // y keeps the sink clear of the pane's top edge, where a drag toward it would pan the viewport
    browserState.write(canvasKey(DRAFT, 't1'), { viewport: { x: 10, y: 60, zoom: 0.5 } });
    render({ browserState });
    await expect.element(box('u1')).toBeVisible();
    const arranged = transformOf('u1');
    await dragBox('u1', page.getByTestId(`sink:${ORDER_ID}`));
    await expect.poll(() => transformOf('u1')).not.toBe(arranged);

    await page.getByRole('button', { name: 'Arrange' }).click();

    await expect.poll(() => transformOf('u1')).toBe(arranged);
    expect(canvasOf(browserState)).toEqual({ viewport: { x: 10, y: 60, zoom: 0.5 } });
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

    // the new box went below the graph; moving another box further down (to the canvas's bottom-left controls) must
    // not move it again
    await dragBox('u1', page.getByRole('button', { name: 'Fit View' }));

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

describe('a diagnostic in the Diagnostics panel', () => {
  test("at a box's authoring id selects its target field and the box; at the mapping's id, no box", async () => {
    const answer: Diagnostic[] = [
      { severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 'c1' } },
      { severity: 'error', code: 'unsupported-field', message: 'unsupported', location: { kind: 'authoring-id', authoringId: 't1' } },
    ];
    render({ api: fakeApiClient({ [DRAFT]: graphMapping }, { compile: { [DRAFT]: answer } }), field: null });

    await page.getByRole('tab', { name: /^Diagnostics/ }).click();
    await page.getByRole('button', { name: 'c1', exact: true }).click();

    await expect.element(node('c1')).toHaveClass('selected');
    await expect.element(node('f1')).not.toHaveClass('selected');

    // the c1 link opened the Editor tab: the t1 link is back on the Diagnostics tab
    await page.getByRole('tab', { name: /^Diagnostics/ }).click();
    await page.getByRole('button', { name: 't1', exact: true }).click();

    await expect.element(node('c1')).not.toHaveClass('selected');
  });
});

describe('the palette', () => {
  test('lists the catalogue by function family with its badges, and its search narrows it by name or family', async () => {
    const api = fakeApiClient({ [DRAFT]: graphMapping });
    const catalogue = await api.getCatalogue();
    render({ api: { ...api, getCatalogue: async () => ({ ...catalogue, abs: { ...catalogue.abs!, portable: false } }) } });
    const palette = page.getByRole('navigation', { name: 'Palette' });

    await expect.element(palette.getByRole('list', { name: 'constant' }).getByTestId('palette:constant')).toBeVisible();
    await expect.element(page.getByTestId('palette:toUpperCase')).toHaveTextContent('toUpperCase assumed');
    await expect.element(page.getByTestId('palette:abs')).toHaveTextContent('abs not portable');
    await expect.element(page.getByTestId('palette:divide').getByTitle(/^Quotient scale follows Saxon-HE/)).toHaveTextContent('deviation');

    await page.getByLabelText('Search functions').fill('UPPER');
    await expect.element(page.getByTestId('palette:constant')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('palette:toUpperCase')).toBeVisible();

    await page.getByLabelText('Search functions').fill('arith');
    await expect.element(page.getByTestId('palette:toUpperCase')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('palette:divide')).toBeVisible();
  });

  test('an entry of a context or queue function names its execution kind; a single-value one names none', async () => {
    const api = fakeApiClient({ [DRAFT]: graphMapping });
    const catalogue = await api.getCatalogue();
    render({
      api: {
        ...api,
        getCatalogue: async () => ({
          ...catalogue,
          abs: { ...catalogue.abs!, executionKind: 'context' },
          divide: { ...catalogue.divide!, executionKind: 'queue' },
        }),
      },
    });

    await expect.element(page.getByTestId('palette:abs')).toMatchTextContent(/context$/);
    await expect.element(page.getByTestId('palette:divide')).toMatchTextContent(/queue$/);
    await expect.element(page.getByTestId('palette:toUpperCase')).not.toMatchTextContent(/single|context|queue/);
  });

  test('an entry that is not portable is described so to assistive technology', async () => {
    const api = fakeApiClient({ [DRAFT]: graphMapping });
    const catalogue = await api.getCatalogue();
    render({ api: { ...api, getCatalogue: async () => ({ ...catalogue, abs: { ...catalogue.abs!, portable: false } }) } });

    await expect.element(page.getByTestId('palette:abs')).toHaveAccessibleDescription('not portable');
  });
});

describe('editing on the canvas', () => {
  test('a constant from the palette dropped on a field without a mapping creates the mapping with the box as result', async () => {
    render({ field: NOTE });
    // the editor fills the window below the host's button, so its canvas ends below the viewport: an HTML drag that
    // scrolls on its way is lost, so the page is scrolled first
    await expect.element(page.getByTestId(`canvas:${NOTE}`)).toBeVisible();
    page.getByTestId(`canvas:${NOTE}`).element().scrollIntoView({ block: 'end' });

    await userEvent.dragAndDrop(page.getByTestId('palette:constant'), page.getByTestId(`canvas:${NOTE}`));

    await expect.poll(boxCount).toBe(1);
    const [id] = boxIdsShown();
    await expect.element(page.getByTestId(`value:${id}`)).toHaveTextContent('""');
    await expect.poll(edgeIds).toEqual([`${id}->:sink`]);
    await expect.element(page.getByText('Unsaved')).toBeVisible();
  });

  test('a constant box shows its value', async () => {
    render();

    await expect.element(page.getByTestId('value:c1')).toHaveTextContent('"-"');
  });

  test('a function dropped on a graph is an unreachable box with its inputs marked unconnected; the result stays', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();

    // an HTML drag that has to scroll the page to its target is lost: bring the palette and the canvas into view
    page.getByTestId(`canvas:${ORDER_ID}`).element().scrollIntoView({ block: 'end' });
    await userEvent.dragAndDrop(page.getByTestId('palette:toUpperCase'), pane);

    await expect.poll(boxCount).toBe(5);
    const added = boxIdsShown().find((id) => !['a1', 'c1', 'f1', 'u1'].includes(id))!;
    await expect.element(box(added)).toHaveClass('fm-card--unreached');
    await expect.element(page.getByTestId(`unconnected:${added}#0`)).toBeVisible();
    expect(edgeIds()).toContain('f1->:sink');
  });

  test("the canvas takes the drag of a palette entry and no other, such as a source row's", async () => {
    render();
    await expect.element(box('u1')).toBeVisible();
    // the page is too short for a real drag from a source row to the canvas: dispatch the dragover itself
    const accepts = (type: string) => {
      const data = new DataTransfer();
      data.setData(type, 'x');
      const over = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true });
      page.getByTestId(`canvas:${ORDER_ID}`).element().dispatchEvent(over);
      return over.defaultPrevented;
    };

    expect(accepts(FUNCTION_DRAG)).toBe(true);
    expect(accepts('application/x-flottila-source-field')).toBe(false);
  });

  test('dragging an output onto the sink makes it the result, and one output may feed several inputs', async () => {
    render();
    await expect.element(box('u1')).toBeVisible();

    await userEvent.dragAndDrop(handle('out:u1'), handle('in:sink'));

    await expect.poll(edgeIds).toContain('u1->:sink');
    expect(edgeIds()).not.toContain('f1->:sink');
    await expect.element(box('u1')).not.toHaveClass('fm-card--unreached');
    await expect.element(box('f1')).toHaveClass('fm-card--unreached');

    await userEvent.dragAndDrop(handle('out:c1'), handle('in:u1#0'));

    await expect.poll(edgeIds).toContain('c1->u1#0');
    expect(edgeIds()).toContain('c1->f1#1');
    expect(edgeIds()).not.toContain('a1->u1#0');
    await expect.element(page.getByText('Unsaved')).toBeVisible();
  });

  test('a wire that would close a cycle is refused, says why, and leaves the model unchanged', async () => {
    const cyclic: MappingModel = structuredClone(graphMapping);
    cyclic.targetFieldMappings![ORDER_ID]!.boxes.u1 = { kind: 'function', fn: 'toUpperCase', inputs: ['f1'] };
    render({ api: fakeApiClient({ [DRAFT]: cyclic }) });
    await expect.element(box('u1')).toBeVisible();
    const before = edgeIds();

    await userEvent.dragAndDrop(handle('out:u1'), handle('in:f1#0'));

    await expect.element(page.getByRole('heading', { name: /The wire would close a cycle: box f1 already feeds/ })).toBeVisible();
    expect(edgeIds()).toEqual(before);
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test("a wire's end dropped back on its input stays; dropped off any input it removes the wire, and the slot is marked", async () => {
    render();
    await expect.element(box('u1')).toBeVisible();

    await userEvent.dragAndDrop(wireEnd('c1->f1#1'), handle('in:f1#1'));
    await userEvent.dragAndDrop(wireEnd('a1->u1#0'), pane, { targetPosition: { x: 5, y: 5 } });

    await expect.poll(edgeIds).not.toContain('a1->u1#0');
    expect(edgeIds()).toContain('c1->f1#1');
    await expect.element(page.getByTestId('unconnected:u1#0')).toBeVisible();
    await expect.element(page.getByTestId('unconnected:f1#1')).not.toBeInTheDocument();

    await userEvent.dragAndDrop(wireEnd('f1->:sink'), pane, { targetPosition: { x: 5, y: 5 } });

    await expect.element(page.getByTestId('unconnected:sink')).toHaveTextContent('No result connected');
    expect(edgeIds()).not.toContain('f1->:sink');
  });

  test('Delete removes the selected box and unconnects the inputs that read it; undo brings it back', async () => {
    render();
    await box('c1').click();
    // only Delete deletes
    await userEvent.keyboard('{Backspace}');
    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await userEvent.keyboard('{Delete}');

    await expect.element(box('c1')).not.toBeInTheDocument();
    expect(edgeIds()).not.toContain('c1->f1#1');
    await expect.element(page.getByTestId('unconnected:f1#1')).toBeVisible();
    await expect.element(page.getByText('Unsaved')).toBeVisible();

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(box('c1')).toBeVisible();
  });

  test('deleting the result box marks the sink unconnected', async () => {
    render();
    await box('f1').click();

    await userEvent.keyboard('{Delete}');

    await expect.element(box('f1')).not.toBeInTheDocument();
    await expect.element(page.getByTestId('unconnected:sink')).toBeVisible();
  });

  test("Delete does nothing while the selected box is on another target field's canvas", async () => {
    const twoFields: MappingModel = structuredClone(graphMapping);
    twoFields.targetFieldMappings![NOTE] = { id: 'tn', result: 'n1', boxes: { n1: { kind: 'source', field: NOTE } } };
    render({ api: fakeApiClient({ [DRAFT]: twoFields }) });
    await box('c1').click();
    await expect.element(node('c1')).toHaveClass('selected');

    await page.getByRole('button', { name: 'Host: open Note' }).click();
    await expect.element(box('n1')).toBeVisible();
    (node('n1').element() as HTMLElement).focus();
    await userEvent.keyboard('{Delete}');

    await expect.element(box('n1')).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});
