// PROTOTYPE (#10, throwaway): AuthoringId generation (ADR-0010: 10 lowercase Crockford base32).
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

export function newAuthoringId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += CROCKFORD[b & 31];
  return s;
}

/** Deterministic ids for the synthetic sample only (so screenshots and URLs are stable). */
export function seededIdFactory(seed: number): () => string {
  let x = seed >>> 0;
  return () => {
    let s = '';
    for (let i = 0; i < 10; i++) {
      x = (Math.imul(x ^ (x >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      x ^= x >>> 13;
      s += CROCKFORD[x & 31];
    }
    return s;
  };
}

/** Seeded PRNG (mulberry32) for the structure generator. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
