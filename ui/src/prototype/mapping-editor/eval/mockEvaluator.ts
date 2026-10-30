// PROTOTYPE (#10, throwaway): a MOCK evaluator. Semantics are only roughly PO's (ADR-0006 Lift,
// ADR-0008 structure-field queues); the point is to make contexts, context changes, empty
// contexts and SUPPRESS visible in the display queue. Not the engine.
import { CATALOGUE_BY_NAME } from '../model/catalogue';
import { designErrors, isOrphanedBox, type DesignError } from '../model/derive';
import { parentPath, type Structure } from '../model/structures';
import type { AuthoringId, Box, FieldPath, MappingModel } from '../model/types';

export const SUPPRESS: unique symbol = Symbol('SUPPRESS');
export type Slot = string | typeof SUPPRESS;
export type Queue = Slot[][]; // array of contexts, each an array of slots
export type Evaluated = { queue: Queue; generating: boolean };

export type RunError = { code: string; message: string; targetPath?: FieldPath; boxId?: AuthoringId };
export type RunResult = {
  boxQueues: Map<AuthoringId, Evaluated>;
  sourceQueue: (field: FieldPath, context?: FieldPath) => Queue;
  output: string;
  errors: (DesignError | RunError)[];
  ms: number;
};

type Step = { attr: boolean; ns: string | null; local: string };
function steps(path: FieldPath): Step[] {
  const out: Step[] = [];
  const re = /\/(@?)(?:Q\{([^}]*)\})?([^/]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) out.push({ attr: m[1] === '@', ns: m[2] ?? null, local: m[3] });
  return out;
}

type N = Element | Attr;
function select(nodes: N[], st: Step[]): N[] {
  let cur = nodes;
  for (const s of st) {
    const next: N[] = [];
    for (const n of cur) {
      if (!(n instanceof Element)) continue;
      if (s.attr) {
        const a = n.getAttributeNodeNS(s.ns, s.local);
        if (a) next.push(a);
      } else for (const c of Array.from(n.children)) if (c.localName === s.local && (c.namespaceURI ?? null) === s.ns) next.push(c);
    }
    cur = next;
  }
  return cur;
}

const flat = (q: Queue) => q.flat();
const scalar = (e: Evaluated): Slot => e.queue[0]?.[0] ?? '';
const num = (s: Slot) => (s === SUPPRESS ? 0 : Number(s));

function lift(inputs: Evaluated[], f: (v: string[]) => Slot): Evaluated {
  const qs = inputs.filter((i) => !i.generating);
  if (qs.length === 0) {
    const v = inputs.map(scalar);
    return { queue: [[v.includes(SUPPRESS) ? SUPPRESS : f(v as string[])]], generating: true };
  }
  const n = Math.max(...qs.map((q) => q.queue.length));
  const out: Queue = [];
  for (let c = 0; c < n; c++) {
    const ctxs = inputs.map((i) => (i.generating ? null : i.queue[c]));
    if (ctxs.some((x, k) => !inputs[k].generating && (!x || x.length === 0))) { out.push([]); continue; }
    const len = Math.max(...ctxs.map((x) => (x ? x.length : 0)));
    const ctx: Slot[] = [];
    for (let j = 0; j < len; j++) {
      const v = inputs.map((i, k) => (i.generating ? scalar(i) : ctxs[k]![Math.min(j, ctxs[k]!.length - 1)]));
      ctx.push(v.includes(SUPPRESS) ? SUPPRESS : f(v as string[]));
    }
    out.push(ctx);
  }
  return { queue: out, generating: false };
}

function perContext(e: Evaluated, f: (ctx: Slot[]) => Slot[]): Evaluated {
  return { queue: e.queue.map(f), generating: false };
}

function formatDate(v: string, inP: string, outP: string): string {
  const get = (tok: string) => { const i = inP.indexOf(tok); return i < 0 ? '' : v.slice(i, i + tok.length); };
  const y = get('yyyy'), M = get('MM'), d = get('dd');
  if (!y || !M || !d) return v;
  return outP.replace('yyyy', y).replace('MM', M).replace('dd', d);
}

