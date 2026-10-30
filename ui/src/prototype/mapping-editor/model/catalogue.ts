// PROTOTYPE (#10, throwaway): typed view of catalogue.json.
import raw from './catalogue.json';

export type FidelityLevel = 'exact' | 'deviation' | 'assumed';
export type CatalogueParam = { name: string; type: 'string' | 'table'; default: string };
export type CatalogueFunction = {
  name: string;
  poName: string;
  executionKind: 'single' | 'context' | 'queue';
  inputs: string[];
  params: CatalogueParam[];
  portable: boolean;
  fidelity: { level: FidelityLevel; deviationId?: string; example?: string };
};

export const CATALOGUE: CatalogueFunction[] = raw.functions as CatalogueFunction[];
export const CATALOGUE_BY_NAME: Record<string, CatalogueFunction> = Object.fromEntries(
  CATALOGUE.map((f) => [f.name, f])
);

export function fidelityText(f: CatalogueFunction): string {
  const fi = f.fidelity;
  if (fi.level === 'exact') return 'exact';
  if (fi.level === 'deviation') return `deviation ${fi.deviationId ?? ''}: ${fi.example ?? ''}`;
  return `assumed reading: ${fi.example ?? ''}`;
}
