import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordProviderRegistry } from './registry';
import type {
  LoginCredential,
  LoginCredentialMeta,
  PasswordProvider,
  ProviderCapabilities,
} from './types';

const CAPS: ProviderCapabilities = { canWrite: true, canImport: false, canExport: false, canSync: false };

function meta(id: string, url: string, username: string): LoginCredentialMeta {
  return { id, url, username, title: '', notes: '', providerId: id.split(':')[0]!, createdAt: 0, updatedAt: 0 };
}

function full(m: LoginCredentialMeta): LoginCredential {
  return { ...m, encryptedPassword: 'enc' };
}

/** Minimal in-memory provider for registry tests. */
function makeProvider(id: string, creds: LoginCredentialMeta[]): PasswordProvider {
  return {
    id,
    displayName: id,
    capabilities: CAPS,
    list: () => Promise.resolve(creds),
    findById: (cid) => {
      const match = creds.find((c) => c.id === cid);
      return Promise.resolve(match ? full(match) : null);
    },
    findByUrl: (url) => Promise.resolve(creds.filter((c) => c.url === url).map(full)),
    set: () => Promise.reject(new Error('not used')),
    remove: () => Promise.resolve(),
  };
}

beforeEach(() => {
  PasswordProviderRegistry.reset();
});

describe('PasswordProviderRegistry', () => {
  it('registers and retrieves providers by id', () => {
    const p = makeProvider('local', []);
    PasswordProviderRegistry.register(p);
    expect(PasswordProviderRegistry.get('local')).toBe(p);
    expect(PasswordProviderRegistry.get('missing')).toBeUndefined();
    expect(PasswordProviderRegistry.list()).toEqual([p]);
  });

  it('overwrites a provider registered under the same id', () => {
    const first = makeProvider('local', []);
    const second = makeProvider('local', [meta('local:1', 'https://a.test', 'u')]);
    PasswordProviderRegistry.register(first);
    PasswordProviderRegistry.register(second);
    expect(PasswordProviderRegistry.get('local')).toBe(second);
    expect(PasswordProviderRegistry.list()).toHaveLength(1);
  });

  it('aggregates findByUrl across providers and normalizes the origin', async () => {
    PasswordProviderRegistry.register(
      makeProvider('local', [meta('local:1', 'https://a.test', 'alice')]),
    );
    PasswordProviderRegistry.register(
      makeProvider('vault', [meta('vault:1', 'https://a.test', 'bob')]),
    );
    // A full URL with path/query normalizes down to the origin the providers store.
    const found = await PasswordProviderRegistry.findByUrl('https://a.test/login?x=1');
    expect(found.map((c) => c.username).sort()).toEqual(['alice', 'bob']);
  });

  it('aggregates list_all across providers', async () => {
    PasswordProviderRegistry.register(makeProvider('local', [meta('local:1', 'https://a.test', 'alice')]));
    PasswordProviderRegistry.register(makeProvider('vault', [meta('vault:1', 'https://b.test', 'bob')]));
    const all = await PasswordProviderRegistry.list_all();
    expect(all.map((c) => c.id).sort()).toEqual(['local:1', 'vault:1']);
  });

  it('returns empty aggregates with no providers registered', async () => {
    expect(await PasswordProviderRegistry.findByUrl('https://a.test')).toEqual([]);
    expect(await PasswordProviderRegistry.list_all()).toEqual([]);
  });

  it('reset clears all providers', () => {
    PasswordProviderRegistry.register(makeProvider('local', []));
    PasswordProviderRegistry.reset();
    expect(PasswordProviderRegistry.list()).toEqual([]);
  });
});
