import '@patternfly/react-core/dist/styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApiClient } from '../api/client';
import { httpApiClient } from '../api/http-api';
import { storageBrowserState } from '../editor/browser-state/browser-state';

// The dev host (ADR-0013): it reads ?mapping=<id>&field=<path>&api=fake once and writes nothing to the URL.
const params = new URLSearchParams(window.location.search);
const mapping = params.get('mapping');
const start = mapping === null ? undefined : { mapping, field: params.get('field') ?? undefined };
const api: Promise<ApiClient> =
  params.get('api') === 'fake'
    ? import('../api/fake/fake-api').then((fake) => fake.fakeApiClient())
    : Promise.resolve(httpApiClient());

// PROTOTYPE (#145): ?variant= mounts the PF-native prototype instead of the dev host. Both are dynamic imports, so the
// prototype route never loads DevHost's app.css or MappingEditor's editor.css (the 13 px density).
const root = createRoot(document.getElementById('root')!);
if (params.has('variant')) {
  void Promise.all([api, import('./prototype/PrototypeHost')]).then(([client, { PrototypeHost }]) =>
    root.render(
      <StrictMode>
        <PrototypeHost api={client} browserState={storageBrowserState(window.localStorage)} />
      </StrictMode>,
    ),
  );
} else {
  void Promise.all([api, import('./DevHost')]).then(([client, { DevHost }]) =>
    root.render(
      <StrictMode>
        <DevHost api={client} browserState={storageBrowserState(window.localStorage)} start={start} />
      </StrictMode>,
    ),
  );
}
