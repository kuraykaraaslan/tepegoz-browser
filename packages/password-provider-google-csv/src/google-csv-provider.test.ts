import { describe, it, expect, beforeEach } from 'vitest';
import {
  PasswordProviderRegistry,
  type LoginCredentialMeta,
  type NewCredential,
  type PasswordProvider,
} from '@tepegoz/password-core';
import { GoogleCsvProvider } from './google-csv-provider';

/** Records what the local vault was asked to store, and answers export with a fixed CSV. */
function makeLocalSpy(): { provider: PasswordProvider; saved: NewCredential[] } {
  const saved: NewCredential[] = [];
  const provider: PasswordProvider = {
    id: 'local',
    displayName: 'Local',
    capabilities: { canWrite: true, canImport: true, canExport: true, canSync: false },
    list: () => Promise.resolve([]),
    findById: () => Promise.resolve(null),
    findByUrl: () => Promise.resolve([]),
    set: (c) => {
      saved.push(c);
      const meta: LoginCredentialMeta = {
        id: `id-${saved.length}`,
        url: c.url,
        username: c.username,
        title: c.title ?? '',
        notes: c.notes ?? '',
        providerId: 'local',
        createdAt: 0,
        updatedAt: 0,
      };
      return Promise.resolve(meta);
    },
    remove: () => Promise.resolve(),
    export: () => Promise.resolve('name,url,username,password,note\nX,https://x.test,u,p,'),
  };
  return { provider, saved };
}

const provider = new GoogleCsvProvider();

beforeEach(() => {
  PasswordProviderRegistry.reset();
});

describe('GoogleCsvProvider metadata', () => {
  it('is read-only for direct storage and owns no credentials', async () => {
    expect(provider.capabilities.canWrite).toBe(false);
    expect(await provider.list()).toEqual([]);
    expect(await provider.findById()).toBeNull();
    expect(await provider.findByUrl()).toEqual([]);
    await expect(provider.remove()).resolves.toBeUndefined();
  });
});

describe('GoogleCsvProvider.import', () => {
  it('parses the CSV and delegates each row to the local vault', async () => {
    const { provider: local, saved } = makeLocalSpy();
    PasswordProviderRegistry.register(local);

    const csv = [
      'name,url,username,password,note',
      'Example,https://example.com,alice,s3cret,hi',
      ',,,,', // skipped by the parser
    ].join('\n');

    const result = await provider.import(csv);
    expect(result.imported).toBe(1);
    expect(saved).toEqual([
      {
        url: 'https://example.com',
        username: 'alice',
        password: 's3cret',
        title: 'Example',
        notes: 'hi',
      },
    ]);
  });

  it('collects per-row errors when the local vault rejects', async () => {
    const failing: PasswordProvider = {
      ...makeLocalSpy().provider,
      set: () => Promise.reject(new Error('vault write failed')),
    };
    PasswordProviderRegistry.register(failing);

    const result = await provider.import('name,url,username,password,note\nA,https://a.test,u,p,');
    expect(result.imported).toBe(0);
    expect(result.errors).toEqual(['vault write failed']);
  });
});

describe('GoogleCsvProvider.set / export', () => {
  it('delegates set to the local vault', async () => {
    const { provider: local, saved } = makeLocalSpy();
    PasswordProviderRegistry.register(local);
    const meta = await provider.set({ url: 'https://a.test', username: 'u', password: 'p' });
    expect(meta.providerId).toBe('local');
    expect(saved).toHaveLength(1);
  });

  it('throws when the local vault is not registered', async () => {
    // set() surfaces the missing-vault error synchronously; normalize to a rejection.
    await expect(
      (async () => provider.set({ url: 'https://a.test', username: 'u', password: 'p' }))(),
    ).rejects.toThrow();
  });

  it('delegates export to the local vault', async () => {
    const { provider: local } = makeLocalSpy();
    PasswordProviderRegistry.register(local);
    const csv = await provider.export('google-csv');
    expect(csv).toContain('https://x.test');
  });

  it('exports an empty CSV when no local vault can export', async () => {
    const csv = await provider.export('google-csv');
    expect(csv).toBe('name,url,username,password,note');
  });
});
