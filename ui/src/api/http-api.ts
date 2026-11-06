import type { MappingModel } from '../generated/mapping-model';
import {
  ApiProblem,
  type ApiClient,
  type Problem,
  type StoredMapping,
  type StructureRequest,
  type StructureResponse,
  type TestRequest,
  type TestResult,
} from './client';

/** The `ApiClient` over the service's HTTP API (ADR-0015). `baseUrl` is `''` when the editor shares the origin. */
export function httpApiClient(baseUrl = '', fetchPort: typeof fetch = (input, init) => fetch(input, init)): ApiClient {
  const mapping = (id: string) => `${baseUrl}/api/mappings/${id.split('/').map(encodeURIComponent).join('/')}`;

  async function send(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json', ...headers };
      init.body = JSON.stringify(body);
    }
    const response = await fetchPort(url, init);
    if (response.ok) return response;
    throw new ApiProblem(await problemOf(response));
  }

  async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
    return (await (await send(url, method, body)).json()) as T;
  }

  return {
    getMapping: async (id) => storedOf(await send(mapping(id), 'GET')),
    saveMapping: async (id, model, etag) => storedOf(await send(mapping(id), 'PUT', model, { 'if-match': etag })),
    loadStructure: (request: StructureRequest) => call<StructureResponse>(`${baseUrl}/api/structures`, 'POST', request),
    runTest: (id, request: TestRequest) => call<TestResult>(`${mapping(id)}/test`, 'POST', request),
  };
}

/** A model answer: the canonical model and its ETag, which a later save sends back (ADR-0024, ADR-0027). */
async function storedOf(response: Response): Promise<StoredMapping> {
  const etag = response.headers.get('etag');
  if (etag === null) throw new Error('the service answered a mapping with no ETag');
  return { model: (await response.json()) as MappingModel, etag };
}

async function problemOf(response: Response): Promise<Problem> {
  if (response.headers.get('content-type')?.startsWith('application/problem+json')) {
    return (await response.json()) as Problem;
  }
  // Vert.x answers some errors without problem+json, such as 413 above 10 MB in spec 1 (ADR-0024).
  return { type: 'about:blank', title: response.statusText, status: response.status, detail: '' };
}
