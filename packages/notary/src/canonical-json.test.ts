import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json';

describe('canonical JSON', () => {
  it('produces the SAME string regardless of key insertion order', () => {
    // The whole point: a hash chain must not flag an intact record as tampered just because it was
    // rebuilt with its keys in a different order.
    const a = canonicalJson({ b: 2, a: 1 });
    const b = canonicalJson({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('sorts keys recursively, at every nesting level', () => {
    const a = canonicalJson({ z: { y: 1, x: 2 }, a: 1 });
    const b = canonicalJson({ a: 1, z: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });

  it('preserves ARRAY order — array position is meaningful data, not construction noise', () => {
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it('treats an explicit undefined the same as an absent key', () => {
    // The same rule JSON.stringify already applies to object properties, made explicit: a hash must
    // never depend on an accident of the engine.
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('distinguishes null from absent', () => {
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });

  it('refuses to hash a non-finite number rather than silently coercing it', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('is stable across repeated calls on the same value', () => {
    const value = { z: 1, a: [3, 2, 1], m: { q: true, p: 'x' } };
    expect(canonicalJson(value)).toBe(canonicalJson(value));
  });
});
