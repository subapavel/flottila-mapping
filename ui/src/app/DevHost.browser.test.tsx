import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ApiProblem, type ApiClient, type RootSelector } from '../api/client';
import { fakeApiClient } from '../api/fake/fake-api';
import type { BrowserStateStore } from '../editor';
import { DevHost, type DevHostProps } from './DevHost';

const ORDER = 'Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `/${ORDER}/OrderId`;
const ORDER_XSD = '../structures/skeleton/order.xsd';

const sourceRow = (path: string) => page.getByTestId(`source-field:${path}`);
const targetRow = (path: string) => page.getByTestId(`target-field:${path}`);
const mappingList = () => page.getByRole('list', { name: 'Mappings' });
const back = () => page.getByRole('button', { name: 'All mappings' });
const guard = () => page.getByRole('dialog', { name: 'Unsaved changes' });

function memoryBrowserState(): BrowserStateStore {
  const values = new Map<string, unknown>();
  return { read: (key) => values.get(key), write: (key, value) => void values.set(key, value) };
}

/** The fake with a spy on createMapping, so a test can read the request the form sent. */
function spied(api: ApiClient = fakeApiClient()) {
  const createMapping = vi.fn(api.createMapping);
  return { api: { ...api, createMapping }, createMapping };
}

let root: Root | undefined;
let host: HTMLElement | undefined;
let consoleError: ReturnType<typeof vi.spyOn>;

function render(api: ApiClient, start?: DevHostProps['start']) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  root.render(<DevHost api={api} browserState={memoryBrowserState()} start={start} />);
}

/** Whether the page asks before it unloads: a `beforeunload` listener cancelled the event. */
function asksBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function drawLink() {
  await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(ORDER_ID));
  await expect.element(page.getByText('Unsaved')).toBeVisible();
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

describe('the mapping list', () => {
  test("lists the workspace's mappings; one opens in the editor, and All mappings goes back to the list", async () => {
    render(fakeApiClient());

    await expect.element(mappingList()).toHaveTextContent('mappings/order-id-copymappings/order-unmapped');
    await page.getByRole('button', { name: 'mappings/order-unmapped' }).click();

    await expect.element(page.getByRole('heading', { name: 'mappings/order-unmapped' })).toBeVisible();
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
    await expect.element(mappingList()).not.toBeInTheDocument();

    await back().click();

    await expect.element(mappingList()).toBeVisible();
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).not.toBeInTheDocument();
  });

  test('a mapping named at start opens directly', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-id-copy' });

    await expect.element(page.getByRole('heading', { name: 'mappings/order-id-copy' })).toBeVisible();
    await expect.element(targetRow(ORDER_ID)).toMatchTextContent(/← OrderId/);
  });

  test("a mapping and a field named at start open with the field's function graph", async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-id-copy', field: ORDER_ID });

    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();
  });

  test('going back forgets the selected field: the next mapping opens with none', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-id-copy', field: ORDER_ID });
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();

    await back().click();
    await page.getByRole('button', { name: 'mappings/order-id-copy' }).click();

    await expect.element(page.getByText('Select a target field to see its function graph.')).toBeVisible();
    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).not.toBeInTheDocument();
  });

  test('the host selects the field the editor asks for', async () => {
    const refused = {
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [{ severity: 'error' as const, code: 'unknown-function', message: 'no such function', location: { kind: 'authoring-id' as const, authoringId: 't1' } }],
    };
    render({ ...fakeApiClient(), saveMapping: () => Promise.reject(new ApiProblem(refused)) }, { mapping: 'mappings/order-id-copy' });
    await userEvent.dragAndDrop(sourceRow(ORDER_ID), targetRow(`/${ORDER}/Note`));
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.element(page.getByText('Select a target field to see its function graph.')).toBeVisible();

    await page.getByRole('button', { name: 'Show t1' }).click();

    await expect.element(page.getByTestId(`sink:${ORDER_ID}`)).toBeVisible();
  });

  test('an empty workspace says so', async () => {
    render(fakeApiClient({}));

    await expect.element(page.getByText('The workspace has no mappings.')).toBeVisible();
  });

  test('a list the service refuses shows the problem', async () => {
    const problem = { type: 'about:blank', title: 'Service Unavailable', status: 503, detail: 'the workspace is offline' };
    render({ ...fakeApiClient(), listMappings: () => Promise.reject(new ApiProblem(problem)) });

    await expect.element(page.getByRole('heading', { name: /Service Unavailable/ })).toBeVisible();
    await expect.element(page.getByText('the workspace is offline')).toBeVisible();
  });
});

