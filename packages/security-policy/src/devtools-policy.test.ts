import { describe, expect, it } from 'vitest';
import { mayOpenDevTools } from './devtools-policy';

describe('opening DevTools', () => {
  it('is allowed on an ordinary page', () => {
    expect(mayOpenDevTools('https://example.com/docs')).toEqual({ allowed: true });
  });

  it('is BLOCKED on the same sensitive sites automation is locked out of', () => {
    // One list, one meaning. The sites where a session is worth the most are the sites where the most
    // powerful surface stays shut.
    for (const url of [
      'https://www.chase.com/accounts',
      'https://www.binance.com/en/trade',
      'https://vault.bitwarden.com/',
    ]) {
      expect(mayOpenDevTools(url), url).toEqual({ allowed: false, reason: 'sensitive_site' });
    }
  });

  it('refuses when there is no page at all rather than defaulting to allowed', () => {
    expect(mayOpenDevTools(null).allowed).toBe(false);
    expect(mayOpenDevTools('').allowed).toBe(false);
    expect(mayOpenDevTools(undefined).allowed).toBe(false);
  });

  it('gives a REASON, so the refusal can be explained instead of looking like a bug', () => {
    // A shortcut that silently does nothing reads as a broken browser, and a user who thinks the
    // browser is broken goes looking for one that is not.
    const verdict = mayOpenDevTools('https://www.chase.com/');
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe('sensitive_site');
  });
});
