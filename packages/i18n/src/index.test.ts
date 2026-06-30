import { describe, it, expect } from 'vitest';
import { resources, SUPPORTED_LOCALES, DEFAULT_LOCALE, resolveLocale } from './index';

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('i18n catalog integrity', () => {
  const enKeys = keyPaths(resources.en).sort();

  it('every locale has the exact same key set as en (source of truth)', () => {
    for (const loc of SUPPORTED_LOCALES) {
      expect(keyPaths(resources[loc]).sort(), `locale "${loc}" key set`).toEqual(enKeys);
    }
  });

  it('default locale is supported', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('resolves OS-style locale tags and falls back to default', () => {
    expect(resolveLocale('tr-TR')).toBe('tr');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('de-DE')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});
