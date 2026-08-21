import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LoginCredential, LoginCredentialMeta, SecretCrypto } from '@tepegoz/password-core';

/**
 * In-memory stand-in for the SQLite-backed PasswordStore so the vault's logic (encrypt-on-write,
 * dedupe, decrypt, import, export) is testable under the Node runner — better-sqlite3's native
 * addon only loads under Electron's ABI (see phases/README.md ABI note).
 */
interface StoredRow {
  id: string;
  url: string;
  username: string;
  title: string;
  notes: string;
  encryptedPw: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

const rows = new Map<string, StoredRow>();

function toMeta(r: StoredRow): LoginCredentialMeta {
  return {
    id: r.id,
    url: r.url,
    username: r.username,
    title: r.title,
    notes: r.notes,
    providerId: r.providerId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
function toFull(r: StoredRow): LoginCredential {
  return { ...toMeta(r), encryptedPassword: r.encryptedPw };
}

vi.mock('./password-store', () => ({
  PasswordStore: {
    list: () => [...rows.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(toMeta),
    findById: (_db: unknown, id: string) => {
      const r = rows.get(id);
      return r ? toFull(r) : null;
    },
    findByUrl: (_db: unknown, origin: string) =>
      [...rows.values()].filter((r) => r.url === origin).map(toFull),
    upsert: (_db: unknown, record: StoredRow) => {
      // Emulate ON CONFLICT(url, username): reuse an existing row keyed by (url, username).
      const existing = [...rows.values()].find(
        (r) => r.url === record.url && r.username === record.username,
      );
      rows.set(existing?.id ?? record.id, { ...record, id: existing?.id ?? record.id });
    },
    remove: (_db: unknown, id: string) => {
      rows.delete(id);
    },
  },
}));

// Imported AFTER vi.mock so the vault picks up the mocked store.
const { PasswordVault } = await import('./password-vault');

const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

const fakeDb = {} as never;

/**
 * Guard/validation errors surface synchronously (the store is sync); the async IPC boundary awaits
 * inside try/catch, so this normalizes a sync throw OR a rejected promise into a single rejection.
 */
const asPromise = <T>(fn: () => Promise<T>): Promise<T> => (async () => fn())();

let vault: InstanceType<typeof PasswordVault>;

beforeEach(() => {
  rows.clear();
  vault = new PasswordVault();
  vault.init({ crypto: fakeCrypto, db: fakeDb });
});

describe('PasswordVault.set', () => {
  it('encrypts the password and normalizes the URL to an origin', async () => {
    const meta = await vault.set({
      url: 'https://example.com/login?next=1',
      username: 'alice',
      password: 's3cret',
    });
    expect(meta.url).toBe('https://example.com');
    expect(meta.username).toBe('alice');
    // Metadata never carries the password.
    expect(JSON.stringify(meta)).not.toContain('s3cret');

    const full = await vault.findById(meta.id);
    expect(full?.encryptedPassword).toBe(Buffer.from('enc:s3cret', 'utf8').toString('base64'));
    expect(vault.decrypt(full!)).toBe('s3cret');
  });

  it('trims username and updates in place for the same origin+username (dedupe)', async () => {
    const first = await vault.set({ url: 'https://a.test', username: '  bob ', password: 'p1' });
    const second = await vault.set({ url: 'https://a.test', username: 'bob', password: 'p2' });
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.createdAt);

    const list = await vault.list();
    expect(list).toHaveLength(1);
    expect(vault.decrypt((await vault.findById(first.id))!)).toBe('p2');
  });

  it.each([
    [{ url: '  ', username: 'u', password: 'p' }, 'empty url'],
    [{ url: 'https://a.test', username: '  ', password: 'p' }, 'empty username'],
    [{ url: 'https://a.test', username: 'u', password: '' }, 'empty password'],
  ])('rejects %s inputs', async (input) => {
    await expect(asPromise(() => vault.set(input))).rejects.toThrow();
  });

  it('fails when OS encryption is unavailable', async () => {
    vault.init({ crypto: { ...fakeCrypto, isAvailable: () => false }, db: fakeDb });
    await expect(
      asPromise(() => vault.set({ url: 'https://a.test', username: 'u', password: 'p' })),
    ).rejects.toThrow();
  });
});

describe('PasswordVault lifecycle', () => {
  it('throws when used before init', async () => {
    const fresh = new PasswordVault();
    await expect(asPromise(() => fresh.list())).rejects.toThrow();
  });

  it('lists, finds by url, and removes credentials', async () => {
    await vault.set({ url: 'https://a.test', username: 'alice', password: 'p1' });
    const b = await vault.set({ url: 'https://b.test', username: 'bob', password: 'p2' });

    expect(await vault.list()).toHaveLength(2);
    const byUrl = await vault.findByUrl('https://a.test/some/path');
    expect(byUrl.map((c) => c.username)).toEqual(['alice']);

    await vault.remove(b.id);
    expect(await vault.list()).toHaveLength(1);
  });
});

describe('PasswordVault import/export', () => {
  it('imports CSV rows, skipping malformed lines, and encrypts each', async () => {
    const csv = [
      'name,url,username,password,note',
      'Example,https://example.com,alice,s3cret,note',
      ',,,,', // skipped (missing fields)
      'Bank,https://bank.test,bob,hunter2,',
    ].join('\n');

    const result = await vault.import(csv);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([]);
    expect(await vault.list()).toHaveLength(2);
  });

  it('exports a decrypted CSV round-trippable back through import', async () => {
    await vault.set({
      url: 'https://a.test',
      username: 'alice',
      password: 'p,1',
      title: 'Acme, Inc.',
    });
    const csv = await vault.export();
    expect(csv.split('\n')[0]).toBe('name,url,username,password,note');
    expect(csv).toContain('"Acme, Inc."');
    expect(csv).toContain('"p,1"');

    // Re-import into a clean vault yields the same credential.
    rows.clear();
    const fresh = new PasswordVault();
    fresh.init({ crypto: fakeCrypto, db: fakeDb });
    const result = await fresh.import(csv);
    expect(result.imported).toBe(1);
    expect(fresh.decrypt((await fresh.findByUrl('https://a.test'))[0]!)).toBe('p,1');
  });
});
