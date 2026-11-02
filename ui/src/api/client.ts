import type { components } from '../generated/api';
import type { MappingModel } from '../generated/mapping-model';

type Schemas = components['schemas'];

export type Diagnostic = Schemas['DiagnosticDto'];
export type Problem = Schemas['Problem'] | Schemas['RefusedProblem'];
export type StructureRequest = Schemas['StructureRequest'];
export type StructureResponse = Schemas['StructureResponse'];
export type StructureLoaded = Schemas['StructureLoaded'];
export type FieldDto = Schemas['FieldDto'];
export type TestResult = Schemas['TestResult'];

/**
 * The test request with the model typed by json-schema-to-typescript, as ADR-0015 asks of `ApiClient`.
 * openapi-typescript's own `mapping-model.schema` type marks the schema's `$defs` as a required member, so a
 * `MappingModel` is not assignable to it.
 */
export type TestRequest = Omit<Schemas['TestRequest'], 'model'> & { model: MappingModel };

/** A transport error of the service: an RFC 9457 problem (ADR-0015, ADR-0024). */
export class ApiProblem extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ? `${problem.title}: ${problem.detail}` : problem.title);
    this.name = 'ApiProblem';
    this.problem = problem;
  }
}

/** What the editor shows for a failed call: an `ApiProblem`'s title, detail and diagnostics, or another error's message. */
export function describeError(error: unknown): { title: string; detail: string; diagnostics: Diagnostic[] } {
  if (error instanceof ApiProblem) {
    const { problem } = error;
    return { title: problem.title, detail: problem.detail, diagnostics: 'diagnostics' in problem ? problem.diagnostics : [] };
  }
  return { title: error instanceof Error ? error.message : String(error), detail: '', diagnostics: [] };
}

/**
 * The editor's port to the service (ADR-0013). Every method rejects with an `ApiProblem` on a transport error.
 * Diagnostics are a result, never a rejection, except for a refused save (422 `model-refused`).
 */
export interface ApiClient {
  getMapping(id: string): Promise<MappingModel>;
  /** Resolves to the canonical model the service wrote. */
  saveMapping(id: string, model: MappingModel): Promise<MappingModel>;
  loadStructure(request: StructureRequest): Promise<StructureResponse>;
  /** Runs the working copy in the request on its input message. */
  runTest(id: string, request: TestRequest): Promise<TestResult>;
}
