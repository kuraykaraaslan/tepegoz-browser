import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `stores.electron` — the one place that injects the OS keychain + userData path into the Electron-free
 * store cores. Pinned: `initStores` wires `CredentialVault` / `PreferenceStore` under `userData`, loads
 * + validates the extension catalog (skipping invalid manifests with a log, fatal on read failure or an
 * empty catalog), initializes the DB + trust profiles, and registers the password providers only when
 * a DB is available; and `safeStorageCrypto` delegates straight to `safeStorage`.
 */

const readFileSync = vi.hoisted(() => vi.fn(() => '{"version":1}'));
vi.mock('node:fs', () => ({ readFileSync }));

const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString('utf8')),
}));
vi.mock('electron', () => ({
  app: { getAppPath: () => '/app', getPath: () => '/userData' },
  safeStorage,
}));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const CredentialVault = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@tepegoz/credential-vault', () => ({ default: CredentialVault }));
const PreferenceStore = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@tepegoz/preferences', () => ({ default: PreferenceStore }));

const loadCatalog = vi.hoisted(() =>
  vi.fn(() => ({ entries: [{ id: 'e1' }], errors: [] as unknown[] })),
);
vi.mock('@tepegoz/extension-catalog', () => ({ loadCatalog }));

const db = vi.hoisted(() => ({
  initDatabase: vi.fn(),
  getDb: vi.fn((): unknown => ({ __db: true })),
}));
vi.mock('./db/database.electron', () => db);
const initTrustProfiles = vi.hoisted(() => vi.fn());
vi.mock('./security/trust-profile-host.electron', () => ({ initTrustProfiles }));
const initBuiltinManifests = vi.hoisted(() => vi.fn());
vi.mock('../shared/extensions', () => ({ initBuiltinManifests }));

const passwordVault = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('@tepegoz/password-vault', () => ({ passwordVault }));
const PasswordProviderRegistry = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('@tepegoz/password-core', () => ({ PasswordProviderRegistry }));
const googleCsvProvider = { id: 'google-csv' };
vi.mock('@tepegoz/password-provider-google-csv', () => ({ googleCsvProvider }));

const { initStores } = await import('./stores.electron');

beforeEach(() => {
  vi.clearAllMocks();
  readFileSync.mockReturnValue('{"version":1}');
  loadCatalog.mockReturnValue({ entries: [{ id: 'e1' }], errors: [] });
  db.getDb.mockReturnValue({ __db: true });
  safeStorage.isEncryptionAvailable.mockReturnValue(true);
});

describe('initStores', () => {
  it('wires the stores under userData, loads the catalog, and registers the password providers', () => {
    initStores();
    expect(CredentialVault.init).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: join('/userData', 'credentials.enc.json') }),
    );
    expect(PreferenceStore.init).toHaveBeenCalledWith({
      filePath: join('/userData', 'preferences.json'),
    });
    expect(initBuiltinManifests).toHaveBeenCalledWith([{ id: 'e1' }]);
    expect(db.initDatabase).toHaveBeenCalled();
    expect(initTrustProfiles).toHaveBeenCalled();
    expect(passwordVault.init).toHaveBeenCalledWith(
      expect.objectContaining({ db: { __db: true } }),
    );
    expect(PasswordProviderRegistry.register).toHaveBeenCalledTimes(2);
  });

  it('skips the password providers when no database is available', () => {
    db.getDb.mockReturnValue(null);
    initStores();
    expect(passwordVault.init).not.toHaveBeenCalled();
    expect(PasswordProviderRegistry.register).not.toHaveBeenCalled();
  });
});

describe('loadExtensionCatalog (via initStores)', () => {
  it('is fatal when the catalog file cannot be read', () => {
    readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => initStores()).toThrow(/Failed to read extension catalog/);
  });

  it('logs each invalid manifest but proceeds with the valid entries', () => {
    loadCatalog.mockReturnValue({ entries: [{ id: 'ok' }], errors: ['bad-1', 'bad-2'] });
    initStores();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(initBuiltinManifests).toHaveBeenCalledWith([{ id: 'ok' }]);
  });

  it('is fatal when the catalog has no valid entries', () => {
    loadCatalog.mockReturnValue({ entries: [], errors: [] });
    let thrown: unknown;
    try {
      initStores();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ statusCode: 500, code: 'catalogEmpty' });
  });
});

describe('safeStorageCrypto', () => {
  it('delegates isAvailable / encrypt / decrypt to safeStorage', () => {
    initStores();
    const crypto = (CredentialVault.init.mock.calls[0]![0] as { crypto: SecretCryptoShape }).crypto;
    expect(crypto.isAvailable()).toBe(true);
    crypto.encrypt('hi');
    crypto.decrypt(Buffer.from('enc:hi'));
    expect(safeStorage.encryptString).toHaveBeenCalledWith('hi');
    expect(safeStorage.decryptString).toHaveBeenCalled();
  });
});

type SecretCryptoShape = {
  isAvailable: () => boolean;
  encrypt: (p: string) => Buffer;
  decrypt: (b: Buffer) => string;
};
