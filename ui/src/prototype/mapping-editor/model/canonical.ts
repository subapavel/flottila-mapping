// PROTOTYPE (#10, throwaway): canonical writer, ADR-0010 "Canonical form" (roughly).
// Sorted keys by UTF-16 code unit, 2-space indent, empty objects/arrays left out, final LF.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortAndPrune(value), null, 2) + '\n';
}

function sortAndPrune(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortAndPrune);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    // default Array.prototype.sort compares UTF-16 code units
    for (const k of Object.keys(v as object).sort()) {
      const x = sortAndPrune((v as Record<string, unknown>)[k]);
      if (x === undefined) continue;
      if (Array.isArray(x) && x.length === 0) continue;
      if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === 0) continue;
      out[k] = x;
    }
    return out;
  }
  return v;
}
