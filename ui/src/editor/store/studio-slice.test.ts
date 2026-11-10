import { describe, expect, test } from 'vitest';
import type { Diagnostic, StoredMapping } from '../../api/client';
import type { MappingModel } from '../../generated/mapping-model';
import { createWorkingCopyStore, selectUnsaved, STUDIO_TABS, type WorkingCopyPorts } from './working-copy';

const ORDER = 'Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `/${ORDER}/OrderId`;
const structure = {
  bundle: ['../structures/skeleton/order.xsd'] as [string],
  fingerprint: 'sha256:old',
  root: { element: ORDER },
};
const withSides: MappingModel = { formatVersion: 1, source: structure, target: structure };
/** A mapping created from its id alone: neither source nor target yet (ADR-0029). */
const sideless: MappingModel = { formatVersion: 1 };

function store(model: MappingModel = withSides, ports: Partial<WorkingCopyPorts> = {}) {
  const opened: StoredMapping = { model, etag: '"sha256:base"' };
  const never = () => new Promise<never>(() => {});
  return createWorkingCopyStore(opened, {
    newId: (() => {
      let n = 0;
      return () => `id${++n}`;
    })(),
    save: never,
    load: never,
    compile: () => new Promise<Diagnostic[]>(() => {}),
    ...ports,
  });
}

describe('the studio slice of the working-copy store (ADR-0028)', () => {
  test('the studio tabs are Overview, Definition, Test, Signature and Functions, in that order', () => {
    expect(STUDIO_TABS).toEqual(['overview', 'definition', 'test', 'signature', 'functions']);
  });

  test('a mapping opens in view mode on the Overview tab with no target field selected', () => {
    const s = store();

    expect(s.getState().editing).toBe(false);
    expect(s.getState().tab).toBe('overview');
    expect(s.getState().selectedTarget).toBeNull();
  });

  test('setTab, startEditing and selectTarget set their part of the slice and leave the working copy and undo alone', () => {
    const s = store();

    s.getState().setTab('signature');
    s.getState().startEditing();
    s.getState().selectTarget(ORDER_ID);

    expect(s.getState().tab).toBe('signature');
    expect(s.getState().editing).toBe(true);
    expect(s.getState().selectedTarget).toBe(ORDER_ID);
    expect(s.getState().workingCopy).toBe(s.getState().baseline);
    expect(s.getState().past).toEqual([]);
    s.getState().selectTarget(null);
    expect(s.getState().selectedTarget).toBeNull();
  });

  test('discard restores the baseline, clears undo and redo, and returns to view mode', () => {
    const s = store();
    s.getState().startEditing();
    s.getState().link(ORDER_ID, ORDER_ID);
    s.getState().link(`/${ORDER}/Note`, `/${ORDER}/Note`);
    s.getState().undo();
    expect(selectUnsaved(s.getState())).toBe(true);

    s.getState().discard();

    expect(s.getState().workingCopy).toBe(s.getState().baseline);
    expect(s.getState().past).toEqual([]);
    expect(s.getState().future).toEqual([]);
    expect(s.getState().editing).toBe(false);
    expect(selectUnsaved(s.getState())).toBe(false);
  });

  test('discard drops the selection and the last refusal, which named boxes of the dropped working copy', () => {
    const s = store();
    s.getState().startEditing();
    s.getState().link(ORDER_ID, ORDER_ID);
    s.getState().select('id1');
    s.getState().wire(ORDER_ID, 'nope', 'nope', 0);
    expect(s.getState().refusal).not.toBeNull();

    s.getState().discard();

    expect(s.getState().selection).toBeNull();
    expect(s.getState().selected).toEqual([]);
    expect(s.getState().refusal).toBeNull();
  });
});

describe('a mapping with neither source nor target (ADR-0029)', () => {
  test('takes a refresh that names no side without a change and without throwing', () => {
    const s = store(sideless);
    const sent = s.getState().workingCopy;

    const count = s.getState().applyRefresh(sent, { model: { formatVersion: 1 }, diagnostics: [] });

    expect(count).toBeNull();
    expect(s.getState().workingCopy).toBe(sent);
    expect(s.getState().past).toEqual([]);
  });

  test('takes a refresh whose answer has a side the working copy lacks as a change', () => {
    const s = store({ formatVersion: 1, source: structure });
    const sent = s.getState().workingCopy;

    const count = s.getState().applyRefresh(sent, { model: { formatVersion: 1, source: { ...structure, fingerprint: 'sha256:new' } }, diagnostics: [] });

    expect(count).toBe(0);
    expect(s.getState().workingCopy.source?.fingerprint).toBe('sha256:new');
    expect(s.getState().workingCopy.target).toBeUndefined();
  });

  test('saves and takes what the service wrote as the new baseline', async () => {
    const written: MappingModel = { formatVersion: 1, description: 'new' };
    const s = store(sideless, { save: async () => ({ model: written, etag: '"sha256:next"' }) });

    await s.getState().save();

    expect(s.getState().baseline).toBe(written);
    expect(s.getState().etag).toBe('"sha256:next"');
  });
});
