import sameStepText from '../../../../corpus/mappings/same-step-source-box.mapping.json?raw';
import sameStepTargetText from '../../../../corpus/mappings/same-step-target-field.mapping.json?raw';
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import type { ApiClient, StructureLoaded } from '../../api/client';
import { fakeApiClient } from '../../api/fake/fake-api';
import { TREE_FIELDS, TREE_MAPPING, TREE_SEED, generatedStructure, structurePaths } from '../../api/fake/generated-tree';
import type { MappingModel } from '../../generated/mapping-model';
import type { BrowserStateStore } from '../browser-state/browser-state';
import { stepName } from '../../model/field-path';
import { MappingEditor } from '../index';

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

/** A host that owns the selected target field (ADR-0013: controlled state) and reports each request to select one. */
function Host({ api, browserState, onSelect }: { api: ApiClient; browserState: BrowserStateStore; onSelect: (field: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const select = (field: string) => {
    onSelect(field);
    setSelected(field);
  };
  return <MappingEditor mappingId={TREE_MAPPING} api={api} browserState={browserState} selectedField={selected} onSelectField={select} />;
}

function renderHost(onSelect: (field: string) => void) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<Host api={fakeApiClient()} browserState={expandedState(TREE_MAPPING)} onSelect={onSelect} />);
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
    await expect.element(tree('Source')).toHaveAccessibleDescription('Source structure: 20,128 fields, 20,128 visible rows');

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

  test('marks a mapped target row with fx while it is on screen (spec #135, #145)', async () => {
    render(TREE_MAPPING, fakeApiClient(), expandedState(TREE_MAPPING));
    const first = leaves[0]!;
    await expect.element(page.getByTestId(`fx-mark:${first}`)).toBeInTheDocument();

    await scrollTo('Target', expandedOrder[expandedOrder.indexOf(first) + 1]!);

    await expect.element(page.getByTestId('link-count:target:above')).toBeInTheDocument();
    await expect.element(fieldLink(first, first)).toBeInTheDocument();
    await expect.element(page.getByTestId(`fx-mark:${first}`)).not.toBeInTheDocument();
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

    await expect.element(fieldLink(second, second)).toHaveClass('fm-gutter__link--sel');
    await expect.element(fieldLink(first, first)).toHaveClass('fm-gutter__link--dim');
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

describe('refused fields (ADR-0027, stories 43 and 44)', () => {
  // corpus/mappings/same-step-source-box: /Doc/Id is mapped from the refused /Doc/Note (#92)
  const SAME_STEP = 'mappings/same-step-source-box';
  const sameStep = JSON.parse(sameStepText) as MappingModel;
  const FILE = '../structures/refused/same-step.xsd';
  const opened: BrowserStateStore = (() => {
    const expanded = ['/Doc', '/Doc/Head'];
    const values = new Map<string, unknown>([[`mapping:${SAME_STEP}:expanded`, { source: expanded, target: expanded }]]);
    return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
  })();
  const refusedMark = (side: 'source' | 'target', path: string) => page.getByTestId(`refused:${side}:${path}`);
  /** The heading of the alert titled `title`, after the screen-reader prefix PatternFly puts before it. */
  const alert = (title: string) => page.getByRole('heading', { name: new RegExp(`${title.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`) });

  test('a refused row is marked, with its reason and the declaration’s file, line and column on hover', async () => {
    render(SAME_STEP, fakeApiClient({ [SAME_STEP]: sameStep }), opened);

    for (const side of ['source', 'target'] as const) {
      await expect.element(refusedMark(side, '/Doc/Note').first()).toHaveAttribute('title', `Refused: ambiguous-field-path, declared at ${FILE}:14:65`);
      await expect.element(refusedMark(side, '/Doc/Note').last()).toHaveAttribute('title', `Refused: ambiguous-field-path, declared at ${FILE}:14:65`);
      await expect.element(refusedMark(side, '/Doc/Head/Ref').first()).toHaveAttribute('title', `Refused: ambiguous-field-path, declared at ${FILE}:19:56`);
      await expect.element(refusedMark(side, '/Doc/Id')).not.toBeInTheDocument();
      await expect.element(refusedMark(side, '/Doc/Head')).not.toBeInTheDocument();
    }
  });

  test('a drop from or onto a refused field is refused with its reason, and the model stays as it was', async () => {
    render(SAME_STEP, fakeApiClient({ [SAME_STEP]: sameStep }), opened);
    await expect.element(targetRow('/Doc/Code')).toBeVisible();

    await userEvent.dragAndDrop(sourceRow('/Doc/Note').first(), targetRow('/Doc/Code'));

    await expect.element(alert(`The source field /Doc/Note is refused: ambiguous-field-path, declared at ${FILE}:14:65.`)).toBeVisible();
    await expect.element(targetRow('/Doc/Code')).not.toHaveTextContent('←');

    await userEvent.dragAndDrop(sourceRow('/Doc/Code'), targetRow('/Doc/Head/Ref').last());

    await expect.element(alert(`The target field /Doc/Head/Ref is refused: ambiguous-field-path, declared at ${FILE}:19:56.`)).toBeVisible();
    await expect.element(targetRow('/Doc/Head/Ref').last()).not.toHaveTextContent('←');
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('a refused target row keeps its mark under a status filter', async () => {
    // corpus/mappings/same-step-target-field: T2 writes the refused /Doc/Note, which compile reports at T2
    const TARGET_FIELD = 'mappings/same-step-target-field';
    const atT2 = {
      severity: 'error' as const,
      code: 'ambiguous-field-path',
      message: `the field path /Doc/Note is ambiguous: ${FILE} 14:65`,
      location: { kind: 'authoring-id' as const, authoringId: 'T2' },
    };
    const api = fakeApiClient({ [TARGET_FIELD]: JSON.parse(sameStepTargetText) as MappingModel }, { compile: { [TARGET_FIELD]: [atT2] } });
    render(TARGET_FIELD, api, opened);
    await expect.element(page.getByRole('tab', { name: 'Diagnostics (1)' })).toBeVisible();

    await page.getByRole('group', { name: 'Status filter' }).getByRole('button', { name: 'Error', exact: true }).click();

    await expect.element(targetRow('/Doc/Id')).not.toBeInTheDocument();
    await expect.element(refusedMark('target', '/Doc/Note').first()).toHaveAttribute('title', `Refused: ambiguous-field-path, declared at ${FILE}:14:65`);
    await expect.element(refusedMark('target', '/Doc/Note').last()).toHaveAttribute('title', `Refused: ambiguous-field-path, declared at ${FILE}:14:65`);
  });

  test('a model that already uses a refused field opens, and shows its compile diagnostic', async () => {
    const ambiguous = {
      severity: 'error' as const,
      code: 'ambiguous-field-path',
      message: `the field path /Doc/Note is ambiguous: ${FILE} 14:65`,
      location: { kind: 'authoring-id' as const, authoringId: 'S1' },
    };
    render(SAME_STEP, fakeApiClient({ [SAME_STEP]: sameStep }, { compile: { [SAME_STEP]: [ambiguous] } }), opened);

    await expect.element(targetRow('/Doc/Id')).toMatchTextContent(/← Note$/);
    await page.getByRole('tab', { name: 'Diagnostics (1)' }).click();
    await expect
      .element(page.getByRole('list', { name: 'Working copy diagnostics' }))
      // the list shows a path in a message as its local path (#142)
      .toHaveTextContent(`error ambiguous-field-path S1: ${ambiguous.message.replace('/Doc/Note', 'Doc/Note')}`);
  });
});

describe('selecting a target field (spec #104, story 1)', () => {
  test('a click on a virtualised target row asks the host to select it, and its links are highlighted', async () => {
    const onSelect = vi.fn();
    const target = leaves[9_000]!;
    renderHost(onSelect);
    await scrollTo('Target', target);

    await userEvent.click(targetRow(target));

    expect(onSelect).toHaveBeenCalledWith(target);
    await scrollTo('Source', target);
    await expect.element(fieldLink(target, target)).toHaveClass('fm-gutter__link--sel');
  });

  test('Enter on a focused target row selects it too; a source row never selects', async () => {
    const onSelect = vi.fn();
    const [first, second] = [leaves[0]!, leaves[1]!];
    // the opening selection (spec #145) asks for the first mapped target field in tree order, once
    const mapped = (await fakeApiClient().getMapping(TREE_MAPPING)).model.targetFieldMappings ?? {};
    const opened = expandedOrder.find((path) => Object.hasOwn(mapped, path));
    expect(opened).toBeDefined();
    renderHost(onSelect);
    await expect.poll(() => onSelect.mock.calls).toEqual([[opened]]);
    await userEvent.click(sourceRow(first));
    await userEvent.keyboard('{Enter}');
    expect(onSelect.mock.calls).toEqual([[opened]]);

    (targetRow(second).element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect.mock.calls).toEqual([[opened], [second]]);
    await expect.element(fieldLink(second, second)).toHaveClass('fm-gutter__link--sel');
    await expect.element(fieldLink(first, first)).toHaveClass('fm-gutter__link--dim');
  });
});
