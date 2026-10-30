// PROTOTYPE (#10, throwaway): everything the editor derives on load and never stores:
// orphaned references (ADR-0010 "Layout and orphans"), design-time errors, chain summaries.
import { CATALOGUE_BY_NAME } from './catalogue';
import { ancestors, shortPath, type Structure } from './structures';
import type { AuthoringId, Box, FieldPath, MappingModel, TargetFieldMapping } from './types';
import { boxInputs } from './types';

export type DesignError = {
  code: 'unconnected-input' | 'unresolved-function' | 'orphaned-reference' | 'unmapped-mandatory' | 'no-result' | 'unknown-udf';
  message: string;
  targetPath: FieldPath;
  fmId?: AuthoringId;
  boxId?: AuthoringId;
};

export function isOrphanedBox(box: Box, src: Structure): boolean {
  if (box.kind !== 'source') return false;
  if (!src.fields.has(box.field)) return true;
  if (box.context && !ancestors(src, box.field).includes(box.context)) return true;
  return false;
}

export function designErrors(model: MappingModel, src: Structure, tgt: Structure): DesignError[] {
  const out: DesignError[] = [];
  for (const [path, fm] of Object.entries(model.targetFieldMappings)) {
    if (!tgt.fields.has(path))
      out.push({ code: 'orphaned-reference', message: `target field ${shortPath(path)} is not in the target structure`, targetPath: path, fmId: fm.id });
    if (!fm.result || !fm.boxes[fm.result])
      out.push({ code: 'no-result', message: 'no box is wired to the target field', targetPath: path, fmId: fm.id });
    for (const [id, box] of Object.entries(fm.boxes)) {
      if (isOrphanedBox(box, src)) {
        const b = box as Extract<Box, { kind: 'source' }>;
        out.push({ code: 'orphaned-reference', message: `source field ${shortPath(b.field)} is not in the source structure`, targetPath: path, fmId: fm.id, boxId: id });
      }
      if (box.kind === 'unresolved')
        out.push({ code: 'unresolved-function', message: `unresolved function ${box.name} (origin ${box.origin})`, targetPath: path, fmId: fm.id, boxId: id });
      if (box.kind === 'udf' && !model.udfs?.[box.udf])
        out.push({ code: 'unknown-udf', message: `UDF ${box.udf} is not declared`, targetPath: path, fmId: fm.id, boxId: id });
      const arity = inputNames(model, box).length;
      const ins = boxInputs(box);
      for (let i = 0; i < arity; i++)
        if (ins[i] == null || !fm.boxes[ins[i]!])
          out.push({ code: 'unconnected-input', message: `input ${i + 1} (${inputNames(model, box)[i]}) of ${boxTitle(box)} is not connected`, targetPath: path, fmId: fm.id, boxId: id });
    }
  }
  for (const p of tgt.order) {
    const f = tgt.fields.get(p)!;
    if (f.type === null || f.min === 0 || model.targetFieldMappings[p]) continue;
    // only when every ancestor is created (mapped or mandatory)
    let created = true;
    for (const a of ancestors(tgt, p)) {
      const af = tgt.fields.get(a)!;
      if (!(model.targetFieldMappings[a] || af.min > 0)) { created = false; break; }
    }
    if (created) out.push({ code: 'unmapped-mandatory', message: `mandatory target leaf ${shortPath(p)} (${f.min}..) has no mapping`, targetPath: p });
  }
  return out;
}

export function inputNames(model: MappingModel, box: Box): string[] {
  if (box.kind === 'function') return CATALOGUE_BY_NAME[box.fn]?.inputs ?? (box.inputs ?? []).map((_, i) => `in${i + 1}`);
  if (box.kind === 'udf') return model.udfs?.[box.udf]?.inputs ?? [];
  if (box.kind === 'unresolved') return (box.inputs ?? []).map((_, i) => `in${i + 1}`);
  return [];
}

export function boxTitle(box: Box): string {
  switch (box.kind) {
    case 'source': return shortPath(box.field).split('/').pop()!;
    case 'function': return box.fn === 'constant' ? `constant "${box.params?.value ?? ''}"` : box.fn;
    case 'udf': return `${box.udf} (UDF)`;
    case 'unresolved': return `${box.name} ?`;
  }
}

function paramText(params: Record<string, unknown> | undefined): string {
  if (!params) return '';
  return Object.keys(params).sort().map((k) => {
    const v = params[k];
    return typeof v === 'string' ? `${k}="${v}"` : `${k}={${Object.keys(v as object).length} rows}`;
  }).join(', ');
}

/** Inline function chain, e.g. formatDate(removeContexts(/PO/Item/Date), pattern="yyyyMMdd"). */
export function chainText(fm: TargetFieldMapping, id: AuthoringId | null = fm.result, seen = new Set<string>()): string {
  if (!id) return '∅';
  const box = fm.boxes[id];
  if (!box) return '∅';
  if (box.kind === 'source') {
    const ctx = box.context ? ` @ctx ${shortPath(box.context).split('/').pop()}` : '';
    return shortPath(box.field) + ctx;
  }
  if (box.kind === 'function' && box.fn === 'constant') return `"${box.params?.value ?? ''}"`;
  const name = box.kind === 'function' ? box.fn : box.kind === 'udf' ? box.udf : `${box.name}?`;
  const fanout = seen.has(id);
  seen.add(id);
  if (fanout) return `↺${name}`;
  const args = (box.inputs ?? []).map((i) => (i ? chainText(fm, i, seen) : '∅'));
  const p = paramText(box.params as Record<string, unknown> | undefined);
  return `${name}(${[...args, ...(p ? [p] : [])].join(', ')})`;
}

export type FieldStatus = 'mapped' | 'unmapped' | 'unmapped mandatory' | 'orphaned' | 'error' | 'auto';

export function targetStatus(path: FieldPath, model: MappingModel, tgt: Structure, errorsByPath: Map<FieldPath, DesignError[]>): FieldStatus {
  const errs = errorsByPath.get(path) ?? [];
  if (errs.some((e) => e.code === 'orphaned-reference')) return 'orphaned';
  if (errs.some((e) => e.code === 'unmapped-mandatory')) return 'unmapped mandatory';
  if (errs.length) return 'error';
  if (model.targetFieldMappings[path]) return 'mapped';
  const f = tgt.fields.get(path);
  if (f && f.type === null && f.min > 0 && f.min === f.max) return 'auto';
  return 'unmapped';
}

export function groupErrors(errs: DesignError[]): Map<FieldPath, DesignError[]> {
  const m = new Map<FieldPath, DesignError[]>();
  for (const e of errs) { if (!m.has(e.targetPath)) m.set(e.targetPath, []); m.get(e.targetPath)!.push(e); }
  return m;
}

export function usedSourceFields(model: MappingModel): Set<FieldPath> {
  const s = new Set<FieldPath>();
  for (const fm of Object.values(model.targetFieldMappings))
    for (const b of Object.values(fm.boxes)) if (b.kind === 'source') s.add(b.field);
  return s;
}

export function findBox(model: MappingModel, id: AuthoringId): { path: FieldPath; fm: TargetFieldMapping; box: Box } | null {
  for (const [path, fm] of Object.entries(model.targetFieldMappings)) if (fm.boxes[id]) return { path, fm, box: fm.boxes[id] };
  return null;
}