function callFunction(fn: string, ins: Evaluated[], params: Record<string, unknown>): Evaluated {
  const p = (k: string) => (params[k] as string | undefined) ?? CATALOGUE_BY_NAME[fn]?.params.find((x) => x.name === k)?.default ?? '';
  switch (fn) {
    case 'constant': return { queue: [[String(params.value ?? '')]], generating: true };
    case 'concat': return lift(ins, (v) => v.join(p('delimiter')));
    case 'toUpperCase': return lift(ins, (v) => v[0].toUpperCase());
    case 'equalsS': return lift(ins, (v) => String(v[0] === v[1]));
    case 'if': return lift(ins, (v) => (v[0] === 'true' ? v[1] : v[2]));
    case 'multiply': return lift(ins, (v) => String(Math.round(Number(v[0]) * Number(v[1]) * 10000) / 10000));
    case 'formatDate': return lift(ins, (v) => formatDate(v[0], p('inputPattern'), p('outputPattern')));
    case 'FixValues': {
      const table = (params.table ?? {}) as Record<string, string>;
      return lift(ins, (v) => table[v[0]] ?? (p('behaviour') === 'useKey' ? v[0] : ''));
    }
    case 'ifWithoutElse': return lift(ins, (v) => (v[0] === 'true' ? v[1] : SUPPRESS));
    case 'createIf': return lift(ins, (v) => (v[0] === 'true' ? '' : SUPPRESS));
    case 'mapWithDefault': return perContext(ins[0], (c) => (c.length ? c : [p('default')]));
    case 'exists': return perContext(ins[0], (c) => [String(c.some((s) => s !== SUPPRESS))]);
    case 'count': return perContext(ins[0], (c) => [String(c.filter((s) => s !== SUPPRESS).length)]);
    case 'sum': return perContext(ins[0], (c) => [String(Math.round(c.reduce<number>((a, s) => a + num(s), 0) * 10000) / 10000)]);
    case 'removeContexts': return { queue: [flat(ins[0].queue).filter((s) => s !== SUPPRESS)], generating: false };
    case 'collapseContexts': return { queue: [ins[0].queue.map((c) => c.find((s) => s !== SUPPRESS) ?? '')], generating: false };
    case 'splitByValue': {
      const mode = p('mode');
      const vals = flat(ins[0].queue);
      if (mode === 'eachValue') return { queue: vals.map((v) => [v]), generating: false };
      const out: Queue = [[]];
      vals.forEach((v, i) => {
        if (mode === 'valueChange' && i > 0 && v !== vals[i - 1]) out.push([]);
        out[out.length - 1].push(v);
        if (mode === 'emptyValue' && v === '') out.push([]);
      });
      return { queue: out, generating: false };
    }
    case 'useOneAsMany': {
      const va = flat(ins[0].queue).filter((s) => s !== SUPPRESS);
      const rep: Slot[] = [];
      ins[1].queue.forEach((c, k) => { for (let j = 0; j < c.length; j++) rep.push(va[Math.min(k, va.length - 1)] ?? ''); });
      const out: Queue = [];
      let i = 0;
      for (const c of ins[2].queue) { out.push(rep.slice(i, i + c.length)); i += c.length; }
      return { queue: out, generating: false };
    }
  }
  return { queue: [], generating: false };
}

function udf(name: string, ins: Evaluated[]): Evaluated {
  if (name === 'normaliseCountry') {
    const m: Record<string, string> = { deu: 'DE', de: 'DE', usa: 'US', us: 'US' };
    return lift(ins, (v) => m[v[0].toLowerCase()] ?? v[0].toUpperCase());
  }
  return { queue: [], generating: false };
}

