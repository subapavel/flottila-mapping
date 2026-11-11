import type { Fidelity } from '../../../generated/function-catalogue';

/**
 * A function's fidelity in words (GLOSSARY: Fidelity, ADR-0026): exact and an assumed reading plainly, a deviation with
 * the catalogue's text.
 */
export function fidelityWords(fidelity: Fidelity): string {
  switch (fidelity.level) {
    case 'exact':
      return 'Fidelity: exact';
    case 'assumed':
      return 'Fidelity: assumed reading, until an observed case confirms it';
    case 'deviation':
      return `Deviation: ${fidelity.text}`;
  }
}
