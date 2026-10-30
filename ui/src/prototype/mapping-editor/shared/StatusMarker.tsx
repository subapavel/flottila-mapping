// PROTOTYPE (#10, throwaway): mapped-field marker for target trees and tables.
import { useCallback } from 'react';
import { targetStatus } from '../model/derive';
import type { FieldPath } from '../model/types';
import { useEditor } from './editorState';

const GLYPH: Record<string, string> = {
  mapped: '●', 'unmapped mandatory': '!', orphaned: '⚠', error: '✖', auto: '○', unmapped: ''
};

export function useStatus() {
  const { model, tgt, errorsByPath } = useEditor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useCallback((p: FieldPath) => targetStatus(p, model, tgt, errorsByPath as any), [model, tgt, errorsByPath]);
}

export function StatusMarker({ path }: { path: FieldPath }) {
  const status = useStatus()(path);
  if (status === 'unmapped') return null;
  return <span className={`mk st--${status.replace(/ /g, '-')}`} title={status}>{GLYPH[status]}</span>;
}
