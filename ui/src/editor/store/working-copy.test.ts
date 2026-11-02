import { describe, expect, test } from 'vitest';
import type { MappingModel } from '../../generated/mapping-model';
import { createWorkingCopyStore, selectUnsaved } from './working-copy';

const ORDER = '/Q{urn:flottila:corpus:skeleton}Order';
const ORDER_ID = `${ORDER}/OrderId`;
const NOTE = `${ORDER}/Note`;

const structure = {
  bundle: ['../structures/skeleton/order.xsd'] as [string],
  fingerprint: 'sha256:df1714b8b2e4b09e326626a2ea72780bf6298a0ca733c69f5586ea657e4bd90d',
  root: { element: 'Q{urn:flottila:corpus:skeleton}Order' },
};
const baseline: MappingModel = { formatVersion: 1, source: structure, target: structure };

/** The ids the id port hands out, in order. */
function ids(...values: string[]) {
  return () => {
    const next = values.shift();
    if (next === undefined) throw new Error('the test ran out of ids');
    return next;
  };
}

/** A save port that answers each call when the test resolves or rejects it. */
function deferredSave() {
  const calls: { sent: MappingModel; resolve: (m: MappingModel) => void; reject: (e: Error) => void }[] = [];
  const save = (sent: MappingModel) =>
    new Promise<MappingModel>((resolve, reject) => {
      calls.push({ sent, resolve, reject });
    });
  return { save, calls };
}

/** The canonical model the service writes for the one link: the same content, keys sorted, no context. */
const canonicalLinked: MappingModel = {
  formatVersion: 1,
  source: structure,
  target: structure,
  targetFieldMappings: {
    [ORDER_ID]: { boxes: { b1: { field: ORDER_ID, kind: 'source' } }, id: 'm1', result: 'b1' },
  },
};

describe('the working-copy store', () => {
  test('starts with the working copy equal to the baseline, so nothing is unsaved', () => {
    const store = createWorkingCopyStore(baseline, { newId: ids(), save: deferredSave().save });

    expect(store.getState().workingCopy).toEqual(baseline);
    expect(store.getState().baseline).toEqual(baseline);
    expect(selectUnsaved(store.getState())).toBe(false);
  });

  test('a link runs the link command on the working copy with fresh ids, and the working copy becomes unsaved', () => {
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1'), save: deferredSave().save });

    store.getState().link(ORDER_ID, ORDER_ID);

    expect(store.getState().workingCopy.targetFieldMappings).toEqual({
      [ORDER_ID]: { id: 'm1', result: 'b1', boxes: { b1: { kind: 'source', field: ORDER_ID } } },
    });
    expect(store.getState().baseline).toEqual(baseline);
    expect(store.getState().refusal).toBeNull();
    expect(selectUnsaved(store.getState())).toBe(true);
  });

  test('a refused link leaves the working copy as it was and records the refusal; the next applied link clears it', () => {
    // the second link reuses b1 inside the same target field mapping: a duplicate id
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1', 'b1', 'm2', 'b2', 'm3'), save: deferredSave().save });
    store.getState().link(ORDER_ID, ORDER_ID);
    const linked = store.getState().workingCopy;

    store.getState().link(NOTE, ORDER_ID);

    expect(store.getState().workingCopy).toBe(linked);
    expect(store.getState().refusal).toEqual({ code: 'duplicate-authoring-id', id: 'b1' });

    store.getState().link(NOTE, NOTE);

    expect(store.getState().refusal).toBeNull();
    expect(Object.keys(store.getState().workingCopy.targetFieldMappings ?? {})).toEqual([ORDER_ID, NOTE]);
  });

  test('save sends the working copy, and the canonical response becomes the baseline and the working copy', async () => {
    const port = deferredSave();
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1'), save: port.save });
    store.getState().link(ORDER_ID, ORDER_ID);
    const sent = store.getState().workingCopy;

    const saving = store.getState().save();
    expect(port.calls).toHaveLength(1);
    expect(port.calls[0]!.sent).toBe(sent);
    expect(selectUnsaved(store.getState())).toBe(true);

    port.calls[0]!.resolve(canonicalLinked);
    await saving;

    expect(store.getState().baseline).toBe(canonicalLinked);
    expect(store.getState().workingCopy).toBe(canonicalLinked);
    expect(selectUnsaved(store.getState())).toBe(false);
  });

  test('the canonical response is the baseline even where it differs from what was sent', async () => {
    // the service drops a context equal to the field's parent (ADR-0010 canonical form)
    const withContext: MappingModel = {
      ...baseline,
      targetFieldMappings: {
        [ORDER_ID]: { id: 'm1', result: 'b1', boxes: { b1: { kind: 'source', field: ORDER_ID, context: ORDER } } },
      },
    };
    const port = deferredSave();
    const store = createWorkingCopyStore(withContext, { newId: ids(), save: port.save });

    const saving = store.getState().save();
    port.calls[0]!.resolve(canonicalLinked);
    await saving;

    expect(store.getState().baseline).toEqual(canonicalLinked);
    expect(store.getState().baseline).not.toEqual(withContext);
    expect(selectUnsaved(store.getState())).toBe(false);
  });

  test('an edit made while a save is under way stays in the working copy and is unsaved against the new baseline', async () => {
    const port = deferredSave();
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1', 'b2', 'm2'), save: port.save });
    store.getState().link(ORDER_ID, ORDER_ID);

    const saving = store.getState().save();
    store.getState().link(NOTE, NOTE);
    port.calls[0]!.resolve(canonicalLinked);
    await saving;

    expect(store.getState().baseline).toBe(canonicalLinked);
    expect(store.getState().workingCopy.targetFieldMappings?.[NOTE]).toEqual({
      id: 'm2',
      result: 'b2',
      boxes: { b2: { kind: 'source', field: NOTE } },
    });
    expect(selectUnsaved(store.getState())).toBe(true);
  });

  test('a refused save keeps the baseline and the working copy, stays unsaved and passes the error on', async () => {
    const port = deferredSave();
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1'), save: port.save });
    store.getState().link(ORDER_ID, ORDER_ID);
    const edited = store.getState().workingCopy;

    const saving = store.getState().save();
    port.calls[0]!.reject(new Error('model-refused'));

    await expect(saving).rejects.toThrow('model-refused');
    expect(store.getState().baseline).toBe(baseline);
    expect(store.getState().workingCopy).toBe(edited);
    expect(selectUnsaved(store.getState())).toBe(true);
  });

  test('unsaved compares content, not identity: an edit that the response already holds is saved', async () => {
    const port = deferredSave();
    const store = createWorkingCopyStore(baseline, { newId: ids('b1', 'm1'), save: port.save });

    // the save leaves before the edit, and its response happens to hold the edit already
    const saving = store.getState().save();
    store.getState().link(ORDER_ID, ORDER_ID);
    port.calls[0]!.resolve(structuredClone(canonicalLinked));
    await saving;

    expect(store.getState().workingCopy).not.toBe(store.getState().baseline);
    expect(selectUnsaved(store.getState())).toBe(false);
  });
});
