import { describe, expect, it } from 'vitest';
import { parsePreferencesImport } from './preferences-import';

describe('parsePreferencesImport', () => {
  it('keeps every key whose value the schema accepts', () => {
    const { patch, skipped } = parsePreferencesImport(
      JSON.stringify({ theme: 'dark', locale: 'tr', telemetryEnabled: true }),
    );
    expect(patch).toEqual({ theme: 'dark', locale: 'tr', telemetryEnabled: true });
    expect(skipped).toEqual([]);
  });

  it('skips a key the preferences schema does not know', () => {
    const { patch, skipped } = parsePreferencesImport(
      JSON.stringify({ theme: 'light', notAPreference: 42 }),
    );
    expect(patch).toEqual({ theme: 'light' });
    expect(skipped).toEqual(['notAPreference']);
  });

  it('skips a known key whose value fails validation, applying the rest', () => {
    const { patch, skipped } = parsePreferencesImport(
      JSON.stringify({ theme: 'chartreuse', locale: 'en' }),
    );
    expect(patch).toEqual({ locale: 'en' });
    expect(skipped).toEqual(['theme']);
  });

  it('throws a SyntaxError on text that is not JSON', () => {
    expect(() => parsePreferencesImport('this is not json {')).toThrow(SyntaxError);
  });

  it('throws a SyntaxError on JSON that is not a plain object', () => {
    expect(() => parsePreferencesImport('[1, 2, 3]')).toThrow(SyntaxError);
    expect(() => parsePreferencesImport('null')).toThrow(SyntaxError);
    expect(() => parsePreferencesImport('42')).toThrow(SyntaxError);
  });

  it('returns an all-skipped result (not a throw) for an object of only bad keys', () => {
    const { patch, skipped } = parsePreferencesImport(JSON.stringify({ a: 1, b: 2 }));
    expect(patch).toEqual({});
    expect(skipped).toEqual(['a', 'b']);
  });
});
