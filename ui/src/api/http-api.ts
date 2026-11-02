import type { MappingModel } from '../generated/mapping-model';
import {
  ApiProblem,
  type ApiClient,
  type Problem,
  type StructureRequest,
  type StructureResponse,
  type TestRequest,
  type TestResult,
} from './client';

/** The `ApiClient` over the service's HTTP API (ADR-0015). `baseUrl` is `''` when the editor shares the origin. */
export function httpApiClient(baseUrl = '', fetchPort: typeof fetch = (input, init) => fetch(input, init)): ApiClient {
  const mapping = (id: string) => `${baseUrl}/api/mappings/${id.split('/').map(encodeURIComponent).join('/')}`;

  async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetchPort(url, init);
    if (response.ok) return (await response.json()) as T;
    throw new ApiProblem(await problemOf(response));
  }

  return {
    getMapping: (id) => call<MappingModel>(mapping(id), 'GET'),
    saveMapping: (id, model) => call<MappingModel>(mapping(id), 'PUT', model),
    loadStructure: (request: StructureRequest) => call<StructureResponse>(`${baseUrl}/api/structures`, 'POST', request),
    runTest: (id, request: TestRequest) => call<TestResult>(`${mapping(id)}/test`, 'POST', request),
  };
}

async function problemOf(response: Response): Promise<Problem> {
  if (response.headers.get('content-type')?.startsWith('application/problem+json')) {
    return (await response.json()) as Problem;
  }
  // Vert.x answers some errors without problem+json, such as 413 above 10 MB in spec 1 (ADR-0024).
  return { type: 'about:blank', title: response.statusText, status: response.status, detail: '' };
}