describe('the New mapping form', () => {
  async function fillSide(side: 'Source' | 'Target', bundle: string, root: RootSelector) {
    await page.getByRole('textbox', { name: `${side} bundle` }).fill(bundle);
    if ('element' in root) {
      await page.getByRole('combobox', { name: `${side} root` }).selectOptions('Element');
      await page.getByRole('textbox', { name: `${side} root element` }).fill(root.element);
    } else if ('json' in root) {
      await page.getByRole('combobox', { name: `${side} root` }).selectOptions('JSON');
    } else {
      await page.getByRole('combobox', { name: `${side} root` }).selectOptions('WSDL operation');
      await page.getByRole('textbox', { name: `${side} interface` }).fill(root.wsdl.interface);
      await page.getByRole('textbox', { name: `${side} operation` }).fill(root.wsdl.operation);
      await page.getByRole('combobox', { name: `${side} direction` }).selectOptions(root.wsdl.direction);
      if (root.wsdl.fault !== undefined) await page.getByRole('textbox', { name: `${side} fault` }).fill(root.wsdl.fault);
    }
  }

  async function create(id: string, source: RootSelector, target: RootSelector, sourceBundle = ORDER_XSD) {
    await page.getByRole('button', { name: 'New mapping' }).click();
    await page.getByRole('textbox', { name: 'Mapping id' }).fill(id);
    await fillSide('Source', sourceBundle, source);
    await fillSide('Target', ORDER_XSD, target);
    await page.getByRole('button', { name: 'Create' }).click();
  }

  const element = { element: ORDER };

  test.each<[string, RootSelector]>([
    ['an element', element],
    ['the JSON root', { json: '$' }],
    ['a WSDL input', { wsdl: { interface: 'Q{urn:a}OrderPort', operation: 'place', direction: 'input' } }],
    ['a WSDL output', { wsdl: { interface: 'OrderPort', operation: 'place', direction: 'output' } }],
    ['a WSDL fault', { wsdl: { interface: 'Q{urn:a}OrderPort', operation: 'place', direction: 'fault', fault: 'refused' } }],
  ])('sends %s as the source root, and opens the new mapping', async (_, sourceRoot) => {
    const { api, createMapping } = spied();
    render(api);

    await create('mappings/new-one', sourceRoot, element);

    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).toBeVisible();
    await expect.element(page.getByRole('tree', { name: 'Target structure' })).toBeVisible();
    expect(createMapping.mock.calls).toEqual([
      [{ id: 'mappings/new-one', source: { bundle: [ORDER_XSD], root: sourceRoot }, target: { bundle: [ORDER_XSD], root: element } }],
    ]);
  });

  test('sends a target root of its own kind, apart from the source root', async () => {
    const { api, createMapping } = spied();
    render(api);
    const wsdl: RootSelector = { wsdl: { interface: 'OrderPort', operation: 'place', direction: 'output' } };

    await create('mappings/new-one', { json: '$' }, wsdl);

    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).toBeVisible();
    expect(createMapping.mock.calls[0]![0]).toMatchObject({ source: { root: { json: '$' } }, target: { root: wsdl } });
  });

  test('a fault typed and then left by choosing another direction is not sent', async () => {
    const { api, createMapping } = spied();
    render(api);
    await page.getByRole('button', { name: 'New mapping' }).click();
    await page.getByRole('textbox', { name: 'Mapping id' }).fill('mappings/new-one');
    await fillSide('Source', ORDER_XSD, { wsdl: { interface: 'OrderPort', operation: 'place', direction: 'fault', fault: 'refused' } });
    await page.getByRole('combobox', { name: 'Source direction' }).selectOptions('input');
    await fillSide('Target', ORDER_XSD, element);

    await expect.element(page.getByRole('textbox', { name: 'Source fault' })).not.toBeInTheDocument();
    await page.getByRole('button', { name: 'Create' }).click();

    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).toBeVisible();
    expect(createMapping.mock.calls[0]![0].source.root).toEqual({ wsdl: { interface: 'OrderPort', operation: 'place', direction: 'input' } });
  });

  test('takes one bundle reference per line, trimmed, without blank lines, and shows a 422 with its diagnostics', async () => {
    const { api, createMapping } = spied();
    render(api);

    await create('mappings/new-one', element, element, `  ${ORDER_XSD}  \n\nmore/types.xsd\n`);

    await expect.element(page.getByRole('heading', { name: /Model refused/ })).toBeVisible();
    await expect.element(page.getByRole('list', { name: 'Create diagnostics' })).toMatchTextContent(/schema-unreadable/);
    expect(createMapping.mock.calls[0]![0].source.bundle).toEqual([ORDER_XSD, 'more/types.xsd']);
    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).not.toBeInTheDocument();
  });

  test('an id that exists shows the 409 mapping-exists problem and opens nothing', async () => {
    render(fakeApiClient());

    await create('mappings/order-id-copy', element, element);

    await expect.element(page.getByRole('heading', { name: /Mapping exists/ })).toBeVisible();
    await expect.element(page.getByText('a mapping with this id exists')).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'mappings/order-id-copy' })).not.toBeInTheDocument();
  });

  test('an id that is not a workspace path shows the 400 problem', async () => {
    render(fakeApiClient());

    await create('mappings/../escape', element, element);

    await expect.element(page.getByRole('heading', { name: /Not a workspace path/ })).toBeVisible();
    await expect.element(page.getByText('not a workspace path: "mappings/../escape"')).toBeVisible();
  });

  test('the new mapping is in the list when the author goes back', async () => {
    render(fakeApiClient());

    await create('mappings/new-one', element, element);
    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).toBeVisible();
    await back().click();

    await expect.element(page.getByRole('button', { name: 'mappings/new-one' })).toBeVisible();
  });

  test('Create is disabled while the service has not answered', async () => {
    const fake = fakeApiClient();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    render({ ...fake, createMapping: async (request) => answered.then(() => fake.createMapping(request)) });

    await create('mappings/new-one', element, element);

    // PatternFly names a loading button after its spinner too: "Loading... Create"
    await expect.element(page.getByRole('button', { name: /Create$/ })).toBeDisabled();
    answer();
    await expect.element(page.getByRole('heading', { name: 'mappings/new-one' })).toBeVisible();
  });

  test('Cancel closes the form and sends nothing', async () => {
    const { api, createMapping } = spied();
    render(api);
    await page.getByRole('button', { name: 'New mapping' }).click();
    await page.getByRole('textbox', { name: 'Mapping id' }).fill('mappings/new-one');

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(page.getByRole('textbox', { name: 'Mapping id' })).not.toBeInTheDocument();
    await expect.element(mappingList()).toBeVisible();
    expect(createMapping).not.toHaveBeenCalled();
  });
});

