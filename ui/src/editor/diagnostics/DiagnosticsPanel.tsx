import { Alert, Button, Label } from '@patternfly/react-core';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Diagnostic } from '../../api/client';
import type { FieldPath } from '../../generated/mapping-model';
import type { WorkingCopyStore } from '../store/working-copy';
import { targetFieldAt, targetFieldOf } from './locations';

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
        <ul aria-label="Working copy diagnostics">
          {diagnostics.map((d, i) => (
            <li key={i}>
              <Label status={d.severity === 'error' ? 'danger' : 'warning'}>{d.severity}</Label> <code>{d.code}</code>{' '}
              <Place store={store} location={d.location} onSelectField={onSelectField} />: {d.message}
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
  switch (location.kind) {
    case 'authoring-id':
      return <FieldLink side="target" field={targetFieldOf(model, location.authoringId)} text={location.authoringId} onSelectField={onSelectField} />;
    case 'pointer':
      return <FieldLink side="target" field={targetFieldAt(location.pointer)} text={location.pointer} onSelectField={onSelectField} />;
    case 'field-path':
      return <FieldLink side={location.side} field={location.fieldPath} text={location.fieldPath} onSelectField={onSelectField} />;
    case 'file-position':
      return <span>{`${location.file}:${location.line}:${location.column}`}</span>;
  }
}

function FieldLink({
  side,
  field,
  text,
  onSelectField,
}: Pick<DiagnosticsPanelProps, 'onSelectField'> & { side: 'source' | 'target'; field: FieldPath | undefined; text: string }) {
  if (field === undefined) return <span>{text}</span>;
  return (
    <Button variant="link" isInline onClick={() => onSelectField(side, field)}>
      {text}
    </Button>
  );
}
