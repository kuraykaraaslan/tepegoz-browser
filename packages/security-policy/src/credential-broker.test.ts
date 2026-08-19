import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasOsAuthGate, matchCredential, requireOsAuth, setOsAuthGate } from './credential-broker';

afterEach(() => {
  setOsAuthGate(null);
});

describe('the OS-auth gate', () => {
  it('REFUSES with no gate installed — "nobody could check" is not "the user agreed"', async () => {
    expect(hasOsAuthGate()).toBe(false);
    expect(await requireOsAuth('fill your password')).toBe(false);
  });

  it('refuses when the user declines', async () => {
    setOsAuthGate(() => Promise.resolve(false));
    expect(await requireOsAuth('fill your password')).toBe(false);
  });

  it('refuses when the gate throws — a check that could not run did not pass', async () => {
    setOsAuthGate(() => Promise.reject(new Error('no biometric hardware')));
    expect(await requireOsAuth('fill your password')).toBe(false);
  });

  it('passes only on an explicit yes, and is told what it is authorising', async () => {
    const gate = vi.fn(() => Promise.resolve(true));
    setOsAuthGate(gate);
    expect(await requireOsAuth('fill your password on bank.test')).toBe(true);
    expect(gate).toHaveBeenCalledWith('fill your password on bank.test');
  });
});

describe('matching a credential to the page', () => {
  const saved = [
    { id: 'c1', origin: 'https://bank.test' },
    { id: 'c2', origin: 'https://shop.example' },
  ];

  it('matches the saved login for the site', () => {
    expect(matchCredential('https://bank.test/login', saved)).toEqual({ ok: true, credentialId: 'c1' });
  });

  it('matches across subdomains of the same registrable site', () => {
    expect(matchCredential('https://secure.bank.test/login', saved)).toEqual({ ok: true, credentialId: 'c1' });
  });

  it('REFUSES a look-alike that merely contains the site name', () => {
    // A substring check would hand the password to bank.test.evil.com. eTLD+1 is the only honest test.
    const result = matchCredential('https://bank.test.evil.com/login', saved);
    expect(result.ok).toBe(false);
  });

  it('refuses silently rather than offering the nearest match', () => {
    const result = matchCredential('https://unknown.test/login', saved);
    expect(result).toEqual({ ok: false, reason: 'no saved credential for unknown.test' });
  });

  it('refuses when the site is ambiguous instead of picking an identity for the user', () => {
    const two = [
      { id: 'a', origin: 'https://bank.test' },
      { id: 'b', origin: 'https://bank.test' },
    ];
    const result = matchCredential('https://bank.test/login', two);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('ask the user');
  });

  it('refuses when the page origin cannot be resolved at all', () => {
    expect(matchCredential('not a url', saved).ok).toBe(false);
  });
});
