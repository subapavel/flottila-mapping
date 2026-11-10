import { skipToken, useQuery } from '@tanstack/react-query';
import type { ApiClient } from '../../api/client';
import type { StructureRef } from '../../generated/mapping-model';

/**
 * The structure of one side as the service loads it; the trees and the rest of the editor share its query. A side not
 * chosen yet (ADR-0029) loads nothing, and its query keeps no data.
 */
export function useStructure(mappingId: string, api: ApiClient, ref: StructureRef | undefined) {
  const request = ref && { base: mappingId.split('/').slice(0, -1).join('/'), bundle: ref.bundle, root: ref.root };
  return useQuery({ queryKey: ['structure', request ?? null], queryFn: request ? () => api.loadStructure(request) : skipToken });
}
