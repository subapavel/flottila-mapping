import type { components } from '../generated/api';
import type { FunctionCatalogue } from '../generated/function-catalogue';
import type { MappingModel } from '../generated/mapping-model';

type Schemas = components['schemas'];

export type Diagnostic = Schemas['DiagnosticDto'];
export type Problem = Schemas['Problem'] | Schemas['RefusedProblem'];
export type StructureRequest = Schemas['StructureRequest'];
export type StructureResponse = Schemas['StructureResponse'];
export type StructureLoaded = Schemas['StructureLoaded'];
export type FieldDto = Schemas['FieldDto'];
export type TestResult = Schemas['TestResult'];

/** The answer of `GET /api/catalogue`, typed by json-schema-to-typescript from the contract's catalogue schema (ADR-0026). */
export type { FunctionCatalogue };

/**
 * The test request with the model typed by json-schema-to-typescript, as ADR-0015 asks of `ApiClient`.
 * openapi-typescript's own `mapping-model.schema` type marks the schema's `$defs` as a required member, so a
 * `MappingModel` is not assignable to it.
 */
export type TestRequest = Omit<Schemas['TestRequest'], 'model'> & { model: MappingModel };

/** A mapping as the service stored it: the canonical model and its strong ETag (ADR-0024). */
export interface StoredMapping {
  model: MappingModel;
  etag: string;
}

/** A transport error of the service: an RFC 9457 problem (ADR-0015, ADR-0024). */
export class ApiProblem extends Error {
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ? `${problem.title}: ${problem.detail}` : problem.title);
    this.name = 'ApiProblem';
    this.problem = problem;
  }
}

/** Whether a failed save is a save conflict: 409 `mapping-changed`, the file changed on disk (ADR-0027). */
export function isSaveConflict(error: unknown): boolean {
  return error instanceof ApiProblem && error.problem.type === 'urn:flottila:mapping:problem:mapping-changed';
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
  getMapping(id: string): Promise<StoredMapping>;
  /**
   * Saves on condition that the stored file still has `etag` (`If-Match`, ADR-0027), and resolves to the canonical
   * model the service wrote. A file changed on disk rejects with a 409 `mapping-changed` problem.
   */
  saveMapping(id: string, model: MappingModel, etag: string): Promise<StoredMapping>;
  loadStructure(request: StructureRequest): Promise<StructureResponse>;
  /** Runs the working copy in the request on its input message. */
  runTest(id: string, request: TestRequest): Promise<TestResult>;
  /** The packed function catalogue, keyed by function id (ADR-0026, ADR-0027). */
  getCatalogue(): Promise<FunctionCatalogue>;
}
