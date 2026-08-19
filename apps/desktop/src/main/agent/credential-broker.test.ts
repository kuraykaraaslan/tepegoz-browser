import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOsAuthGate } from '@tepegoz/security-policy';

/**
 * The broker's end-to-end contract (S6 PR6): **a secret reaches the page and nothing else.**
 *
 * The interesting assertions are all negative — what the agent does *not* get back, and what does *not*
 * happen when a check is missing. A broker that fills correctly but leaks the value into a result, a
 * log, or an error message has not solved the problem it exists for.
 */

const findByUrl = vi.fn();
const decrypt = vi.fn(() => 'hunter2-the-actual-password');
const logInfo = vi.fn();

vi.mock('../stores.electron', () => ({ passwordVault: { findByUrl, decrypt } }));
vi.mock('@tepegoz/libs', () => ({
  Logger: { info: logInfo, warn: vi.fn(), error: vi.fn() },
  AppError: class extends Error {},
}));

const saved = [{ id: 'c1', url: 'https://bank.test', username: 'ada', encryptedPassword: 'x' }];

let filled: { ref: number; text: string } | null = null;
const deps = {
  pageUrl: () => 'https://bank.test/login',
  fill: (ref: number, text: string) => {
    filled = { ref, text };
    return Promise.resolve(undefined);
  },
};

beforeEach(() => {
  filled = null;
  findByUrl.mockReset();
  decrypt.mockReset();
  logInfo.mockClear();
  findByUrl.mockResolvedValue(saved);
  decrypt.mockReturnValue('hunter2-the-actual-password');
});
afterEach(() => {
  setOsAuthGate(null);
});

async function fill(field: 'username' | 'password' = 'password') {
  const { fillCredential } = await import('./credential-broker.electron');
  return fillCredential(3, field, undefined, deps);
}

describe('what the agent gets back', () => {
  it('never returns the secret, the username, or its length', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    const result = await fill();
    expect(result).toEqual({ filled: true, field: 'password', origin: 'https://bank.test/login' });
    // Exhaustive: no extra key can smuggle a value out.
    expect(Object.keys(result).sort()).toEqual(['field', 'filled', 'origin']);
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });

  it('types the real value into the page — the secret goes vault → main → page and nowhere else', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    await fill();
    expect(filled).toEqual({ ref: 3, text: 'hunter2-the-actual-password' });
  });

  it('keeps the secret out of the logs', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    await fill();
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain('hunter2');
    expect(JSON.stringify(logInfo.mock.calls)).not.toContain('ada');
  });
});

describe('when it refuses', () => {
  it('fills NOTHING with no OS-auth gate installed', async () => {
    const result = await fill();
    expect(result.filled).toBe(false);
    expect(filled).toBeNull();
  });

  it('fills nothing when the user declines, and never decrypts', async () => {
    setOsAuthGate(() => Promise.resolve(false));
    const result = await fill();
    expect(result.filled).toBe(false);
    expect(filled).toBeNull();
    // Ordering matters: a declined prompt must leave the plaintext having never existed here.
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('refuses when nothing is saved for the site, and says so usefully', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    findByUrl.mockResolvedValue([]);
    const result = await fill();
    expect(result.filled).toBe(false);
    expect(result.reason).toContain('no saved credential');
  });

  it('refuses rather than picking an identity when two are saved', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    findByUrl.mockResolvedValue([saved[0], { ...saved[0], id: 'c2', username: 'grace' }]);
    const result = await fill();
    expect(result.filled).toBe(false);
    expect(result.reason).toContain('ask the user');
  });

  it('refuses when decryption fails on this device, without leaking why beyond that', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    decrypt.mockImplementation(() => {
      throw new Error('DPAPI: keychain locked');
    });
    const result = await fill();
    expect(result.filled).toBe(false);
    expect(result.reason).toContain('could not be decrypted');
    expect(result.reason).not.toContain('DPAPI');
  });

  it('fills the username without touching the password path', async () => {
    setOsAuthGate(() => Promise.resolve(true));
    const result = await fill('username');
    expect(result.filled).toBe(true);
    expect(filled).toEqual({ ref: 3, text: 'ada' });
    expect(decrypt).not.toHaveBeenCalled();
  });
});
