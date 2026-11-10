import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { BrowserStateStore } from '../editor';
import { MappingList } from '../studio/list/MappingList';
import { Studio } from '../studio/shell/Studio';
import { listHref, mappingOf, studioHref } from './routes';

export interface AppProps {
  api: ApiClient;
  browserState: BrowserStateStore;
}

/** Which page shows: the start page, or a mapping in the studio, in edit mode when Create just made it. */
interface Route {
  mapping: string | null;
  editing: boolean;
}

/**
 * The page (ADR-0028), router-free: the start page, or the studio of `?mapping=<id>`. Open in studio and the brand are
 * plain links, so leaving a studio with unsaved changes meets its `beforeunload` question. Create opens the new mapping
 * in the same page, in edit mode on Signature, with a history entry; Back returns to the start page.
 */
export function App({ api, browserState }: AppProps) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [route, setRoute] = useState<Route>(() => ({ mapping: mappingOf(window.location.search), editing: false }));
  useEffect(() => {
    const back = () => setRoute({ mapping: mappingOf(window.location.search), editing: false });
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  const search = window.location.search;
  const created = (id: string) => {
    history.pushState(null, '', studioHref(search, id, 'signature'));
    setRoute({ mapping: id, editing: true });
  };

  return (
    <QueryClientProvider client={queryClient}>
      {route.mapping === null ? (
        <MappingList api={api} studioHref={(id) => studioHref(search, id, 'definition')} listHref={listHref(search)} onCreated={created} />
      ) : (
        <Studio key={route.mapping} mappingId={route.mapping} api={api} browserState={browserState} listHref={listHref(search)} startEditing={route.editing} />
      )}
    </QueryClientProvider>
  );
}
