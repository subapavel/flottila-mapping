import { describe, expect, test, vi } from 'vitest';
import type { MappingModel } from '../generated/mapping-model';
import { ApiProblem } from './client';
import { httpApiClient } from './http-api';

const model: MappingModel = {
  formatVersion: 1,
  source: { bundle: ['order.xsd'], fingerprint: 'sha256:00', root: { element: 'Q{urn:a}Order' } },
  target: { bundle: ['order.xsd'], fingerprint: 'sha256:00', root: { element: 'Q{urn:a}Order' } },
};

interface Call {
  url: string;
  method: string;
  contentType: string | null;
  body: unknown;
}

/** A fetch port that records each request and answers with the given response. */
function fakeFetch(answer: () => Response) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      contentType: headers.get('content-type'),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return answer();
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('the HTTP ApiClient', () => {
  test('uses the global fetch when no fetch port is given', async () => {
    const port = fakeFetch(() => json(model));
    vi.stubGlobal('fetch', port.fetch);
    try {
      expect(await httpApiClient().getMapping('m/one')).toEqual(model);
      expect(port.calls.map((c) => c.url)).toEqual(['/api/mappings/m/one']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('opens a mapping by GET on its id, keeping the id segments as path segments', async () => {
    const port = fakeFetch(() => json(model));

    const opened = await httpApiClient('http://svc', port.fetch).getMapping('mappings/order-id-copy');

    expect(opened).toEqual(model);
    expect(port.calls).toEqual([
      { url: 'http://svc/api/mappings/mappings/order-id-copy', method: 'GET', contentType: null, body: undefined },
    ]);
  });

  test('saves by PUT of the working copy as JSON and returns the canonical response', async () => {
    const canonical = { ...model, target: { ...model.target, fingerprint: 'sha256:01' } };
    const port = fakeFetch(() => json(canonical));

    const saved = await httpApiClient('', port.fetch).saveMapping('m/one', model);

    expect(saved).toEqual(canonical);
    expect(port.calls).toEqual([{ url: '/api/mappings/m/one', method: 'PUT', contentType: 'application/json', body: model }]);
  });

  test('loads a structure by POST to /api/structures', async () => {
    const refused = { kind: 'refused', diagnostics: [] };
    const port = fakeFetch(() => json(refused));
    const request = { base: 'mappings', bundle: ['order.xsd'], root: { element: 'Q{urn:a}Order' } };

    expect(await httpApiClient('', port.fetch).loadStructure(request)).toEqual(refused);
    expect(port.calls).toEqual([{ url: '/api/structures', method: 'POST', contentType: 'application/json', body: request }]);
  });

  test('runs a test by POST of the working copy and the input to the mapping test path', async () => {
    const output = { kind: 'output', output: '<a/>', diagnostics: [], trace: {} };
    const port = fakeFetch(() => json(output));

    expect(await httpApiClient('', port.fetch).runTest('m/one', { model, input: '<a/>' })).toEqual(output);
    expect(port.calls).toEqual([
      { url: '/api/mappings/m/one/test', method: 'POST', contentType: 'application/json', body: { model, input: '<a/>' } },
    ]);
  });

  test('compiles by POST of the working copy to the mapping compile path, passing the abort signal on', async () => {
    const compiled = {
      diagnostics: [
        { severity: 'warning', code: 'unreachable-box', message: 'not reached', location: { kind: 'authoring-id', authoringId: 'f9' } },
      ],
    };
    const port = fakeFetch(() => json(compiled));
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetch: typeof port.fetch = (input, init) => {
      signals.push(init?.signal);
      return port.fetch(input, init);
    };
    const controller = new AbortController();

    expect(await httpApiClient('', fetch).compile('m/one', model, controller.signal)).toEqual(compiled);
    expect(port.calls).toEqual([{ url: '/api/mappings/m/one/compile', method: 'POST', contentType: 'application/json', body: model }]);
    expect(signals).toEqual([controller.signal]);
  });

  test('a problem+json answer becomes an ApiProblem with its type, status and diagnostics', async () => {
    const refused = {
      type: 'urn:flottila:mapping:problem:model-refused',
      title: 'Model refused',
      status: 422,
      detail: 'the mapping model is refused by validation stage 1 or 2',
      diagnostics: [
        { severity: 'error', code: 'missing-member', message: 'required properties are missing: source, target', location: { kind: 'pointer', pointer: '' } },
      ],
    };
    const port = fakeFetch(() => json(refused, 422, 'application/problem+json'));

    const error = await httpApiClient('', port.fetch).saveMapping('m/one', model).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiProblem);
    expect((error as ApiProblem).problem).toEqual(refused);
    expect((error as ApiProblem).message).toBe('Model refused: the mapping model is refused by validation stage 1 or 2');
  });

  test('an error answer without problem+json still becomes an ApiProblem with its status', async () => {
    // Vert.x answers a body above 10 MB with a bare 413 in spec 1 (ADR-0024)
    const port = fakeFetch(() => new Response('', { status: 413, statusText: 'Request Entity Too Large' }));

    const error = await httpApiClient('', port.fetch).runTest('m/one', { model, input: '<a/>' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiProblem);
    expect((error as ApiProblem).problem).toEqual({ type: 'about:blank', title: 'Request Entity Too Large', status: 413, detail: '' });
    expect((error as ApiProblem).message).toBe('Request Entity Too Large');
  });
});
