import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { tr } from './locales/tr';

/**
 * The shared `errors` namespace is the ONLY thing standing between a Turkish user and an English
 * error dialog, so a key added to one locale and not the other is a silent regression: `localizeError`
 * returns undefined and the boundary quietly falls back to the English operator text.
 */
describe('shared errors dictionary parity', () => {
  it('defines the same error keys in both locales', () => {
    expect(Object.keys(tr.errors).sort()).toEqual(Object.keys(en.errors).sort());
  });

  it('has no empty or untranslated (identical) Turkish string', () => {
    const identical = Object.keys(en.errors).filter(
      (k) =>
        (tr.errors as Record<string, string>)[k] === (en.errors as Record<string, string>)[k] ||
        ((tr.errors as Record<string, string>)[k] ?? '').trim() === '',
    );
    expect(identical).toEqual([]);
  });
});
