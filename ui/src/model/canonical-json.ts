import type { MappingModel } from '../generated/mapping-model';

export function canonicalJson(model: MappingModel): string {
  return JSON.stringify(model);
}