describe('the unsaved-changes guard', () => {
  test('going back with no unsaved change asks nothing', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-unmapped' });
    await expect.element(targetRow(ORDER_ID)).toBeVisible();

    await back().click();

    await expect.element(mappingList()).toBeVisible();
    await expect.element(guard()).not.toBeInTheDocument();
  });

  test('going back with unsaved changes asks; Cancel stays with the working copy', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-unmapped' });
    await drawLink();

    await back().click();
    await expect.element(guard()).toBeVisible();
    await guard().getByRole('button', { name: 'Cancel' }).click();

    await expect.element(guard()).not.toBeInTheDocument();
    await expect.element(page.getByText('Unsaved')).toBeVisible();
    await expect.element(targetRow(ORDER_ID)).toMatchTextContent(/← OrderId/);
    await expect.element(mappingList()).not.toBeInTheDocument();
  });

  test('Escape closes the question as Cancel does', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-unmapped' });
    await drawLink();

    await back().click();
    await expect.element(guard()).toBeVisible();
    await userEvent.keyboard('{Escape}');

    await expect.element(guard()).not.toBeInTheDocument();
    await expect.element(page.getByText('Unsaved')).toBeVisible();
    await expect.element(mappingList()).not.toBeInTheDocument();
  });

  test('Discard changes goes back to the list, and the mapping reopens as stored', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-unmapped' });
    await drawLink();

    await back().click();
    await guard().getByRole('button', { name: 'Discard changes' }).click();

    await expect.element(mappingList()).toBeVisible();
    await page.getByRole('button', { name: 'mappings/order-unmapped' }).click();
    await expect.element(targetRow(ORDER_ID)).toBeVisible();
    await expect.element(targetRow(ORDER_ID)).not.toMatchTextContent(/← OrderId/);
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
  });

  test('the page asks before unloading only while the working copy has unsaved changes', async () => {
    render(fakeApiClient(), { mapping: 'mappings/order-unmapped' });
    await expect.element(targetRow(ORDER_ID)).toBeVisible();
    expect(asksBeforeUnload()).toBe(false);

    await drawLink();
    expect(asksBeforeUnload()).toBe(true);

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.element(page.getByText('Unsaved')).not.toBeInTheDocument();
    expect(asksBeforeUnload()).toBe(false);

    await drawLink();
    await back().click();
    await guard().getByRole('button', { name: 'Discard changes' }).click();
    await expect.element(mappingList()).toBeVisible();
    expect(asksBeforeUnload()).toBe(false);
  });
});