export function runMapping(model: MappingModel, src: Structure, tgt: Structure, inputXml: string): RunResult {
  const t0 = performance.now();
  const errors: (DesignError | RunError)[] = [...designErrors(model, src, tgt)];
  const doc = new DOMParser().parseFromString(inputXml, 'application/xml');
  const perr = doc.getElementsByTagName('parsererror')[0];
  if (perr) errors.push({ code: 'input-not-well-formed', message: perr.textContent?.slice(0, 200) ?? 'parse error' });
  const rootEl = perr ? null : doc.documentElement;

  const srcCache = new Map<string, Queue>();
  const sourceQueue = (field: FieldPath, context: FieldPath = parentPath(field)): Queue => {
    const k = `${field}|${context}`;
    if (srcCache.has(k)) return srcCache.get(k)!;
    let q: Queue = [];
    if (rootEl) {
      const all = steps(field);
      const cs = steps(context);
      const ctxNodes = cs.length === 0 ? [] : select([rootEl], cs.slice(1));
      const rootMatches = rootEl.localName === all[0]?.local && (rootEl.namespaceURI ?? null) === all[0]?.ns;
      if (rootMatches) {
        const contexts = cs.length === 1 ? [rootEl] : ctxNodes;
        const isLeaf = src.fields.get(field)?.type != null;
        q = contexts.map((c) => select([c], all.slice(cs.length)).map((n) => (n instanceof Attr ? n.value : isLeaf ? (n.textContent ?? '') : '')));
      }
    }
    srcCache.set(k, q);
    return q;
  };

  const boxQueues = new Map<AuthoringId, Evaluated>();
  const EMPTY: Evaluated = { queue: [], generating: false };
  const evalBox = (boxes: Record<AuthoringId, Box>, id: AuthoringId | null | undefined, stack: Set<string>): Evaluated => {
    if (!id || !boxes[id]) return EMPTY;
    if (boxQueues.has(id)) return boxQueues.get(id)!;
    if (stack.has(id)) { errors.push({ code: 'cycle', message: 'cycle in function graph', boxId: id }); return EMPTY; }
    stack.add(id);
    const box = boxes[id];
    let r: Evaluated = EMPTY;
    if (box.kind === 'source') r = isOrphanedBox(box, src) ? EMPTY : { queue: sourceQueue(box.field, box.context), generating: false };
    else {
      const ins = (box.inputs ?? []).map((i) => evalBox(boxes, i, stack));
      if (box.kind === 'function') r = callFunction(box.fn, ins, box.params ?? {});
      else if (box.kind === 'udf') r = udf(box.udf, ins);
      else r = EMPTY; // unresolved: design-time error, no value
    }
    stack.delete(id);
    boxQueues.set(id, r);
    return r;
  };
  for (const fm of Object.values(model.targetFieldMappings))
    for (const id of Object.keys(fm.boxes)) evalBox(fm.boxes, id, new Set());
  // Boxes that cannot have a value show "no value" in the display queue, not an empty queue.
  for (const fm of Object.values(model.targetFieldMappings))
    for (const [id, b] of Object.entries(fm.boxes)) if (b.kind === 'unresolved' || isOrphanedBox(b, src)) boxQueues.delete(id);

  // Target side: TargetSlots / TargetRepeat, roughly (ADR-0006 "Target fields").
  type XNode = { name: string; attrs: [string, string][]; kids: XNode[]; text: string | null };
  const produce = (path: FieldPath, p: number): { value: string | null; childP: number }[] => {
    const f = tgt.fields.get(path)!;
    const fm = model.targetFieldMappings[path];
    if (!fm) {
      if (f.type === null && f.min > 0 && f.min === f.max) return Array.from({ length: f.min }, () => ({ value: null, childP: p }));
      return [];
    }
    const ev = boxQueues.get(fm.result ?? '') ?? EMPTY;
    const occ: { value: string | null; childP: number }[] = [];
    if (ev.generating) {
      const copies = Math.max(1, f.min);
      for (let j = 1; j <= copies; j++) { const v = scalar(ev); if (v !== SUPPRESS) occ.push({ value: f.type ? v : null, childP: (p - 1) * copies + j }); }
    } else {
      const ctx = ev.queue[p - 1] ?? [];
      let offset = 0;
      for (let c = 0; c < p - 1; c++) offset += ev.queue[c]?.length ?? 0;
      ctx.forEach((s, j) => {
        if (s === SUPPRESS || occ.length >= f.max) return;
        occ.push({ value: f.type ? s : null, childP: offset + j + 1 });
      });
    }
    if (occ.length < f.min)
      errors.push({ code: 'po:MINOCCURS', message: `${f.name}: ${occ.length} created, minOccurs ${f.min} (parent slot ${p})`, targetPath: path, boxId: fm.result ?? undefined });
    return occ;
  };
  const build = (path: FieldPath, p: number): XNode[] => {
    const f = tgt.fields.get(path)!;
    return produce(path, p).map((o) => {
      const n: XNode = { name: f.name, attrs: [], kids: [], text: o.value };
      for (const c of f.children) {
        const cf = tgt.fields.get(c)!;
        if (cf.kind === 'attribute') { const a = produce(c, o.childP)[0]; if (a) n.attrs.push([cf.name.slice(1), a.value ?? '']); }
        else n.kids.push(...build(c, o.childP));
      }
      return n;
    });
  };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const ser = (n: XNode, ind: string, root: boolean): string => {
    const name = root ? `inv:${n.name}` : n.name;
    const a = (root ? ` xmlns:inv="${tgt.fields.get(tgt.root)!.ns}"` : '') + n.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    if (n.kids.length === 0) return `${ind}<${name}${a}${n.text ? `>${esc(n.text)}</${name}>` : '/>'}`;
    return `${ind}<${name}${a}>\n${n.kids.map((k) => ser(k, ind + '  ', false)).join('\n')}\n${ind}</${name}>`;
  };
  const out = rootEl ? build(tgt.root, 1).map((n) => ser(n, '', true)).join('\n') : '';
  return { boxQueues, sourceQueue, output: out, errors, ms: performance.now() - t0 };
}
