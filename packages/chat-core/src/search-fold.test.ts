import { describe, it, expect } from 'vitest';
import { foldedIncludes, tokenize } from './search-fold';

describe('tokenize', () => {
  it('folds, splits on non-alphanumerics, dedupes', () => {
    expect(tokenize('Merhaba, DÜNYA! merhaba')).toEqual(['merhaba', 'dunya']);
  });

  it('caps the token count', () => {
    const many = Array.from({ length: 200 }, (_, i) => `w${String(i)}`).join(' ');
    expect(tokenize(many).length).toBe(64);
  });

  it('handles empty / punctuation-only input', () => {
    expect(tokenize('   ...  ')).toEqual([]);
  });
});

describe('foldedIncludes', () => {
  it('is case- and accent-insensitive', () => {
    expect(foldedIncludes('Şişli toplantısı', 'sisli')).toBe(true);
    expect(foldedIncludes('ISPARTA gezisi', 'ısparta')).toBe(true);
    expect(foldedIncludes('hello world', 'xyz')).toBe(false);
  });

  it('an empty needle matches', () => {
    expect(foldedIncludes('anything', '')).toBe(true);
  });
});
