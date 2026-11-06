import { useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import type { ApiClient, Diagnostic } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

// Field status marks, the status filter and the orphaned target field mappings (ADR-0012, spec #104 stories 38-40,
// 45-47, ticket #112), over the order structure of the fake ApiClient.
const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const CHANNEL = `${ORDER}/@channel`;
const ORDER_ID = `${ORDER}/OrderId`;
const QUANTITY = `${ORDER}/Quantity`;
const AMOUNT = `${ORDER}/Amount`;
const URGENT = `${ORDER}/Urgent`;
const NOTE = `${ORDER}/Note`;
const MISSING = `${ORDER}/Missing`;
const ALL_ROWS = [ORDER, CHANNEL, ORDER_ID, QUANTITY, AMOUNT, URGENT, `${ORDER}/DeliveryDate`, `${ORDER}/PickupTime`, `${ORDER}/CreatedAt`, NOTE];
const DRAFT = 'drafts/status';
const corpusMapping = JSON.parse(corpusMappingText) as MappingModel;

/** The pointer of `unmapped-mandatory-leaf` at a target field: its absent member of `targetFieldMappings` (ADR-0015). */
const pointerTo = (path: string) => `/targetFieldMappings/${path.replaceAll('/', '~1')}`;
const unmappedOrderId: Diagnostic = {
  severity: 'error',
  code: 'unmapped-mandatory-leaf',
  message: 'the mandatory target leaf has no target field mapping',
  location: { kind: 'pointer', pointer: pointerTo(ORDER_ID) },
};

/**
 * Amount is mapped; OrderId (1..1) is unmapped; Note reads a source field the structure lacks (orphaned); Quantity
 * goes through a UDF box, which compile refuses at that box (error); Missing is a target field the structure lacks.
 */
const statusModel: MappingModel = {
  ...corpusMapping,
  targetFieldMappings: {
    [AMOUNT]: { id: 't1', result: 'a1', boxes: { a1: { kind: 'source', field: AMOUNT } } },
    [NOTE]: { id: 't2', result: 'a2', boxes: { a2: { kind: 'source', field: `${ORDER}/Gone` } } },
    [QUANTITY]: {
      id: 't3',
      result: 'u3',
      boxes: { u3: { kind: 'udf', udf: 'scale', inputs: ['a3'] }, a3: { kind: 'source', field: QUANTITY } },
    },
    [MISSING]: { id: 't4', result: 'a4', boxes: { a4: { kind: 'source', field: ORDER_ID } } },
  },
};
/** What the engine answers for it: the UDF box and the unmapped OrderId. */
const statusCompile: Diagnostic[] = [
  { severity: 'error', code: 'unsupported-box-kind', message: 'a UDF box is not supported yet', location: { kind: 'authoring-id', authoringId: 'u3' } },
  unmappedOrderId,
];
const statusApi = () => fakeApiClient({ [DRAFT]: statusModel }, { compile: { [DRAFT]: statusCompile } });

const tree = () => page.getByRole('tree', { name: 'Target structure' });
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const fieldLink = (source: string, target: string) => page.getByTestId(`field-link:${source}->${target}`);
const filter = (name: string) => page.getByRole('group', { name: 'Status filter' }).getByRole('button', { name, exact: true });
const orphans = () => page.getByRole('list', { name: 'Orphaned target field mappings' });
const shownTargets = () =>
  [...tree().element().querySelectorAll<HTMLElement>('[role="treeitem"]')].map((row) => row.dataset.testid!.slice('target-field:'.length));

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function mount(element: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(element);
}

function render(mappingId: string, api: ApiClient, browserState: BrowserStateStore = memoryBrowserState()) {
  mount(<MappingEditor mappingId={mappingId} api={api} browserState={browserState} />);
}

function unmount() {
  root?.unmount();
  host?.remove();
  root = undefined;
}

/** A host that owns the selected target field (ADR-0013: controlled state) and reports each request to select one. */
function Host({ api, onSelect }: { api: ApiClient; onSelect: (field: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const select = (field: string) => {
    onSelect(field);
    setSelected(field);
  };
  return <MappingEditor mappingId={DRAFT} api={api} browserState={memoryBrowserState()} selectedField={selected} onSelectField={select} />;
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

describe('the field status marks (spec #104, story 38)', () => {
  test('mark each target row with its status, and leave an unmapped optional row and the source rows unmarked', async () => {
    render(DRAFT, statusApi());

    await expect.element(targetRow(AMOUNT).getByRole('img', { name: 'Mapped' })).toBeVisible();
    await expect.element(targetRow(ORDER_ID).getByRole('img', { name: 'Unmapped mandatory' })).toBeVisible();
    await expect.element(targetRow(NOTE).getByRole('img', { name: 'Orphaned' })).toBeVisible();
    await expect.element(targetRow(QUANTITY).getByRole('img', { name: 'Error' })).toBeVisible();
    await expect.element(targetRow(URGENT).getByRole('img')).not.toBeInTheDocument();
    await expect.element(sourceRow(AMOUNT).getByRole('img')).not.toBeInTheDocument();
  });

  test('a compile fixture with unmapped-mandatory-leaf marks its row, and the next compile after linking it marks it mapped', async () => {
    render('mappings/order-unmapped', {
      ...fakeApiClient(),
      compile: async (_id, model) => ({ diagnostics: model.targetFieldMappings?.[ORDER_ID] ? [] : [unmappedOrderId] }),
    });
    await expect.element(targetRow(ORDER_ID).getByRole('img', { name: 'Unmapped mandatory' })).toBeVisible();

    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));

    await expect.element(targetRow(ORDER_ID).getByRole('img', { name: 'Mapped' })).toBeVisible();
  });
});

describe('the status filter (spec #104, story 39)', () => {
  test('each value shows the rows of its status with their ancestors, and draws only the links to them', async () => {
    render(DRAFT, statusApi());
    await expect.element(targetRow(QUANTITY).getByRole('img', { name: 'Error' })).toBeVisible();
    await expect.element(filter('All')).toHaveAttribute('aria-pressed', 'true');
    expect(shownTargets()).toEqual(ALL_ROWS);
    await expect.element(fieldLink(AMOUNT, AMOUNT)).toBeInTheDocument();
    await expect.element(fieldLink(QUANTITY, QUANTITY)).toBeInTheDocument();

    await filter('Mapped').click();
    await expect.element(filter('Mapped')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(shownTargets).toEqual([ORDER, AMOUNT]);
    await expect.element(fieldLink(AMOUNT, AMOUNT)).toBeInTheDocument();
    await expect.element(fieldLink(QUANTITY, QUANTITY)).not.toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: 'Collapse target Order' })).not.toBeInTheDocument();

    await filter('Unmapped mandatory').click();
    await expect.poll(shownTargets).toEqual([ORDER, ORDER_ID]);
    await expect.element(fieldLink(AMOUNT, AMOUNT)).not.toBeInTheDocument();

    await filter('Orphaned').click();
    await expect.poll(shownTargets).toEqual([ORDER, NOTE]);

    await filter('Error').click();
    await expect.poll(shownTargets).toEqual([ORDER, QUANTITY]);
    await expect.element(fieldLink(QUANTITY, QUANTITY)).toBeInTheDocument();
    await expect.element(fieldLink(AMOUNT, AMOUNT)).not.toBeInTheDocument();

    await filter('All').click();
    await expect.poll(shownTargets).toEqual(ALL_ROWS);
    await expect.element(page.getByRole('button', { name: 'Collapse target Order' })).toBeVisible();
  });

  test('is kept per mapping in browser state', async () => {
    const browserState = memoryBrowserState();
    render(DRAFT, statusApi(), browserState);
    await filter('Error').click();
    await expect.poll(shownTargets).toEqual([ORDER, QUANTITY]);
    unmount();

    render(DRAFT, statusApi(), browserState);
    await expect.element(filter('Error')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(shownTargets).toEqual([ORDER, QUANTITY]);
    unmount();

    render('mappings/order-id-copy', fakeApiClient(), browserState);
    await expect.element(filter('All')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a diagnostic that leads to a target row the filter hides shows all rows again', async () => {
    render(DRAFT, statusApi());
    await filter('Error').click();
    await expect.poll(shownTargets).toEqual([ORDER, QUANTITY]);

    await page.getByRole('tab', { name: /^Diagnostics/ }).click();
    await page.getByRole('button', { name: 'Order/OrderId' }).click();

    await expect.element(targetRow(ORDER_ID)).toHaveFocus();
    await expect.element(filter('All')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the orphaned target field mappings (spec #104, stories 46 and 47)', () => {
  test('are listed below the target tree under all and orphaned, without links, and selecting one opens its graph', async () => {
    const onSelect = vi.fn();
    mount(<Host api={statusApi()} onSelect={onSelect} />);
    await expect.element(orphans()).toHaveTextContent(MISSING);
    // the opening selection (spec #145): the first mapped target field in tree order, once
    await expect.poll(() => onSelect.mock.calls).toEqual([[QUANTITY]]);
    await expect.element(targetRow(MISSING)).not.toBeInTheDocument();
    await expect.element(fieldLink(AMOUNT, AMOUNT)).toBeInTheDocument();
    await expect.element(fieldLink(ORDER_ID, MISSING)).not.toBeInTheDocument();

    await filter('Mapped').click();
    await expect.element(orphans()).not.toBeInTheDocument();
    await filter('Orphaned').click();
    await orphans().getByRole('button', { name: MISSING }).click();

    // the click selects the orphaned mapping's field, exactly once more
    expect(onSelect.mock.calls).toEqual([[QUANTITY], [MISSING]]);
    await expect.element(page.getByTestId(`sink:${MISSING}`)).toBeVisible();
    await expect.element(page.getByTestId('box:a4')).toBeVisible();
  });

  test('are not listed when every target field mapping has its row', async () => {
    render('mappings/order-id-copy', fakeApiClient());
    await expect.element(targetRow(ORDER_ID).getByRole('img', { name: 'Mapped' })).toBeVisible();

    await expect.element(orphans()).not.toBeInTheDocument();
  });
});
