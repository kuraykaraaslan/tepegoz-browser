import { describe, it, expect } from 'vitest';
import { turkishUpper, turkishLower, turkishCompare, TURKISH_SPECIAL_LETTERS, IME_MATRIX, TURKISH_LAYOUTS } from './turkish';
import { localeDir } from './direction';
import { ALL_SUPPORTED_LTR } from './index';

describe('Turkish case folding', () => {
  it('handles the dotted/dotless i correctly (unlike ASCII toUpper/toLower)', () => {
    // The whole point: default JS gets these wrong.
    expect(turkishUpper('istanbul')).toBe('İSTANBUL');
    expect(turkishLower('IĞDIR')).toBe('ığdır');
    expect('istanbul'.toUpperCase()).toBe('ISTANBUL'); // demonstrates the default is wrong
  });

  it('round-trips every special letter', () => {
    for (const { lower, upper } of TURKISH_SPECIAL_LETTERS) {
      expect(turkishUpper(lower)).toBe(upper);
      expect(turkishLower(upper)).toBe(lower);
    }
  });

  it('collates Turkish letters in locale order', () => {
    expect(turkishCompare('a', 'b')).toBeLessThan(0);
    expect(turkishCompare('ç', 'd')).toBeLessThan(0); // ç sorts right after c, before d
  });
});

describe('IME regression matrix skeleton', () => {
  it('covers both Turkish layouts and every special letter, incl. dead keys', () => {
    expect(TURKISH_LAYOUTS).toEqual(['tr-Q', 'tr-F']);
    // 2 layouts × 7 letters + 2 dead-key cases.
    expect(IME_MATRIX).toHaveLength(TURKISH_LAYOUTS.length * TURKISH_SPECIAL_LETTERS.length + 2);
    expect(IME_MATRIX.some((c) => c.deadKey)).toBe(true);
    // Every case is well-formed (a Phase-1a runner can consume it).
    for (const c of IME_MATRIX) {
      expect(TURKISH_LAYOUTS).toContain(c.layout);
      expect(c.expected.length).toBeGreaterThan(0);
    }
  });
});

describe('direction skeleton', () => {
  it('reports LTR for shipping locales and RTL for future RTL tags', () => {
    expect(localeDir('en')).toBe('ltr');
    expect(localeDir('tr')).toBe('ltr');
    expect(localeDir('ar')).toBe('rtl');
    expect(localeDir('he-IL')).toBe('rtl');
    expect(ALL_SUPPORTED_LTR).toBe(true);
  });
});
