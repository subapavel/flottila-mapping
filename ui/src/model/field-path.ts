/**
 * A step of a field path's text (ADR-0007): an EQName's `Q{namespace}` may hold a `/`; a JSON property's name has no
 * raw `/` or brace, as it percent-encodes `% / @ { }`.
 */
const STEP = /(?:\{[^}]*\}|[^/{])+/g;

/** The escapes of a JSON property's name: `%` and the upper-case hex code of one of `% / @ { }` (ADR-0007). */
const ESCAPE = /%(25|2F|40|7B|7D)/g;

/** The steps of a field path, root first, each as the structure spells it, so a JSON step stays escaped. */
export function fieldPathSteps(path: string): string[] {
  return path.match(STEP) ?? [];
}

/**
 * The name a field path's last step shows (a single step reads as a path of that step): its local name, `@` before
 * an attribute's, and a JSON property's name as the schema spells it, its escapes decoded once; a JSON root is `$`.
 * A path with no step shows itself.
 */
export function stepName(path: string): string {
  const last = fieldPathSteps(path).at(-1) ?? path;
  return decodeName(last);
}

/**
 * A field path as its steps' local names joined by `/`, for display: each as `stepName` shows it.
 * A path with no step shows itself.
 */
export function localPath(path: string): string {
  const steps = fieldPathSteps(path);
  return steps.length === 0 ? path : steps.map(decodeName).join('/');
}

function decodeName(step: string): string {
  return step.replace(/^(@?)Q\{[^}]*\}/, '$1').replace(ESCAPE, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
