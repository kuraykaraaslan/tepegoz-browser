import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import CredentialVault, { type SecretCrypto } from './credential-vault';

/** base64 of the fake-encrypted form of `plain`, as it would sit on disk. */
function enc(plain: string): string {
  return Buffer.from(`enc:${plain}`, 'utf8').toString('base64');
}

/** Reversible fake crypto (no OS keychain) — proves the encrypt → base64 → file → decrypt round-trip. */
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-vault-'));
  filePath = join(dir, 'credentials.enc.json');
  CredentialVault.reset();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('CredentialVault', () => {
  it('starts empty', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.status()).toEqual({ anthropic: false, openai: false, gemini: false });
    expect(CredentialVault.getKey('anthropic')).toBeNull();
  });

  it('stores and reads back a key (encrypted)', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const status = CredentialVault.setKey('anthropic', '  sk-ant-123  ');
    expect(status.anthropic).toBe(true);
    expect(CredentialVault.hasKey('anthropic')).toBe(true);
    // trims, and never stores plaintext on disk
    expect(CredentialVault.getKey('anthropic')).toBe('sk-ant-123');
  });

  it('persists across re-init (base64 round-trip through the file)', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    CredentialVault.setKey('openai', 'sk-openai');
    CredentialVault.reset();
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.hasKey('openai')).toBe(true);
    expect(CredentialVault.getKey('openai')).toBe('sk-openai');
  });

  it('removes a key', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    CredentialVault.setKey('gemini', 'k');
    expect(CredentialVault.removeKey('gemini').gemini).toBe(false);
    expect(CredentialVault.getKey('gemini')).toBeNull();
  });

  it('rejects an empty key', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(() => CredentialVault.setKey('anthropic', '   ')).toThrow(/empty/);
  });

  it('refuses to store when OS encryption is unavailable', () => {
    const noCrypto: SecretCrypto = { ...fakeCrypto, isAvailable: () => false };
    CredentialVault.init({ crypto: noCrypto, filePath });
    expect(CredentialVault.isEncryptionAvailable()).toBe(false);
    expect(() => CredentialVault.setKey('anthropic', 'sk')).toThrow(/encryption/);
  });

  it('keeps valid entries when one entry is corrupt (per-entry tolerance)', () => {
    writeFileSync(filePath, JSON.stringify({ anthropic: enc('sk-good'), openai: 123 }), 'utf8');
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.getKey('anthropic')).toBe('sk-good');
    expect(CredentialVault.hasKey('openai')).toBe(false);
  });

  it('drops unknown-provider entries and never re-persists them', () => {
    writeFileSync(filePath, JSON.stringify({ grok: 'x', anthropic: enc('k') }), 'utf8');
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.status()).toEqual({ anthropic: true, openai: false, gemini: false });
    CredentialVault.setKey('openai', 'k2'); // any write persists the cleaned (grok-free) store
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    expect('grok' in onDisk).toBe(false);
  });

  it('getKey throws 503-class error when encryption is unavailable but a key exists', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    CredentialVault.setKey('anthropic', 'sk');
    CredentialVault.reset();
    const noCrypto: SecretCrypto = { ...fakeCrypto, isAvailable: () => false };
    CredentialVault.init({ crypto: noCrypto, filePath });
    expect(() => CredentialVault.getKey('anthropic')).toThrow(/encryption/);
  });
});
