import corpusMappingText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ApiClient, FieldDto, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';

// The tree toolbar of spec #135 (ticket #137): Search fields, Expand all and Collapse, and the field and visible-row
// counts, over a nested purchase order on both sides.
const field = (step: string, min: number, max: number | undefined, extra: Partial<FieldDto> = {}): FieldDto => ({
  kind: step.startsWith('@') ? 'attribute' : 'element',
  step,
  namespace: '',
  localName: step.replace('@', ''),
  min,
  ...(max === undefined ? {} : { max }),
  ...(extra.type === undefined ? { valueType: 'xs:string' } : {}),
  nillable: false,
  ...extra,
});

/** PurchaseOrder holds @version, Header and Item; Header holds a BuyerParty; Item holds a Price; 15 fields in all. */
const purchaseOrder: StructureLoaded = {
  kind: 'loaded',
  fingerprint: 'sha256:po',
  root: field('PurchaseOrder', 1, 1, { type: 'po' }),
  types: {
    po: [field('@version', 0, 1), field('Header', 1, 1, { type: 'header' }), field('Item', 1, undefined, { type: 'item' })],
    header: [field('OrderNumber', 1, 1), field('Currency', 0, 1), field('BuyerParty', 0, 1, { type: 'party' })],
    party: [field('@id', 1, 1), field('Name', 1, 1)],
    item: [field('@lineNo', 1, 1), field('ProductId', 1, 1), field('Description', 0, 1), field('Price', 1, 1, { type: 'price' })],
    price: [field('Amount', 1, 1), field('Currency', 1, 1)],
  },
};
const PO = '/PurchaseOrder';
const HEADER = `${PO}/Header`;
const HEADER_CURRENCY = `${HEADER}/Currency`;
const ITEM = `${PO}/Item`;
const PRODUCT_ID = `${ITEM}/ProductId`;
const PRICE = `${ITEM}/Price`;
const PRICE_CURRENCY = `${PRICE}/Currency`;
const DRAFT = 'drafts/po';

/** Header/Currency and Item/ProductId are copied from the same source field; nothing else is mapped. */
const model: MappingModel = {
  ...(JSON.parse(corpusMappingText) as MappingModel),
  targetFieldMappings: {
    [HEADER_CURRENCY]: { id: 't1', result: 'a1', boxes: { a1: { kind: 'source', field: HEADER_CURRENCY } } },
    [PRODUCT_ID]: { id: 't2', result: 'a2', boxes: { a2: { kind: 'source', field: PRODUCT_ID } } },
  },
};
const poApi = (): ApiClient => ({ ...fakeApiClient({ [DRAFT]: model }), loadStructure: async () => purchaseOrder });

const tree = (side: 'Source' | 'Target') => page.getByRole('tree', { name: `${side} structure` });
const tools = (side: 'Source' | 'Target') => page.getByRole('group', { name: `${side} structure tools` });
const search = (side: 'Source' | 'Target') => tools(side).getByRole('textbox',{ name: `Search ${side.toLowerCase()} fields` });
const expandAll = (side: 'Source' | 'Target') => tools(side).getByRole('button', { name: 'Expand all', exact: true });
const collapse = (side: 'Source' | 'Target') => tools(side).getByRole('button', { name: 'Collapse', exact: true });
const filter = (name: string) => page.getByRole('group', { name: 'Status filter' }).getByRole('button', { name, exact: true });
const fieldLink = (source: string, target: string) => page.getByTestId(`field-link:${source}->${target}`);
const shown = (side: 'Source' | 'Target') => () =>
  [...tree(side).element().querySelectorAll<HTMLElement>('[role="treeitem"]')].map((row) => row.title);

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(browserState: BrowserStateStore = memoryBrowserState()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={DRAFT} api={poApi()} browserState={browserState} />);
}

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

