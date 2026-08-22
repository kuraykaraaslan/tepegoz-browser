import { describe, it, expect } from 'vitest';
import {
  IME_MATRIX,
  TURKISH_LAYOUTS,
  TURKISH_SPECIAL_LETTERS,
  foldForSearch,
  turkishCompare,
  turkishLower,
  turkishUpper,
} from './turkish';
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

describe('foldForSearch — the Turkish i family, without breaking English', () => {
  const matches = (haystack: string, needle: string): boolean =>
    foldForSearch(haystack).includes(foldForSearch(needle));

  it('finds a dotted-İ title from a plain-i query', () => {
    // `'İSTANBUL'.toLowerCase()` is 'i' + U+0307, so the naive check fails and nothing tells the user.
    expect('İSTANBUL Gezisi'.toLowerCase().includes('istanbul')).toBe(false);
    expect(matches('İSTANBUL Gezisi', 'istanbul')).toBe(true);
  });

  it('finds a dotless-ı word from a capital-I title', () => {
    expect('ISPARTA notları'.toLowerCase().includes('ısparta')).toBe(false);
    expect(matches('ISPARTA notları', 'ısparta')).toBe(true);
    expect(matches('Iğdır', 'ığdır')).toBe(true);
  });

  it('treats all four members of the i family as one', () => {
    for (const a of ['i', 'ı', 'İ', 'I']) {
      for (const b of ['i', 'ı', 'İ', 'I']) {
        expect(foldForSearch(a)).toBe(foldForSearch(b));
      }
    }
  });

  it('does NOT break English, which locale-correct folding would', () => {
    // 'ITEM'.toLocaleLowerCase('tr') is 'ıtem' — dropping turkishLower into search would fix Turkish
    // by breaking English. The UI language and the language of the user's own data are independent.
    expect(turkishLower('ITEM').includes('item')).toBe(false);
    expect(matches('ITEM', 'item')).toBe(true);
    expect(matches('Inbox', 'INBOX')).toBe(true);
  });

  it('is accent-insensitive, matching what the omnibox already shipped', () => {
    // Lifted from `omnibox-suggest.ts`, where it was correct and private while four other search
    // surfaces used the naive `toLowerCase()`. Consistency matters more than the choice itself: a query
    // must not behave differently in the address bar and the bookmarks manager.
    expect(matches('Şişli', 'sisli')).toBe(true);
    expect(matches('Çankaya', 'cankaya')).toBe(true);
    expect(matches('Şişli', 'şişli')).toBe(true);
    expect(matches('ŞİŞLİ', 'şişli')).toBe(true);
  });

  it('folds every Turkish letter to its base, upper and lower alike', () => {
    for (const { lower, upper } of TURKISH_SPECIAL_LETTERS) {
      expect(foldForSearch(upper)).toBe(foldForSearch(lower));
    }
  });
});
