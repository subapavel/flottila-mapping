import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { MappingModel } from '../../generated/mapping-model';
import { ApiProblem, type Diagnostic } from '../client';
import { fakeApiClient } from './fake-api';

// The expectations come from the corpus files and from replies of the real service, observed on 2026-11-02.
const corpus = (path: string) => readFileSync(new URL(`../../../../corpus/${path}`, import.meta.url), 'utf8');
const corpusMapping = JSON.parse(corpus('mappings/order-id-copy.mapping.json')) as MappingModel;
const caseInput = corpus('cases/link/direct-copy/001/input.xml');
const caseOutput = corpus('cases/link/direct-copy/001/expected.xml');
const ORDER_ID = '/Q{urn:flottila:corpus:skeleton}Order/OrderId';

async function problemOf(call: Promise<unknown>): Promise<ApiProblem> {
  const error: unknown = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiProblem);
  return error as ApiProblem;
}

describe('the fake ApiClient over the corpus', () => {
  test('opens the corpus mapping, and the mapping without its target field mappings', async () => {
    const api = fakeApiClient();

    expect(await api.getMapping('mappings/order-id-copy')).toEqual(corpusMapping);
    const unmapped = { ...corpusMapping };
    delete unmapped.targetFieldMappings;
    expect(await api.getMapping('mappings/order-unmapped')).toEqual(unmapped);
  });

  test('answers an unknown mapping id with a not-found problem', async () => {
    const problem = await problemOf(fakeApiClient().getMapping('mappings/missing'));

    expect(problem.problem.status).toBe(404);
    expect(problem.problem.type).toBe('urn:flottila:mapping:problem:not-found');
  });

  test('save keeps the model, sorts its keys as the canonical writer does, and the next open returns it', async () => {
    const api = fakeApiClient();
    const sent: MappingModel = {
      target: corpusMapping.target,
      source: corpusMapping.source,
      formatVersion: 1,
      targetFieldMappings: { [ORDER_ID]: { result: 'b1', id: 'm1', boxes: { b1: { kind: 'source', field: ORDER_ID } } } },
    };

    const saved = await api.saveMapping('mappings/order-unmapped', sent);

    expect(saved).toEqual(sent);
    expect(Object.keys(saved)).toEqual(['formatVersion', 'source', 'target', 'targetFieldMappings']);
    expect(Object.keys(saved.targetFieldMappings![ORDER_ID]!)).toEqual(['boxes', 'id', 'result']);
    expect(await api.getMapping('mappings/order-unmapped')).toEqual(sent);
    expect((await problemOf(api.saveMapping('mappings/missing', sent))).problem.status).toBe(404);
  });

  test('what it returns is a copy: changing it leaves the fake as it was', async () => {
    const api = fakeApiClient();
    const first = await api.getMapping('mappings/order-id-copy');
    first.targetFieldMappings![ORDER_ID]!.result = null;

    expect(await api.getMapping('mappings/order-id-copy')).toEqual(corpusMapping);
  });

  test('loads the order structure relative to the mapping directory', async () => {
    const response = await fakeApiClient().loadStructure({
      base: 'mappings',
      bundle: corpusMapping.source.bundle,
      root: corpusMapping.source.root,
    });

    expect(response.kind).toBe('loaded');
    if (response.kind !== 'loaded') return;
    expect(response.fingerprint).toBe(corpusMapping.source.fingerprint);
    expect(response.root.step).toBe('Q{urn:flottila:corpus:skeleton}Order');
    expect(response.types[response.root.type!]!.map((f) => f.step)).toEqual([
      '@channel',
      'OrderId',
      'Quantity',
      'Amount',
      'Urgent',
      'DeliveryDate',
      'PickupTime',
      'CreatedAt',
      'Note',
    ]);
  });

  test('resolves a bundle against the workspace root when the base is empty', async () => {
    const response = await fakeApiClient().loadStructure({
      base: '',
      bundle: ['structures/skeleton/order.xsd'],
      root: corpusMapping.source.root,
    });

    expect(response.kind).toBe('loaded');
  });

  test('refuses a bundle it does not know as unreadable at line 1, column 1 of the file', async () => {
    const response = await fakeApiClient().loadStructure({
      base: 'mappings',
      bundle: ['missing.xsd'],
      root: corpusMapping.source.root,
    });

    expect(response).toEqual({
      kind: 'refused',
      diagnostics: [
        {
          severity: 'error',
          code: 'schema-unreadable',
          message: 'the fake API has no structure for mappings/missing.xsd',
          location: { kind: 'file-position', file: 'missing.xsd', line: 1, column: 1 },
        },
      ],
    });
  });

  test('a test run of the corpus mapping on the corpus input gives the corpus output', async () => {
    const result = await fakeApiClient().runTest('mappings/order-id-copy', { model: corpusMapping, input: caseInput });

    // since #53 a test run's output carries its trace; the fake records none (ADR-0015)
    expect(result).toEqual({ kind: 'output', output: caseOutput, diagnostics: [], trace: {} });
  });

  test('a link drawn with other ids is the same link: the test run still gives the corpus output', async () => {
    const relinked: MappingModel = {
      ...corpusMapping,
      targetFieldMappings: { [ORDER_ID]: { id: 'x9', result: 'y9', boxes: { y9: { kind: 'source', field: ORDER_ID } } } },
    };

    const result = await fakeApiClient().runTest('mappings/order-unmapped', { model: relinked, input: caseInput });

    expect(result.kind).toBe('output');
  });

  test('a target field mapping whose result is null refuses the test run with unconnected-target-field at its id', async () => {
    const unfinished = structuredClone(corpusMapping);
    unfinished.targetFieldMappings![ORDER_ID]!.result = null;

    const result = await fakeApiClient().runTest('mappings/order-id-copy', { model: unfinished, input: caseInput });

    expect(result).toEqual({
      kind: 'refused',
      diagnostics: [
        {
          severity: 'error',
          code: 'unconnected-target-field',
          message: "the target field mapping's result is not connected",
          location: { kind: 'authoring-id', authoringId: 't1' },
        },
      ],
    });
  });

  test('a working copy or input without a corpus case is an invalid-request problem, never a made-up output', async () => {
    const api = fakeApiClient();
    const unmapped = { ...corpusMapping };
    delete unmapped.targetFieldMappings;

    const noCase = await problemOf(api.runTest('mappings/order-unmapped', { model: unmapped, input: caseInput }));
    const otherInput = await problemOf(api.runTest('mappings/order-id-copy', { model: corpusMapping, input: '<a/>' }));

    for (const problem of [noCase, otherInput]) {
      expect(problem.problem.status).toBe(400);
      expect(problem.problem.type).toBe('urn:flottila:mapping:problem:invalid-request');
    }
  });

  test('compile answers the scenario fixture of the mapping, and no diagnostics for a mapping it does not name', async () => {
    const unreachable: Diagnostic = {
      severity: 'warning',
      code: 'unreachable-box',
      message: 'the result of the target field mapping t1 does not reach this box, so compile ignores it',
      location: { kind: 'authoring-id', authoringId: 'f9' },
    };
    const api = fakeApiClient(undefined, { compile: { 'mappings/order-id-copy': [unreachable] } });

    expect(await api.compile('mappings/order-id-copy', corpusMapping)).toEqual({ diagnostics: [unreachable] });
    expect(await api.compile('mappings/order-unmapped', corpusMapping)).toEqual({ diagnostics: [] });
    expect(await fakeApiClient().compile('mappings/order-id-copy', corpusMapping)).toEqual({ diagnostics: [] });
  });

  test('compile of a mapping it does not know is a not-found problem', async () => {
    const problem = await problemOf(fakeApiClient().compile('mappings/missing', corpusMapping));

    expect(problem.problem.status).toBe(404);
  });

  test('a fake seeded with its own mappings opens those instead of the corpus', async () => {
    const api = fakeApiClient({ 'drafts/one': corpusMapping });

    expect(await api.getMapping('drafts/one')).toEqual(corpusMapping);
    expect((await problemOf(api.getMapping('mappings/order-id-copy'))).problem.status).toBe(404);
  });
});
