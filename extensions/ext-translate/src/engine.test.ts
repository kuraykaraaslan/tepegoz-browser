import { describe, expect, it } from 'vitest';
import {
  applyGlossaryTerms,
  createTranslateBatches,
  isTranslateEnabledForOrigin,
  normalizeTranslateLanguage,
  parseTranslateModelResponse,
  resolveTranslateTargetLanguage,
  shouldAutoTranslatePage,
} from './engine';
import { DEFAULT_TRANSLATE_SETTINGS } from './types';

describe('translate engine helpers', () => {
  it('normalizes languages and resolves app locale targets', () => {
    expect(normalizeTranslateLanguage('tr-TR')).toBe('tr');
    expect(normalizeTranslateLanguage('EN_us')).toBe('en');
    expect(resolveTranslateTargetLanguage('tr')).toBe('tr');
    expect(resolveTranslateTargetLanguage('en-US')).toBe('en');
  });

  it('checks site enablement and auto-translate language differences', () => {
    const settings = { ...DEFAULT_TRANSLATE_SETTINGS, disabledOrigins: ['https://example.test'] };
    expect(isTranslateEnabledForOrigin(settings, 'https://example.test/page')).toBe(false);
    expect(
      shouldAutoTranslatePage(DEFAULT_TRANSLATE_SETTINGS, 'en', 'tr', 'https://example.test'),
    ).toBe(true);
    expect(
      shouldAutoTranslatePage(DEFAULT_TRANSLATE_SETTINGS, 'tr', 'tr', 'https://example.test'),
    ).toBe(false);
  });

  it('batches by item and character limits', () => {
    const batches = createTranslateBatches(
      [
        { id: 'a', text: 'hello' },
        { id: 'b', text: 'world' },
        { id: 'c', text: 'again' },
      ],
      2,
      20,
    );
    expect(batches.map((b) => b.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('applies glossary replacements and parses model JSON', () => {
    expect(
      applyGlossaryTerms('Hello Tepegoz', [
        { id: '1', source: 'Tepegoz', target: 'Tepegöz', caseSensitive: false },
      ]),
    ).toBe('Hello Tepegöz');
    const parsed = parseTranslateModelResponse(
      '{"items":[{"id":"1","translatedText":"Merhaba"}]}',
      { items: [{ id: '1', text: 'Hello' }], sourceLanguage: 'en', targetLanguage: 'tr' },
      'local-llm',
    );
    expect(parsed.items[0]?.translatedText).toBe('Merhaba');
  });
});
