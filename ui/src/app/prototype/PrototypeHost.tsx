/*
 * PROTOTYPE (spec #145, ticket #145, branch prototype/pf-native) — throwaway, never merge to main.
 *
 * "Three PF-native variants of the mapping editor app, switchable via ?variant=A|B|C on the app's own route (/),
 *  with a floating switcher bar." C (SAP PO ESR layout) is the main one; A and B are cheaper alternatives.
 *
 * The data fetching stays here, above the switcher: the workspace's mappings from the running service, plus the
 * mappings the New mapping modal creates, kept in memory (the create call is stubbed). Only the rendering swaps.
 * The open mapping and the page tab are mirrored to ?mapping= and ?tab= so a screen is reload-stable.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, MappingSummary } from '../../api/client';
import type { BrowserStateStore } from '../../editor/browser-state/browser-state';
import type { NewMapping } from './parts';
import { PrototypeSwitcher } from './PrototypeSwitcher';
import '@patternfly/react-styles/css/utilities/Spacing/spacing.css';
import '@patternfly/react-styles/css/utilities/Text/text.css';
import './prototype.css';
import { VariantA } from './VariantA';
import { VariantB } from './VariantB';
import { VariantC } from './VariantC';
import type { PageTab } from './workbench';

export interface VariantProps {
  api: ApiClient;
  browserState: BrowserStateStore;
  /** The workspace's mappings and the ones created in this session, sorted by id; undefined while loading. */
  mappings: MappingSummary[] | undefined;
  loadError: unknown;
  /** Ids created in this session: they open as a stub. */
  created: ReadonlySet<string>;
  open: string | undefined;
  onOpen: (id: string | undefined) => void;
  tab: PageTab;
  onTab: (tab: PageTab) => void;
  onCreate: (m: NewMapping) => void;
}

const VARIANTS = [
  { key: 'C', name: 'SAP PO object browser', Component: VariantC },
  { key: 'A', name: 'Sidebar nav + pages', Component: VariantA },
  { key: 'B', name: 'Horizontal nav, full-bleed', Component: VariantB },
] as const;

export function PrototypeHost({ api, browserState }: { api: ApiClient; browserState: BrowserStateStore }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Host api={api} browserState={browserState} />
    </QueryClientProvider>
  );
}

const readParams = () => new URLSearchParams(window.location.search);

function Host({ api, browserState }: { api: ApiClient; browserState: BrowserStateStore }) {
  const [variant, setVariant] = useState(() => readParams().get('variant') ?? 'C');
  const [open, setOpen] = useState<string | undefined>(() => readParams().get('mapping') ?? undefined);
  const [tab, setTab] = useState<PageTab>(() => (readParams().get('tab') === 'test' ? 'test' : 'editor'));
  const [created, setCreated] = useState<MappingSummary[]>([]);
  const listed = useQuery({ queryKey: ['mappings'], queryFn: () => api.listMappings() });

  useEffect(() => {
    const p = readParams();
    p.set('variant', variant);
    if (open) p.set('mapping', open);
    else p.delete('mapping');
    if (open && tab === 'test') p.set('tab', 'test');
    else p.delete('tab');
    window.history.replaceState(null, '', `?${p.toString().replaceAll('%2F', '/')}`);
  }, [variant, open, tab]);

  const onOpen = useCallback((id: string | undefined) => {
    setOpen(id);
    setTab('editor');
  }, []);
  const onCreate = (m: NewMapping) => {
    const id = `${m.pkg}/${m.name}`;
    setCreated((c) => [...c, { id, name: m.name }]);
    if (m.open) onOpen(id);
  };
  const mappings = listed.data ? [...listed.data, ...created].sort((a, b) => a.id.localeCompare(b.id)) : undefined;
  const current = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];
  const Variant = current.Component;

  return (
    <>
      <Variant
        api={api}
        browserState={browserState}
        mappings={mappings}
        loadError={listed.error}
        created={new Set(created.map((c) => c.id))}
        open={open}
        onOpen={onOpen}
        tab={tab}
        onTab={setTab}
        onCreate={onCreate}
      />
      <PrototypeSwitcher variants={VARIANTS.map(({ key, name }) => ({ key, name }))} current={current.key} onChange={setVariant} />
    </>
  );
}
