// PROTOTYPE (#10, throwaway): synthetic source and target structures, generated in code.
// Field ids are field paths (ADR-0007). Occurrences are effective occurrences (ADR-0008).
import { mulberry32 } from './ids';
import type { FieldPath } from './types';

export type ValueType = 'xs:string' | 'xs:decimal' | 'xs:integer' | 'xs:date' | 'xs:dateTime' | 'xs:boolean' | 'xs:time';

export type Field = {
  path: FieldPath;
  name: string; // display name: local name, '@' prefix for attributes
  ns: string | null;
  kind: 'element' | 'attribute';
  min: number;
  max: number; // Infinity = unbounded
  type: ValueType | null; // null = structure field
  parent: FieldPath | null;
  children: FieldPath[];
  depth: number;
};

export type Structure = {
  label: string;
  root: FieldPath;
  fields: Map<FieldPath, Field>;
  order: FieldPath[]; // document order: attributes first, then elements
};

export const SRC_NS = 'urn:example:po';
export const TGT_NS = 'urn:example:invoice';
export const SRC_ROOT = `/Q{${SRC_NS}}PurchaseOrder`;
export const TGT_ROOT = `/Q{${TGT_NS}}Invoice`;

export function occurrenceText(f: Pick<Field, 'min' | 'max'>): string {
  return `${f.min}..${f.max === Infinity ? 'n' : f.max}`;
}

/** Short display of a field path: drops the namespace braces, keeps local names. */
export function shortPath(p: FieldPath): string {
  return p.replace(/Q\{[^}]*\}/g, '');
}

type Spec = { n: string; o?: string; t?: ValueType; c?: Spec[] };

function occ(o: string | undefined, attr: boolean): [number, number] {
  const s = o ?? (attr ? '0..1' : '1..1');
  const [a, b] = s.split('..');
  return [Number(a), b === 'n' ? Infinity : Number(b)];
}

function build(label: string, rootStep: string, rootName: string, ns: string, spec: Spec[], filler: (add: (parent: FieldPath, s: Spec) => void, count: () => number, root: FieldPath) => void): Structure {
  const fields = new Map<FieldPath, Field>();
  const root = `/${rootStep}`;
  fields.set(root, { path: root, name: rootName, ns, kind: 'element', min: 1, max: 1, type: null, parent: null, children: [], depth: 0 });
  const add = (parent: FieldPath, s: Spec) => {
    const p = fields.get(parent)!;
    const attr = s.n.startsWith('@');
    const path = `${parent}/${s.n}`;
    const [min, max] = occ(s.o, attr);
    const f: Field = {
      path, name: s.n, ns: null, kind: attr ? 'attribute' : 'element', min, max,
      type: s.c && s.c.length ? null : s.t ?? 'xs:string', parent, children: [], depth: p.depth + 1
    };
    fields.set(path, f);
    // attributes first, then elements in output order (ADR-0008 children(path))
    if (attr) {
      const firstEl = p.children.findIndex((c) => fields.get(c)!.kind === 'element');
      if (firstEl < 0) p.children.push(path); else p.children.splice(firstEl, 0, path);
    } else p.children.push(path);
    for (const c of s.c ?? []) add(path, c);
  };
  for (const s of spec) add(root, s);
  filler(add, () => fields.size, root);
  const order: FieldPath[] = [];
  const walk = (p: FieldPath) => { order.push(p); for (const c of fields.get(p)!.children) walk(c); };
  walk(root);
  return { label, root, fields, order };
}

const SOURCE_SPEC: Spec[] = [
  { n: '@version' },
  { n: 'Header', c: [
    { n: 'OrderNumber' },
    { n: 'OrderDate', t: 'xs:date' },
    { n: 'Currency', o: '0..1' },
    { n: 'BuyerParty', c: [
      { n: '@partyId', o: '1..1' },
      { n: 'Name' },
      { n: 'Address', o: '0..1', c: [{ n: 'Street' }, { n: 'City' }, { n: 'PostalCode', o: '0..1' }, { n: 'CountryCode' }] }
    ] },
    { n: 'SellerParty', c: [{ n: 'Name' }, { n: 'TaxId', o: '0..1' }] },
    { n: 'Note', o: '0..n' },
    { n: 'PaymentTerms', o: '0..1', c: [{ n: 'DaysNet', t: 'xs:integer' }, { n: 'DiscountPercent', o: '0..1', t: 'xs:decimal' }] }
  ] },
  { n: 'Item', o: '1..n', c: [
    { n: '@lineNo', o: '1..1', t: 'xs:integer' },
    { n: 'ProductId' },
    { n: 'Description', o: '0..1' },
    { n: 'Quantity', t: 'xs:decimal' },
    { n: 'UnitPrice', t: 'xs:decimal' },
    { n: 'UnitCode', o: '0..1' },
    { n: 'DeliveryDate', o: '0..1', t: 'xs:date' },
    { n: 'Schedule', o: '0..n', c: [{ n: 'Date', t: 'xs:date' }, { n: 'Quantity', t: 'xs:decimal' }] },
    { n: 'Text', o: '0..n', c: [{ n: '@lang' }, { n: 'Line', o: '1..n' }] }
  ] },
  { n: 'Summary', o: '0..1', c: [{ n: 'TotalAmount', t: 'xs:decimal' }] }
];