describe('the tree search (spec #135, stories 14 and 15)', () => {
  test('narrows the rows to the fields whose local name matches, ignoring case, and their ancestors', async () => {
    render();
    await expect.poll(shown('Source')).toEqual([PO, `${PO}/@version`, HEADER, ITEM]);

    await userEvent.fill(search('Source'), 'cUrReNcY');

    await expect.poll(shown('Source')).toEqual([PO, HEADER, HEADER_CURRENCY, ITEM, PRICE, PRICE_CURRENCY]);
    expect(shown('Target')()).toEqual([PO, `${PO}/@version`, HEADER, ITEM]);

    await userEvent.fill(search('Source'), 'version');
    await expect.poll(shown('Source')).toEqual([PO, `${PO}/@version`]);

    await userEvent.fill(search('Source'), '');
    await expect.poll(shown('Source')).toEqual([PO, `${PO}/@version`, HEADER, ITEM]);
  });

  test('combines with the status filter: a row shows when it matches the search and has the status', async () => {
    render();
    await filter('Mapped').click();
    await expect.poll(shown('Target')).toEqual([PO, HEADER, HEADER_CURRENCY, ITEM, PRODUCT_ID]);

    await userEvent.fill(search('Target'), 'currency');

    await expect.poll(shown('Target')).toEqual([PO, HEADER, HEADER_CURRENCY]);

    await filter('All').click();
    await expect.poll(shown('Target')).toEqual([PO, HEADER, HEADER_CURRENCY, ITEM, PRICE, PRICE_CURRENCY]);
  });

  test('draws no link to a row the search hides, where a collapsed row gets a dashed one', async () => {
    render();
    await expect.element(fieldLink(PRODUCT_ID, PRODUCT_ID)).toHaveAttribute('stroke-dasharray');
    await expect.element(fieldLink(HEADER_CURRENCY, HEADER_CURRENCY)).toBeInTheDocument();

    await userEvent.fill(search('Source'), 'currency');

    await expect.poll(shown('Source')).toContain(HEADER_CURRENCY);
    await expect.element(fieldLink(PRODUCT_ID, PRODUCT_ID)).not.toBeInTheDocument();
    await expect.element(fieldLink(HEADER_CURRENCY, HEADER_CURRENCY)).toBeInTheDocument();

    await userEvent.fill(search('Target'), 'product');

    await expect.element(fieldLink(HEADER_CURRENCY, HEADER_CURRENCY)).not.toBeInTheDocument();
  });

  test('is view state: it adds no undo step', async () => {
    render();
    await userEvent.fill(search('Target'), 'name');
    await expect.poll(shown('Target')).toEqual([PO, HEADER, `${HEADER}/BuyerParty`, `${HEADER}/BuyerParty/Name`]);

    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });
});

describe('Expand all and Collapse (spec #135, story 16)', () => {
  test('open and fold one tree, and the visible-row count follows', async () => {
    render();
    await expect.element(tree('Source')).toHaveAccessibleDescription('Source structure: 15 fields, 4 visible rows');

    await expandAll('Source').click();

    await expect.element(tree('Source')).toHaveAccessibleDescription('Source structure: 15 fields, 15 visible rows');
    await expect.element(tree('Target')).toHaveAccessibleDescription('Target structure: 15 fields, 4 visible rows');

    await collapse('Source').click();

    await expect.element(tree('Source')).toHaveAccessibleDescription('Source structure: 15 fields, 4 visible rows');
    await expect.poll(shown('Source')).toEqual([PO, `${PO}/@version`, HEADER, ITEM]);
  });

  test('are kept in browser state with the rest of the expansion, and add no undo step', async () => {
    const browserState = memoryBrowserState();
    render(browserState);
    await expandAll('Target').click();
    await expect.element(tree('Target')).toHaveAccessibleDescription('Target structure: 15 fields, 15 visible rows');
    await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    root!.unmount();
    host!.remove();

    render(browserState);

    await expect.element(tree('Target')).toHaveAccessibleDescription('Target structure: 15 fields, 15 visible rows');
  });
});

describe('the counts (spec #135, story 17)', () => {
  test('show the field count and the visible rows under a search', async () => {
    render();
    await expect.element(tree('Target')).toHaveAccessibleDescription('Target structure: 15 fields, 4 visible rows');

    await userEvent.fill(search('Target'), 'zzz');

    await expect.element(tree('Target')).toHaveAccessibleDescription('Target structure: 15 fields, 0 visible rows');
  });
});

describe('the rows (spec #135, stories 18 and 21)', () => {
  test('mark the selected target field’s row as selected', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    root.render(<MappingEditor mappingId={DRAFT} api={poApi()} browserState={memoryBrowserState()} selectedField={HEADER} />);

    await expect.element(page.getByTestId(`target-field:${HEADER}`)).toHaveAttribute('aria-selected', 'true');
    await expect.element(page.getByTestId(`target-field:${ITEM}`)).toHaveAttribute('aria-selected', 'false');
  });
});
