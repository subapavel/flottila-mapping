import type { FunctionCatalogue } from '../../api/client';

type CatalogueEntry = FunctionCatalogue[string];

/** A mark of a palette entry (ADR-0026): an assumed reading, a deviation with its text, an export that needs Flottila. */
export type Badge = { kind: 'assumed' } | { kind: 'deviation'; text: string } | { kind: 'not-portable' };

export interface PaletteEntry {
  fn: string;
  badges: Badge[];
}

export interface PaletteGroup {
  family: string;
  entries: PaletteEntry[];
}

/** The fidelity badge, if the function is not exact, then "not portable" if its export is not portable. */
export function badges(entry: CatalogueEntry): Badge[] {
  const { fidelity } = entry;
  const marks: Badge[] = [];
  if (fidelity.level === 'assumed') marks.push({ kind: 'assumed' });
  if (fidelity.level === 'deviation') marks.push({ kind: 'deviation', text: fidelity.text });
  if (!entry.portable) marks.push({ kind: 'not-portable' });
  return marks;
}

/**
 * The palette (GLOSSARY): every catalogue function grouped by function family, families and functions in name order.
 * A search keeps the functions whose name or family contains it, ignoring case and surrounding blanks; a group left
 * empty is dropped.
 */
export function paletteGroups(catalogue: FunctionCatalogue, search: string): PaletteGroup[] {
  const query = search.trim().toLowerCase();
  const groups = new Map<string, PaletteEntry[]>();
  for (const fn of Object.keys(catalogue).sort()) {
    const entry = catalogue[fn]!;
    if (!fn.toLowerCase().includes(query) && !entry.family.toLowerCase().includes(query)) continue;
    if (!groups.has(entry.family)) groups.set(entry.family, []);
    groups.get(entry.family)!.push({ fn, badges: badges(entry) });
  }
  return [...groups.keys()].sort().map((family) => ({ family, entries: groups.get(family)! }));
}
