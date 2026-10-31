import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The dev host (ADR-0013). The editor and its ports arrive with the editor tickets.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>Flottila Mapping</h1>
  </StrictMode>,
);
