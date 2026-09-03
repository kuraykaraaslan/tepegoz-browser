import { describe, expect, it, vi } from 'vitest';
import { attributesMap, axString, delay } from './cdp-driver-schemas.electron';

/**
 * The dependency-free pure coercers behind the `CdpDriver` facade. Covered here because the
 * concern-specific siblings mock `delay` out and never exercise `axString` / `attributesMap`
 * directly.
 */
describe('cdp-driver-schemas pure helpers', () => {
  it('delay resolves only once its timer elapses', async () => {
    vi.useFakeTimers();
    try {
      let done = false;
      const p = delay(50).then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(49);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('axString passes strings through, coerces number/boolean, and blanks everything else', () => {
    expect(axString('  keep spaces  ')).toBe('  keep spaces  ');
    expect(axString(42)).toBe('42');
    expect(axString(0)).toBe('0');
    expect(axString(true)).toBe('true');
    expect(axString(false)).toBe('false');
    expect(axString(null)).toBe('');
    expect(axString(undefined)).toBe('');
    expect(axString({ a: 1 })).toBe('');
    expect(axString([1, 2])).toBe('');
  });

  it('attributesMap folds a flat attr array into a lowercased map', () => {
    expect(attributesMap(undefined)).toEqual(new Map());

    const m = attributesMap(['ID', 'main', 'DATA-X', 'v', 'ARIA-HIDDEN']);
    expect(m.get('id')).toBe('main');
    expect(m.get('data-x')).toBe('v');
    expect(m.get('aria-hidden')).toBe(''); // no pair value for the odd tail
    expect(m.size).toBe(3);
  });
});
