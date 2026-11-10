import '@patternfly/react-core/dist/styles/base.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApiClient } from '../api/client';
import { httpApiClient } from '../api/http-api';
import { storageBrowserState } from '../editor';
import { Page } from './Page';

// The page (ADR-0028): the start page, or the Mapping studio of ?mapping=<id>; ?api=fake runs on the fake ApiClient.
// ?host=dev keeps the dev host of ADR-0013 (?mapping=<id>&field=<path>) with the old editor until the studio's tabs
// replace it (spec #152); DevHost.tsx is loaded only then, so its app.css (body 13px) never reaches the studio.
const params = new URLSearchParams(window.location.search);
const api: Promise<ApiClient> =
  params.get('api') === 'fake'
    ? import('../api/fake/fake-api').then((fake) => fake.fakeApiClient())
    : Promise.resolve(httpApiClient());
const browserState = storageBrowserState(window.localStorage);

async function page(client: ApiClient): Promise<ReactNode> {
  if (params.get('host') !== 'dev') return <Page api={client} browserState={browserState} />;
  const { DevHost } = await import('./DevHost');
  const mapping = params.get('mapping');
  const start = mapping === null ? undefined : { mapping, field: params.get('field') ?? undefined };
  return <DevHost api={client} browserState={browserState} start={start} />;
}

void api.then(page).then((content) =>
  createRoot(document.getElementById('root')!).render(<StrictMode>{content}</StrictMode>),
);
