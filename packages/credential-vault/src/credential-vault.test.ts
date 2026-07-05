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

describe('CredentialVault (multi-key)', () => {
  it('starts empty', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.status()).toEqual({
      anthropic: false,
      openai: false,
      gemini: false,
      local: false,
    });
    expect(CredentialVault.listMeta()).toEqual([]);
    expect(CredentialVault.getFirstKeyForProvider('anthropic')).toBeNull();
  });

  it('adds a key and returns metadata WITHOUT the secret (last4 fingerprint only)', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const meta = CredentialVault.addKey('anthropic', '  Work  ', '  sk-ant-1234  ');
    expect(meta.provider).toBe('anthropic');
    expect(meta.label).toBe('Work'); // trimmed
    expect(meta.last4).toBe('1234'); // trimmed key, last four
    expect(meta.id).toMatch(/[0-9a-f-]{36}/);
    expect(meta).not.toHaveProperty('ciphertext');
    // metadata carries no secret
    expect(JSON.stringify(meta)).not.toContain('sk-ant');
    expect(CredentialVault.status().anthropic).toBe(true);
    // the secret round-trips (trimmed) for main-only consumers
    expect(CredentialVault.getKeyById(meta.id)).toBe('sk-ant-1234');
  });

  it('holds MULTIPLE keys for the same provider', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const a = CredentialVault.addKey('anthropic', 'Work', 'sk-aaaa');
    const b = CredentialVault.addKey('anthropic', 'Personal', 'sk-bbbb');
    const list = CredentialVault.listMetaByProvider('anthropic');
    expect(list.map((m) => m.label)).toEqual(['Work', 'Personal']); // oldest first
    expect(CredentialVault.getKeyById(a.id)).toBe('sk-aaaa');
    expect(CredentialVault.getKeyById(b.id)).toBe('sk-bbbb');
    // "first for provider" is the oldest
    expect(CredentialVault.getFirstKeyForProvider('anthropic')).toBe('sk-aaaa');
  });

  it('listMeta never carries ciphertext for any key', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    CredentialVault.addKey('openai', 'k1', 'sk-openai-9999');
    for (const m of CredentialVault.listMeta()) {
      expect(m).not.toHaveProperty('ciphertext');
      expect(Object.keys(m).sort((a, b) => a.localeCompare(b))).toEqual([
        'createdAt',
        'id',
        'label',
        'last4',
        'provider',
      ]);
    }
  });

  it('removes a key by id (and clears provider status when the last one goes)', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const meta = CredentialVault.addKey('gemini', 'k', 'g-key');
    CredentialVault.removeKey(meta.id);
    expect(CredentialVault.status().gemini).toBe(false);
    expect(CredentialVault.getKeyById(meta.id)).toBeNull();
  });

  it('reorders keys (priority order); the top key is the default, first-per-provider drives selection', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const a = CredentialVault.addKey('anthropic', 'A', 'sk-a');
    const o = CredentialVault.addKey('openai', 'O', 'sk-o');
    const b = CredentialVault.addKey('anthropic', 'B', 'sk-b');
    expect(CredentialVault.topProvider()).toBe('anthropic'); // insertion order: A on top
    // Move the OpenAI key to the top → it becomes the default provider.
    CredentialVault.reorderKeys([o.id, a.id, b.id]);
    expect(CredentialVault.listMeta().map((m) => m.label)).toEqual(['O', 'A', 'B']);
    expect(CredentialVault.topProvider()).toBe('openai');
    // First-per-provider follows the new order (A still before B for anthropic).
    expect(CredentialVault.getFirstKeyForProvider('anthropic')).toBe('sk-a');
    // Now put B before A; anthropic's active key flips to B.
    CredentialVault.reorderKeys([b.id, a.id, o.id]);
    expect(CredentialVault.getFirstKeyForProvider('anthropic')).toBe('sk-b');
    expect(CredentialVault.topProvider()).toBe('anthropic');
  });

  it('reorder ignores unknown ids and keeps unlisted keys at the end', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const a = CredentialVault.addKey('anthropic', 'A', 'sk-a');
    const b = CredentialVault.addKey('anthropic', 'B', 'sk-b');
    CredentialVault.reorderKeys(['ghost', b.id]); // 'ghost' ignored; A unlisted → stays at end
    expect(CredentialVault.listMeta().map((m) => m.label)).toEqual(['B', 'A']);
    expect(CredentialVault.listMeta().map((m) => m.id).sort((x, y) => x.localeCompare(y))).toEqual(
      [a.id, b.id].sort((x, y) => x.localeCompare(y)),
    );
  });

  it('renames a key by id, and throws 404 for an unknown id', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const meta = CredentialVault.addKey('anthropic', 'old', 'sk');
    CredentialVault.renameKey(meta.id, ' new ');
    expect(CredentialVault.listMeta()[0]?.label).toBe('new');
    expect(() => CredentialVault.renameKey('nope', 'x')).toThrow(/id/);
  });

  it('persists the whole collection across re-init (v2 round-trip through the file)', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    CredentialVault.addKey('openai', 'A', 'sk-a');
    CredentialVault.addKey('openai', 'B', 'sk-b');
    CredentialVault.reset();
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.listMetaByProvider('openai').map((m) => m.label)).toEqual(['A', 'B']);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as { version: number };
    expect(onDisk.version).toBe(2);
  });

  it('rejects an empty key and an empty label', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(() => CredentialVault.addKey('anthropic', 'x', '   ')).toThrow(/empty/i);
    expect(() => CredentialVault.addKey('anthropic', '  ', 'sk')).toThrow(/label/i);
  });

  it('refuses to store when OS encryption is unavailable', () => {
    const noCrypto: SecretCrypto = { ...fakeCrypto, isAvailable: () => false };
    CredentialVault.init({ crypto: noCrypto, filePath });
    expect(CredentialVault.isEncryptionAvailable()).toBe(false);
    expect(() => CredentialVault.addKey('anthropic', 'x', 'sk')).toThrow(/encryption/);
  });

  it('MIGRATES a legacy single-slot file to v2 without dropping keys', () => {
    // Legacy shape written by the old vault: { [provider]: base64Ciphertext }, no version field.
    writeFileSync(filePath, JSON.stringify({ anthropic: enc('sk-legacy-7777') }), 'utf8');
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const list = CredentialVault.listMetaByProvider('anthropic');
    expect(list).toHaveLength(1);
    expect(list[0]?.last4).toBe('7777'); // recovered by a single decrypt during migration
    expect(CredentialVault.getFirstKeyForProvider('anthropic')).toBe('sk-legacy-7777');
    // migration is persisted as v2 on disk immediately
    const onDisk = JSON.parse(readFileSync(filePath, 'utf8')) as { version: number; keys: unknown[] };
    expect(onDisk.version).toBe(2);
    expect(onDisk.keys).toHaveLength(1);
  });

  it('keeps valid v2 records when one record is corrupt (per-entry tolerance)', () => {
    const good = { id: 'k1', provider: 'anthropic', label: 'ok', createdAt: 1, last4: 'aaaa', ciphertext: enc('sk-good') };
    const bad = { id: 'k2', provider: 'anthropic', label: 42 }; // malformed
    writeFileSync(filePath, JSON.stringify({ version: 2, keys: [good, bad] }), 'utf8');
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.listMeta()).toHaveLength(1);
    expect(CredentialVault.getKeyById('k1')).toBe('sk-good');
  });

  it('drops unknown-provider records on load', () => {
    const grok = { id: 'g', provider: 'grok', label: 'x', createdAt: 1, last4: '', ciphertext: enc('x') };
    const ok = { id: 'a', provider: 'anthropic', label: 'ok', createdAt: 2, last4: 'kkkk', ciphertext: enc('k') };
    writeFileSync(filePath, JSON.stringify({ version: 2, keys: [grok, ok] }), 'utf8');
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    expect(CredentialVault.status()).toEqual({
      anthropic: true,
      openai: false,
      gemini: false,
      local: false,
    });
    expect(CredentialVault.listMeta()).toHaveLength(1);
  });

  it('getKeyById throws a 503-class error when encryption is unavailable but a key exists', () => {
    CredentialVault.init({ crypto: fakeCrypto, filePath });
    const meta = CredentialVault.addKey('anthropic', 'k', 'sk');
    CredentialVault.reset();
    const noCrypto: SecretCrypto = { ...fakeCrypto, isAvailable: () => false };
    CredentialVault.init({ crypto: noCrypto, filePath });
    expect(() => CredentialVault.getKeyById(meta.id)).toThrow(/encryption/);
  });
});