const TARGET_SPEC: Spec[] = [
  { n: '@schemaVersion', o: '1..1' },
  { n: 'InvoiceHeader', c: [
    { n: 'InvoiceNumber' },
    { n: 'InvoiceDate', t: 'xs:date' },
    { n: 'TaxPointDate', t: 'xs:date' },
    { n: 'DocumentType' },
    { n: 'CurrencyCode', o: '0..1' },
    { n: 'OrderReference' },
    { n: 'BuyerReference', o: '0..1' },
    { n: 'Buyer', c: [
      { n: '@id', o: '1..1' }, { n: 'Name' }, { n: 'Street', o: '0..1' }, { n: 'City', o: '0..1' }, { n: 'PostalCode', o: '0..1' }, { n: 'Country', o: '0..1' }
    ] },
    { n: 'Seller', c: [{ n: 'Name' }, { n: 'VatId', o: '0..1' }] },
    { n: 'Notes', o: '0..1', c: [{ n: 'Note', o: '1..n' }] },
    { n: 'Comment', o: '0..1' },
    { n: 'PaymentDueDays', o: '0..1', t: 'xs:integer' }
  ] },
  { n: 'InvoiceLine', o: '1..n', c: [
    { n: '@lineId', o: '1..1' },
    { n: 'LineNumber', t: 'xs:integer' },
    { n: 'ArticleNumber' },
    { n: 'ArticleText', o: '0..1' },
    { n: 'InvoicedQuantity', t: 'xs:decimal' },
    { n: 'UnitOfMeasure' },
    { n: 'NetPrice', t: 'xs:decimal' },
    { n: 'LineAmount', t: 'xs:decimal' },
    { n: 'DeliveryDate', o: '0..1', t: 'xs:date' },
    { n: 'FirstScheduleDate', o: '0..1', t: 'xs:date' },
    { n: 'OrderNumberRef', o: '0..n' },
    { n: 'Remark', o: '0..1' },
    { n: 'ScheduleLine', o: '0..n', c: [{ n: 'Date', t: 'xs:date' }, { n: 'Qty', t: 'xs:decimal' }] },
    { n: 'TextLine', o: '0..n', c: [{ n: 'Content' }] }
  ] },
  { n: 'Totals', c: [
    { n: 'LineCount', t: 'xs:integer' },
    { n: 'TotalQuantity', t: 'xs:decimal' },
    { n: 'TotalAmount', t: 'xs:decimal' }
  ] }
];

const TYPES: ValueType[] = ['xs:string', 'xs:string', 'xs:string', 'xs:decimal', 'xs:integer', 'xs:date', 'xs:dateTime', 'xs:boolean', 'xs:time'];
const OCCS = ['0..1', '0..1', '1..1', '0..n', '1..n'];

/** Pads a structure with deep, repeated filler segments until it has `total` fields. */
function filler(seed: number, total: number, top: string) {
  return (add: (parent: FieldPath, s: Spec) => void, count: () => number, root: FieldPath) => {
    const rnd = mulberry32(seed);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    let seg = 0;
    const segment = (): Spec => {
      seg++;
      const id = String(seg).padStart(4, '0');
      const leaves = (k: number, prefix: string): Spec[] =>
        Array.from({ length: k }, (_, i) => ({ n: `${prefix}${i + 1}`, o: pick(OCCS.slice(0, 3)), t: pick(TYPES) }));
      return {
        n: `Seg${id}`, o: pick(OCCS),
        c: [
          { n: '@qualifier', o: '1..1' },
          { n: '@seq', t: 'xs:integer' },
          ...leaves(6, 'Field'),
          { n: 'Detail', o: pick(OCCS), c: [...leaves(4, 'Value'), { n: 'SubDetail', o: pick(OCCS), c: leaves(3, 'Code') }] }
        ]
      };
    };
    let block = 0;
    while (count() < total) {
      block++;
      const blockSpec: Spec = { n: `${top}Block${String(block).padStart(3, '0')}`, o: '0..1', c: [] };
      for (let i = 0; i < 10; i++) blockSpec.c!.push(segment());
      add(root, blockSpec);
    }
  };
}

const cache = new Map<string, Structure>();

export function sourceStructure(total = 5000): Structure {
  const k = `s${total}`;
  if (!cache.has(k)) {
    cache.set(k, build('Source structure', `Q{${SRC_NS}}PurchaseOrder`, 'PurchaseOrder', SRC_NS, SOURCE_SPEC, filler(7, total, 'Ext')));
  }
  return cache.get(k)!;
}

export function targetStructure(total = 1500): Structure {
  const k = `t${total}`;
  if (!cache.has(k)) {
    cache.set(k, build('Target structure', `Q{${TGT_NS}}Invoice`, 'Invoice', TGT_NS, TARGET_SPEC, filler(11, total, 'Add')));
  }
  return cache.get(k)!;
}

/** Proper ancestors of a field, nearest first (ADR-0007: a context is any proper ancestor). */
export function ancestors(s: Structure, p: FieldPath): FieldPath[] {
  const out: FieldPath[] = [];
  let f = s.fields.get(p);
  while (f && f.parent) { out.push(f.parent); f = s.fields.get(f.parent); }
  if (!f && !s.fields.has(p)) {
    // orphaned path: derive textual ancestors
    const parts = p.split('/');
    for (let i = parts.length - 1; i > 1; i--) out.push(parts.slice(0, i).join('/'));
  }
  return out;
}

export function parentPath(p: FieldPath): FieldPath {
  return p.slice(0, p.lastIndexOf('/'));
}
