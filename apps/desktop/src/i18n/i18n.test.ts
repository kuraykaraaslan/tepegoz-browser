import { describe, it, expect } from 'vitest';
import { keyPaths } from '@tepegoz/i18n/testing';
import { en } from './en';
import { tr } from './tr';

describe('app i18n parity', () => {
  it('tr has the exact same key set as en (source of truth)', () => {
    expect(keyPaths(tr).sort()).toEqual(keyPaths(en).sort());
  });
});

describe('httpsOnly interstitial strings', () => {
  it('has every key non-empty in both locales', () => {
    for (const dict of [en, tr]) {
      const g = dict.httpsOnly;
      expect(Object.keys(g).length).toBeGreaterThanOrEqual(8);
      for (const v of Object.values(g)) expect(v.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps the same interpolation placeholders in en and tr', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(en.httpsOnly) as (keyof typeof en.httpsOnly)[]) {
      expect(ph(tr.httpsOnly[k]), k).toEqual(ph(en.httpsOnly[k]));
    }
  });

  it('never claims the site simply has no HTTPS without the interference caveat', () => {
    expect(en.httpsOnly.interferenceWarning).toMatch(/interfering/);
    expect(en.httpsOnly.tunnelDownTitle).not.toMatch(/HTTPS/);
  });
});
