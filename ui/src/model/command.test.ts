import { describe, expect, test } from 'vitest';
import { describeRefusal, type Refusal } from './command';

describe('why a command was refused, in words', () => {
  test.each<[Refusal['code'], string]>([
    ['box-cycle', 'The wire would close a cycle: box b1 already feeds the box it would read.'],
    ['cross-target-field-reference', 'Box b1 belongs to another target field mapping.'],
    ['duplicate-authoring-id', 'The id b1 is already used.'],
    ['unknown-box-reference', 'There is no box b1.'],
    ['wrong-arity', 'Box b1 has no input slot there.'],
  ])('%s', (code, text) => {
    expect(describeRefusal({ code, id: 'b1' })).toBe(text);
  });
});
