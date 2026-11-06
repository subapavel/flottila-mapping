import '@patternfly/react-core/dist/styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApiClient } from '../api/client';
import { httpApiClient } from '../api/http-api';
import { storageBrowserState } from '../editor';
import { DevHost } from './DevHost';

// The dev host (ADR-0013): it reads ?mapping=<id>&api=fake once and writes nothing to the URL.
const params = new URLSearchParams(window.location.search);
const api: Promise<ApiClient> =
  params.get('api') === 'fake'
    ? import('../api/fake/fake-api').then((fake) => fake.fakeApiClient())
    : Promise.resolve(httpApiClient());

void api.then((client) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <h1>Flottila Mapping</h1>
      <DevHost api={client} browserState={storageBrowserState(window.localStorage)} initialMapping={params.get('mapping') ?? undefined} />
    </StrictMode>,
  ),
);
