// PROTOTYPE (#10, throwaway): entry of the prototype-mapping-editor page.
import '@patternfly/react-core/dist/styles/base.css';
import '@xyflow/react/dist/style.css';
import './prototype.css';
import './prototype-round2.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PrototypeMappingEditor } from './PrototypeMappingEditor';
import { installMeasureHooks } from './measureHooks';

installMeasureHooks();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrototypeMappingEditor />
  </StrictMode>
);
