import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ApiClient, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import { TREE_FIELDS, TREE_MAPPING, TREE_SEED, generatedStructure, structurePaths } from '../../api/fake/generated-tree';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { MappingEditor } from '../index';
import { stepName } from './rows';

// The virtualised trees and the link gutter over the generated tree of 20,128 fields (ADR-0012, #111).
const structure: StructureLoaded = generatedStructure(TREE_SEED, TREE_FIELDS);
const { expandable, leaves } = structurePaths(structure);
const ROOT = `/${structure.root.step}`;
const DRAFT = 'drafts/tree';

const tree = (side: 'Source' | 'Target') => page.getByRole('tree', { name: `${side} structure` });
const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const fieldLink = (source: string, target: string) => page.getByTestId(`field-link:${source}->${target}`);
const rowsIn = (side: 'Source' | 'Target') => tree(side).element().querySelectorAll('[role="treeitem"]').length;
const name = stepName;

/** Scrolls a tree so that the row of `path` (fully expanded) is at the top, and waits for it to render. */
async function scrollTo(side: 'Source' | 'Target', path: string) {
  await expect.element(tree(side)).toBeVisible();
  const index = expandedOrder.indexOf(path);
  const element = tree(side).element() as HTMLElement;
  const rowHeight = (element.querySelector('[role="treeitem"]') as HTMLElement).offsetHeight;
  element.scrollTop = index * rowHeight;
  await expect.element((side === 'Source' ? sourceRow : targetRow)(path)).toBeVisible();
}

/** The fully expanded tree's row paths, in order. */
const expandedOrder: string[] = (() => {
  const paths: string[] = [];
  const visit = (field: StructureLoaded['root'], path: string) => {
    paths.push(path);
    for (const child of field.type === undefined ? [] : (structure.types[field.type] ?? [])) visit(child, `${path}/${child.step}`);
  };
  visit(structure.root, ROOT);
  return paths;
})();

function expandedState(id: string): BrowserStateStore {
  const values = new Map<string, unknown>([[`mapping:${id}:expanded`, { source: expandable, target: expandable }]]);
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

/** The generated mapping with no target field mappings, so a new link shows. */
async function unmappedTree(api: ApiClient): Promise<ApiClient> {
  const { model } = await api.getMapping(TREE_MAPPING);
  const draft: MappingModel = { ...model };
  delete draft.targetFieldMappings;
  return fakeApiClient({ [DRAFT]: draft });
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(mappingId: string, api: ApiClient, browserState: BrowserStateStore, selectedField: string | null = null) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<MappingEditor mappingId={mappingId} api={api} browserState={browserState} selectedField={selectedField} />);
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

describe('the virtualised trees', () => {
  test('keep the rows in the DOM bounded while scrolling a fully expanded tree of 20,128 fields', async () => {
    render(TREE_MAPPING, fakeApiClient(), expandedState(TREE_MAPPING));
    await expect.element(sourceRow(ROOT)).toBeVisible();
    expect(expandedOrder).toHaveLength(TREE_FIELDS);
    expect(rowsIn('Source')).toBeLessThanOrEqual(100);

    await scrollTo('Source', expandedOrder[10_000]!);
    expect(rowsIn('Source')).toBeLessThanOrEqual(100);
    await expect.element(sourceRow(ROOT)).not.toBeInTheDocument();

    await scrollTo('Source', expandedOrder.at(-1)!);
    expect(rowsIn('Source')).toBeLessThanOrEqual(100);
    expect(rowsIn('Target')).toBeLessThanOrEqual(100);
  });

  test('drop a source row on a target row far down the tree, and the link is drawn', async () => {
    const [source, target] = [leaves[9_000]!, leaves[9_003]!];
    render(DRAFT, await unmappedTree(fakeApiClient()), expandedState(DRAFT));
    await scrollTo('Source', source);
    await scrollTo('Target', target);

    await userEvent.dragAndDrop(sourceRow(source), targetRow(target));

    await expect.element(targetRow(target)).toMatchTextContent(new RegExp(`← ${name(source)}$`));
    await expect.element(fieldLink(source, target)).toBeInTheDocument();
  });

  test('link by keyboard, the picked source field kept while its row is scrolled away', async () => {
    const [source, target] = [leaves[12_000]!, leaves[3]!];
    render(DRAFT, await unmappedTree(fakeApiClient()), expandedState(DRAFT));
    await scrollTo('Source', source);
    await userEvent.click(sourceRow(source));
    await userEvent.keyboard('{Enter}');
    await expect.element(sourceRow(source)).toHaveAttribute('aria-selected', 'true');

    await scrollTo('Source', ROOT);
    await expect.element(sourceRow(source)).not.toBeInTheDocument();
    await userEvent.click(targetRow(target));
    await userEvent.keyboard('{Enter}');

    await expect.element(targetRow(target)).toMatchTextContent(new RegExp(`← ${name(source)}$`));
  });
});

describe('the link gutter', () => {
  test('draws the links of visible rows, and counts the ends scrolled away at the gutter edge', async () => {
    render(TREE_MAPPING, fakeApiClient(), expandedState(TREE_MAPPING));
    const first = leaves[0]!;
    await expect.element(fieldLink(first, first)).toBeInTheDocument();
    await expect.element(page.getByTestId('link-count:source:above')).not.toBeInTheDocument();

    await scrollTo('Source', expandedOrder[5]!);

    await expect.element(page.getByTestId('link-count:source:above')).toMatchTextContent(/^↑[1-9]\d*$/);
    await expect.element(page.getByTestId('link-count:target:below')).toMatchTextContent(/^↓[1-9]\d*$/);
  });

  test('dashes a link to a collapsed row to its nearest visible ancestor', async () => {
    const first = leaves[0]!;
    const parent = first.slice(0, first.lastIndexOf('/'));
    render(TREE_MAPPING, fakeApiClient(), expandedState(TREE_MAPPING));
    await expect.element(fieldLink(first, first)).not.toHaveAttribute('stroke-dasharray');

    await sourceRow(parent).getByRole('button', { name: `Collapse source ${name(parent)}` }).click();

    await expect.element(sourceRow(first)).not.toBeInTheDocument();
    await expect.element(fieldLink(first, first)).toHaveAttribute('stroke-dasharray');
  });

  test('highlights the selected target field’s links and dims the others', async () => {
    const [first, second] = [leaves[0]!, leaves[1]!];
    render(TREE_MAPPING, fakeApiClient(), expandedState(TREE_MAPPING), second);

    await expect.element(fieldLink(second, second)).toHaveAttribute('data-emphasis', 'highlighted');
    await expect.element(fieldLink(first, first)).toHaveAttribute('data-emphasis', 'dimmed');
  });

  test('shows the fx count of a link with several source-field boxes', async () => {
    const api = fakeApiClient();
    const { model } = await api.getMapping(TREE_MAPPING);
    const first = leaves[0]!;
    model.targetFieldMappings![first] = {
      id: 't0',
      result: 'f0',
      boxes: {
        f0: { kind: 'function', fn: 'concat', inputs: ['a0', 'b0'] },
        a0: { kind: 'source', field: first },
        b0: { kind: 'source', field: first },
      },
    };
    render(DRAFT, fakeApiClient({ [DRAFT]: model }), expandedState(DRAFT));

    await expect.element(page.getByTestId(`link-fx:${first}->${first}`)).toHaveTextContent('fx 2');
    await expect.element(fieldLink(leaves[1]!, leaves[1]!)).toBeInTheDocument();
    await expect.element(page.getByTestId(`link-fx:${leaves[1]}->${leaves[1]}`)).not.toBeInTheDocument();
  });
});
