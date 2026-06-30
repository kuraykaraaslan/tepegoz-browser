import { describe, it, expect } from 'vitest';
import { isSensitiveSite } from './sensitive-site';

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
