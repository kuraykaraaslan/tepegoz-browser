import { describe, expect, it } from 'vitest';
import { analyzeTypoText, detectTypoLanguage, maskRanges, tokenizeTypoText } from './analyzer';
import { DEFAULT_TYPO_SETTINGS } from './types';
import type { TypoDictionaryAdapter } from './analyzer';

const dictionary: TypoDictionaryAdapter = {
  correct(word) {
    return ['merhaba', 'dunya', 'hello', 'world', 'metin'].includes(word.toLocaleLowerCase('tr'));
  },
  suggest(word) {
    if (word === 'düny') return ['dünya'];
    if (word === 'wrld') return ['world'];
    return [];
  },
};

describe('typo analyzer', () => {
  it('tokenizes visible prose and masks markdown code, urls, emails, and latex commands', () => {
    const text = 'merhaba `wrld` https://example.test test@example.test \\frac{a}{b} düny';
    expect(tokenizeTypoText(text).map((t) => t.text)).toEqual(['merhaba', 'düny']);
    expect(maskRanges(text).length).toBeGreaterThanOrEqual(4);
  });

  it('detects Turkish from Turkish characters', () => {
    expect(detectTypoLanguage('çalışma metni', 'en')).toBe('tr');
  });

  it('reports dictionary spelling issues and respects ignored words', () => {
    const result = analyzeTypoText(
      { text: 'merhaba düny wrld', language: 'tr' },
      {
        ...DEFAULT_TYPO_SETTINGS,
        ignoredWords: [{ word: 'wrld', language: 'tr' }],
      },
      { dictionaryFor: () => dictionary },
    );
    expect(result.issues.map((issue) => issue.text)).toEqual(['düny']);
    expect(result.issues[0]?.suggestions).toEqual(['dünya']);
  });

  it('returns no issues when a dictionary is not installed', () => {
    const result = analyzeTypoText({ text: 'wrld', language: 'en' }, DEFAULT_TYPO_SETTINGS, {
      dictionaryFor: () => null,
    });
    expect(result.issues).toEqual([]);
    expect(result.sourcesUsed).toEqual([]);
  });
});
