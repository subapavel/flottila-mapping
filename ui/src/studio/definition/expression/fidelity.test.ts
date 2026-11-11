import { describe, expect, test } from 'vitest';
import { fidelityWords } from './fidelity';

describe('fidelityWords (GLOSSARY: Fidelity, ADR-0026)', () => {
  test('names an exact function plainly', () => {
    expect(fidelityWords({ level: 'exact' })).toBe('Fidelity: exact');
  });

  test('names an assumed reading plainly, as no error', () => {
    expect(fidelityWords({ level: 'assumed' })).toBe('Fidelity: assumed reading, until an observed case confirms it');
  });

  test("gives a deviation with the catalogue's text", () => {
    expect(fidelityWords({ level: 'deviation', text: 'rounds half even' })).toBe('Deviation: rounds half even');
  });
});
