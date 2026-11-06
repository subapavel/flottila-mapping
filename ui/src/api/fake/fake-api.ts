import caseOutput from '../../../../corpus/cases/link/direct-copy/001/expected.xml?raw';
import caseInput from '../../../../corpus/cases/link/direct-copy/001/input.xml?raw';
import orderIdCopyText from '../../../../corpus/mappings/order-id-copy.mapping.json?raw';
import catalogueText from '../../../../contract/function-catalogue.json?raw';
import type { MappingModel } from '../../generated/mapping-model';
import {
  ApiProblem,
  type ApiClient,
  type FunctionCatalogue,
  type StoredMapping,
  type StructureResponse,
  type TestResult,
} from '../client';
import { orderStructure } from './order-structure';

const PROBLEM = 'urn:flottila:mapping:problem:';

// The corpus file is a valid model: the engine's corpus case loads it.
const orderIdCopy = JSON.parse(orderIdCopyText) as MappingModel;

/** The corpus mappings, and the same mapping without its target field mappings, the thin path's start. */
function corpusMappings(): Record<string, MappingModel> {
  const unmapped = { ...orderIdCopy };
  delete unmapped.targetFieldMappings;
  return { 'mappings/order-id-copy': orderIdCopy, 'mappings/order-unmapped': unmapped };
}

/** The structures the fake knows, by workspace path of the bundle's one file. */
const structures: Record<string, StructureResponse> = { 'structures/skeleton/order.xsd': orderStructure };

/** The test runs the fake knows: the corpus case's mapping, input and output (`link/direct-copy/001`). */
const cases = [{ links: links(orderIdCopy), input: caseInput, output: caseOutput }];

/**
 * An in-memory `ApiClient` over synthetic fixtures from `corpus/` and the catalogue of `contract/` (ADR-0013,
 * ADR-0027), for component tests, the e2e suite
 * and `?api=fake`. It runs no engine: a test run answers only a corpus case, and refuses an unconnected result as
 * the engine does. `seed` replaces the corpus mappings.
 */
export function fakeApiClient(seed: Record<string, MappingModel> = corpusMappings()): ApiClient {
  // Each write gets a tag of its own, as a changed file gets a new sha256 (ADR-0024); never the same tag twice.
  let writes = 0;
  const written = (model: MappingModel): StoredMapping => ({ model: structuredClone(model), etag: `"fake:${++writes}"` });
  const mappings = new Map(Object.entries(seed).map(([id, model]) => [id, written(model)]));

  const stored = (id: string) => {
    const mapping = mappings.get(id);
    if (!mapping) throw notFound(id);
    return mapping;
  };

  return {
    getMapping: async (id) => structuredClone(stored(id)),

    saveMapping: async (id, model, etag) => {
      if (stored(id).etag !== etag) {
        throw new ApiProblem({
          type: `${PROBLEM}mapping-changed`,
          title: 'Mapping changed',
          status: 409,
          detail: 'the mapping changed on disk since the If-Match tag was read; nothing was saved',
        });
      }
      mappings.set(id, written(sortedKeys(model)));
      return structuredClone(stored(id));
    },

    loadStructure: async ({ base, bundle }) => {
      const files = bundle.map((file) => resolve(base, file)).join(', ');
      return (
        structures[files] ?? {
          kind: 'refused',
          diagnostics: [
            {
              severity: 'error',
              code: 'schema-unreadable',
              message: `the fake API has no structure for ${files}`,
              location: { kind: 'file-position', file: bundle.join(', '), line: 1, column: 1 },
            },
          ],
        }
      );
    },

    runTest: async (_id, { model, input }): Promise<TestResult> => {
      const known = cases.find((c) => c.input === input && c.links === links(model));
      // a test run's output carries its trace (ADR-0015, #53); the fake records none
      if (known) return { kind: 'output', output: known.output, diagnostics: [], trace: {} };
      const unconnected = Object.values(model.targetFieldMappings ?? {}).filter((m) => m.result === null);
      if (unconnected.length > 0) {
        return {
          kind: 'refused',
          diagnostics: unconnected.map((m) => ({
            severity: 'error',
            code: 'unconnected-target-field',
            message: "the target field mapping's result is not connected",
            location: { kind: 'authoring-id', authoringId: m.id },
          })),
        };
      }
      throw new ApiProblem({
        type: `${PROBLEM}invalid-request`,
        title: 'Invalid request',
        status: 400,
        detail: 'the fake API has no corpus case for this working copy and input',
      });
    },

    // The committed packed catalogue (ADR-0027): the bytes GET /api/catalogue serves.
    getCatalogue: async () => JSON.parse(catalogueText) as FunctionCatalogue,
  };
}

function notFound(id: string) {
  return new ApiProblem({ type: `${PROBLEM}not-found`, title: 'Not found', status: 404, detail: `no mapping ${id}` });
}

/** The field links of a model, as text: each target field with the source field its result box reads. */
function links(model: MappingModel): string {
  return Object.entries(model.targetFieldMappings ?? {})
    .map(([target, m]) => {
      const box = m.result === null ? undefined : m.boxes[m.result];
      return `${target}<-${box?.kind === 'source' ? box.field : '?'}`;
    })
    .sort()
    .join('\n');
}

/** A workspace path: `bundle` resolved against the directory `base`. */
function resolve(base: string, bundle: string): string {
  const parts = base === '' ? [] : base.split('/');
  for (const segment of bundle.split('/')) {
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

/** Sorts object keys at every level by UTF-16 code unit, as the canonical writer does (ADR-0010). */
function sortedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortedKeys) as T;
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortedKeys(record[key])]),
  ) as T;
}
