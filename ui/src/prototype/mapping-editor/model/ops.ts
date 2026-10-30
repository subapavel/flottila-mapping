// PROTOTYPE (#10, throwaway): pure edits of the mapping model. Every edit returns a new model;
// no edit touches layout.
import { CATALOGUE_BY_NAME } from './catalogue';
import { newAuthoringId } from './ids';
import type { AuthoringId, Box, FieldPath, MappingModel, ParamValue } from './types';

const clone = (m: MappingModel): MappingModel => structuredClone(m);

export function ensureFm(m: MappingModel, path: FieldPath): MappingModel {
  if (m.targetFieldMappings[path]) return m;
  const n = clone(m);
  n.targetFieldMappings[path] = { id: newAuthoringId(), result: null, boxes: {} };
  return n;
}

export function functionBox(fn: string): Box {
  const c = CATALOGUE_BY_NAME[fn];
  const params: Record<string, ParamValue> = {};
  for (const p of c?.params ?? []) params[p.name] = p.type === 'table' ? {} : p.default;
  const inputs = (c?.inputs ?? []).map(() => null);
  return { kind: 'function', fn, ...(inputs.length ? { inputs } : {}), ...(Object.keys(params).length ? { params } : {}) };
}

export function addBox(m: MappingModel, path: FieldPath, box: Box, id: AuthoringId = newAuthoringId()): [MappingModel, AuthoringId] {
  const n = clone(ensureFm(m, path));
  n.targetFieldMappings[path].boxes[id] = box;
  return [n, id];
}

export function removeBoxes(m: MappingModel, path: FieldPath, ids: AuthoringId[]): MappingModel {
  const n = clone(m);
  const fm = n.targetFieldMappings[path];
  if (!fm) return m;
  for (const id of ids) delete fm.boxes[id];
  for (const b of Object.values(fm.boxes)) if (b.kind !== 'source' && b.inputs) b.inputs = b.inputs.map((i) => (i && ids.includes(i) ? null : i));
  if (fm.result && ids.includes(fm.result)) fm.result = null;
  if (Object.keys(fm.boxes).length === 0) delete n.targetFieldMappings[path];
  return n;
}

/** Wire `source`'s output to input `index` of `target` (or to the target field itself). */
export function connect(m: MappingModel, path: FieldPath, source: AuthoringId, target: AuthoringId | 'target', index: number): MappingModel {
  const n = clone(m);
  const fm = n.targetFieldMappings[path];
  if (target === 'target') { fm.result = source; return n; }
  const b = fm.boxes[target];
  if (b.kind === 'source') return m;
  const ins = [...(b.inputs ?? [])];
  while (ins.length <= index) ins.push(null);
  ins[index] = source;
  b.inputs = ins;
  return n;
}

export function disconnect(m: MappingModel, path: FieldPath, target: AuthoringId | 'target', index: number): MappingModel {
  const n = clone(m);
  const fm = n.targetFieldMappings[path];
  if (target === 'target') { fm.result = null; return n; }
  const b = fm.boxes[target];
  if (b.kind !== 'source' && b.inputs) b.inputs[index] = null;
  return n;
}

export function setParam(m: MappingModel, path: FieldPath, id: AuthoringId, name: string, value: ParamValue): MappingModel {
  const n = clone(m);
  const b = n.targetFieldMappings[path].boxes[id];
  if (b.kind === 'source') return m;
  b.params = { ...(b.params ?? {}), [name]: value };
  return n;
}

export function setContext(m: MappingModel, path: FieldPath, id: AuthoringId, context: FieldPath | undefined, parent: FieldPath): MappingModel {
  const n = clone(m);
  const b = n.targetFieldMappings[path].boxes[id];
  if (b.kind !== 'source') return m;
  // canonical form: a context equal to the parent is left out
  if (!context || context === parent) delete b.context; else b.context = context;
  return n;
}

export type Fragment = { boxes: Record<AuthoringId, Box> };

export function copyFragment(m: MappingModel, path: FieldPath, ids: AuthoringId[]): Fragment {
  const fm = m.targetFieldMappings[path];
  const boxes: Record<AuthoringId, Box> = {};
  for (const id of ids) if (fm?.boxes[id]) boxes[id] = structuredClone(fm.boxes[id]);
  return { boxes };
}

/** ADR-0010: paste gives fresh ids; references that leave the pasted fragment become null. */
export function freshIds(f: Fragment): Record<AuthoringId, AuthoringId> {
  return Object.fromEntries(Object.keys(f.boxes).map((old) => [old, newAuthoringId()]));
}

export function pasteFragment(m: MappingModel, path: FieldPath, f: Fragment, map: Record<AuthoringId, AuthoringId> = freshIds(f)): [MappingModel, Record<AuthoringId, AuthoringId>] {
  const n = clone(ensureFm(m, path));
  for (const [old, box] of Object.entries(f.boxes)) {
    const b = structuredClone(box);
    if (b.kind !== 'source' && b.inputs) b.inputs = b.inputs.map((i) => (i && map[i] ? map[i] : null));
    n.targetFieldMappings[path].boxes[map[old]] = b;
  }
  return [n, map];
}
