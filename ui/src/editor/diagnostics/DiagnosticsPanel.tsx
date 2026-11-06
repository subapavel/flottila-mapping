import { Alert, Button, Label } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Diagnostic } from '../../api/client';
import type { FieldPath } from '../../generated/mapping-model';
import { localPath, proseSegments } from '../../model/field-path';
import { locate, targetFieldOf } from '../store/locations';
import type { WorkingCopyStore } from '../store/working-copy';
import './diagnostics-list.css';

export interface DiagnosticsPanelProps {
  store: WorkingCopyStore;
  /** Leads to a field's row in the structure overview. */
  onSelectField: (side: 'source' | 'target', fieldPath: FieldPath) => void;
}

/**
 * The Diagnostics panel (GLOSSARY): the latest diagnostics of the working copy, from compile or a refused save, each
 * with its severity, code and message, and a link to the field it names (ADR-0015).
 */
export function DiagnosticsPanel({ store, onSelectField }: DiagnosticsPanelProps) {
  const diagnostics = useStore(store, (s) => s.diagnostics);
  const compileFailure = useStore(store, (s) => s.compileFailure);

  return (
    <section aria-label="Diagnostics panel">
      {compileFailure !== null && (
        <Alert variant="warning" isInline title="The working copy could not be compiled">
          {compileFailure}
        </Alert>
      )}
      {diagnostics.length === 0 ? (
        <p>No diagnostics</p>
      ) : (
        <ul className="fm-diagnostics" aria-label="Working copy diagnostics">
          {diagnostics.map((d, i) => (
            <li key={i} className={`fm-diagnostic fm-diagnostic--${d.severity}`}>
              <Label status={d.severity === 'error' ? 'danger' : 'warning'}>{d.severity}</Label>{' '}
              <code className="fm-diagnostic__code">{d.code}</code>{' '}
              <span className="fm-diagnostic__location">
                <Place store={store} location={d.location} onSelectField={onSelectField} />
                <span className="fm-diagnostic__colon">: </span>
              </span>
              <span className="fm-diagnostic__message">
                {proseSegments(d.message).map((s, j) =>
                  s.path === undefined ? (
                    s.text
                  ) : (
                    <span key={j} className="fm-diagnostic__path" title={s.path}>
                      {s.text}
                    </span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Where a diagnostic points: a link to the field it leads to, or its text. */
function Place({
  store,
  location,
  onSelectField,
}: Pick<DiagnosticsPanelProps, 'store' | 'onSelectField'> & { location: Diagnostic['location'] }): ReactNode {
  const model = useStore(store, (s) => s.workingCopy);
  const target = targetFieldOf(location, (id) => locate(model, id)?.field);
  switch (location.kind) {
    case 'authoring-id':
      // it also becomes the store's selection: a box id selects the box on the canvas, a mapping id no box
      return (
        <FieldLink
          side="target"
          field={target}
          text={location.authoringId}
          onSelectField={(side, field) => {
            onSelectField(side, field);
            store.getState().select(location.authoringId);
          }}
        />
      );
    case 'pointer': {
      // a pointer into a target field mapping shows that field's local path, and what the pointer says below it
      if (target === undefined) return <FieldLink side="target" field={target} text={location.pointer} onSelectField={onSelectField} />;
      const below = location.pointer.split('/').slice(3).join('/');
      const text = localPath(target) + (below === '' ? '' : `/${below}`);
      return <FieldLink side="target" field={target} text={text} title={location.pointer} onSelectField={onSelectField} />;
    }
    case 'field-path':
      return (
        <FieldLink
          side={location.side}
          field={location.fieldPath}
          text={localPath(location.fieldPath)}
          title={location.fieldPath}
          onSelectField={onSelectField}
        />
      );
    case 'file-position':
      return <span>{`${location.file}:${location.line}:${location.column}`}</span>;
  }
}

function FieldLink({
  side,
  field,
  text,
  title,
  onSelectField,
}: Pick<DiagnosticsPanelProps, 'onSelectField'> & {
  side: 'source' | 'target';
  field: FieldPath | undefined;
  text: string;
  /** The full text of a location shown shortened. */
  title?: string;
}) {
  if (field === undefined) return <span>{text}</span>;
  return (
    <Button variant="link" isInline title={title} onClick={() => onSelectField(side, field)}>
      {text}
    </Button>
  );
}
