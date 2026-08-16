import { describe, it, expect } from 'vitest';
import { isSensitiveSite, sensitiveCategory } from './sensitive-site';

describe('isSensitiveSite', () => {
  it('flags banking, crypto, password-manager, and health hosts', () => {
    expect(isSensitiveSite('https://www.mybank.com/login')).toBe(true);
    expect(isSensitiveSite('https://coinbase.com')).toBe(true);
    expect(isSensitiveSite('https://vault.bitwarden.com')).toBe(true);
    expect(isSensitiveSite('https://mychart.example.org')).toBe(true);
  });

  it('does not flag ordinary sites', () => {
    expect(isSensitiveSite('https://example.com')).toBe(false);
    expect(isSensitiveSite('https://news.ycombinator.com')).toBe(false);
  });

  it('returns false for non-URLs', () => {
    expect(isSensitiveSite('not a url')).toBe(false);
    expect(isSensitiveSite('')).toBe(false);
  });
});

/**
 * The v1 keyword list was entirely English/US-centric: every hostname below matched **nothing**,
 * leaving the most sensitive category of site for this product's primary market silently unlocked.
 * These are the cases the category map exists to cover.
 */
describe('sensitiveCategory — Turkish banking and government coverage', () => {
  it.each([
    ['https://www.garanti.com.tr/transfer', 'banking'],
    ['https://www.akbank.com/tr/giris', 'banking'],
    ['https://internet.isbank.com.tr/', 'banking'],
    ['https://www.yapikredi.com.tr/hesap', 'banking'],
    ['https://www.ziraatbank.com.tr/tr', 'banking'],
    ['https://www.vakifbank.com.tr/', 'banking'],
    ['https://www.enpara.com/hesaplarim', 'banking'],
    ['https://www.papara.com/transfer', 'banking'],
  ])('%s → %s', (url, category) => {
    expect(sensitiveCategory(url)).toBe(category);
  });

  it.each([
    ['https://www.turkiye.gov.tr/basvuru', 'government'],
    ['https://intvrg.gib.gov.tr/', 'government'],
    ['https://www.sgk.gov.tr/', 'government'],
    ['https://mhrs.gov.tr/randevu', 'government'],
    ['https://www.tkgm.gov.tr/', 'government'],
    ['https://www.istanbul.bel.tr/', 'government'],
  ])('%s → %s', (url, category) => {
    expect(sensitiveCategory(url)).toBe(category);
  });

  it('covers Turkish crypto exchanges and health portals', () => {
    expect(sensitiveCategory('https://www.btcturk.com/')).toBe('crypto');
    expect(sensitiveCategory('https://www.paribu.com/')).toBe('crypto');
    expect(sensitiveCategory('https://enabiz.gov.tr/')).toBe('government');
  });
});

describe('sensitiveCategory — matching discipline', () => {
  it('returns the category, not just a boolean, so a lockout can be explained', () => {
    expect(sensitiveCategory('https://vault.bitwarden.com')).toBe('password-manager');
    expect(sensitiveCategory('https://coinbase.com')).toBe('crypto');
    expect(sensitiveCategory('https://example.com')).toBeNull();
  });

  it('matches sub-domains of a suffix rule but not lookalike domains', () => {
    expect(sensitiveCategory('https://internet.garanti.com.tr/')).toBe('banking');
    // A suffix rule must not match a domain that merely ENDS WITH the same characters.
    expect(sensitiveCategory('https://notgaranti.com.tr/')).toBeNull();
    expect(sensitiveCategory('https://evilgov.tr.attacker.example/')).toBeNull();
  });

  it('is deterministic when a host could plausibly fit two categories', () => {
    // 'cryptobank.example' hits both a banking substring and a crypto substring; declaration order
    // decides, and it decides the same way every time.
    const first = sensitiveCategory('https://cryptobank.example/');
    expect(first).toBe('banking');
    for (let i = 0; i < 10; i++) expect(sensitiveCategory('https://cryptobank.example/')).toBe(first);
  });

  it('over-matches rather than under-matches — absence is not a safety claim', () => {
    expect(isSensitiveSite('https://databank.io/')).toBe(true);
  });
});
