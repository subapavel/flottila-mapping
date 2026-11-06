import { useMemo } from 'react';
import { useStore } from 'zustand';
import { canonicalJson } from '../../model/canonical-json';
import type { WorkingCopyStore } from '../store/working-copy';
import './model-json.css';

/**
 * The Model JSON view (spec #135): the working copy in canonical form (ADR-0010), read-only and monospaced, so that the
 * author sees what Save writes. The editor's layout is not in the model, so moving a box does not change the text.
 */
export function ModelJson({ store }: { store: WorkingCopyStore }) {
  const model = useStore(store, (s) => s.workingCopy);
  const text = useMemo(() => canonicalJson(model), [model]);
  return (
    <div className="fm-model-json">
      <p className="fm-model-json__note">Canonical form (sorted keys, 2-space indent), read-only: what Save writes. No layout is stored.</p>
      {/* a scrolling region is focusable, so that the keyboard can scroll it */}
      <pre className="fm-model-json__text" role="region" aria-label="Working copy in canonical form" tabIndex={0}>
        {text}
      </pre>
    </div>
  );
}
