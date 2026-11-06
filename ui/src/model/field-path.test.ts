import { describe, expect, test } from 'vitest';
import { fieldPathSteps, stepName } from './field-path';

describe('the steps of a field path (ADR-0007)', () => {
  test('are the texts between its slashes, an EQName with its namespace and an attribute with its @', () => {
    expect(fieldPathSteps('/Q{urn:a}Order/Item/@id')).toEqual(['Q{urn:a}Order', 'Item', '@id']);
  });

  test("a slash inside an EQName's namespace does not end a step", () => {
    expect(fieldPathSteps('/Q{http://a/b}Order/@Q{urn:x/y}code')).toEqual(['Q{http://a/b}Order', '@Q{urn:x/y}code']);
  });

  test('an escaped JSON step stays escaped, as the structure spells it', () => {
    expect(fieldPathSteps('/$/order/a%2Fb%25%40%7B%7D')).toEqual(['$', 'order', 'a%2Fb%25%40%7B%7D']);
  });

  test('a path with no step has none', () => {
    expect(fieldPathSteps('')).toEqual([]);
  });
});

describe('the name of a field path’s last step', () => {
  test.each([
    ['/Q{urn:a}Order', 'Order'],
    ['/Q{urn:a}Order/OrderId', 'OrderId'],
    ['/Q{urn:a}Order/@channel', '@channel'],
    ['/Q{http://a/b}Order/Q{http://a/b}Item', 'Item'],
    ['/Q{http://a/b}Order/@Q{http://a/c}code', '@code'],
    ['/$', '$'],
    ['/$/order/items', 'items'],
    ['/$/order/a%2Fb%25%40%7B%7D', 'a/b%@{}'],
    ['', ''],
  ])('%s is %s', (path, name) => {
    expect(stepName(path)).toBe(name);
  });

  test("is its last step's local name, @ before an attribute's, and the path itself when it has no step", () => {
    expect(stepName('/Q{urn:flottila:corpus:skeleton}Order/OrderId')).toBe('OrderId');
    expect(stepName('/Q{http://a/b}Order/@Q{urn:x}code')).toBe('@code');
    expect(stepName('')).toBe('');
  });

  test('a single step reads as a path of that step', () => {
    expect(stepName('a%2Fb')).toBe('a/b');
    expect(stepName('@Q{urn:x}code')).toBe('@code');
  });

  test('a JSON property spelled like an attribute or an EQName is shown as its name, not read as one', () => {
    expect(stepName('/$/%40id')).toBe('@id');
    expect(stepName('/$/Q%7Burn:a%7Dx')).toBe('Q{urn:a}x');
  });

  test('only the five escapes the service writes are decoded, once, and a stray % in a hand-written model is shown as it is', () => {
    expect(stepName('/$/a%2541')).toBe('a%41');
    expect(stepName('/$/a%41')).toBe('a%41');
    expect(stepName('/$/50%')).toBe('50%');
    expect(stepName('/$/a%2f')).toBe('a%2f');
  });
});
