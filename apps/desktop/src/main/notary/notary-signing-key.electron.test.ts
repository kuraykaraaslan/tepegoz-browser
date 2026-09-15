import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `NotarySigningKeyStore` — the at-rest store for the device's Notary checkpoint-signing key. Pinned:
 * `isAvailable` mirrors the OS keychain (false on any failure); `getOrCreate` returns an existing stored
 * key without regenerating it; it refuses (throws) rather than writing plaintext when the keychain is
 * unavailable and no key exists yet; a genuinely missing file generates + persists a fresh key at mode
 * 0o600; and — the load-bearing case — a stored-but-UNDECRYPTABLE key does NOT get silently replaced,
 * because that would orphan every checkpoint already signed under the old key.
 */

const SECRETS_DIR = join('/userData', 'notary');
const KEY_FILE = join(SECRETS_DIR, 'signing-key.enc');

const fs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((): Buffer => {
    throw new Error('ENOENT');
  }),
  writeFileSync: vi.fn(),
}));
vi.mock('node:fs', () => fs);

const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
  decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, '')),
}));
vi.mock('electron', () => ({ app: { getPath: () => '/userData' }, safeStorage }));
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const generateSigningKeyPair = vi.hoisted(() =>
  vi.fn(() => ({ privateKeyPem: 'PRIV', publicKeyPem: 'PUB' })),
);
vi.mock('@tepegoz/notary', () => ({ generateSigningKeyPair }));

const NotarySigningKeyStore = (await import('./notary-signing-key.electron')).default;

beforeEach(() => {
  vi.clearAllMocks();
  safeStorage.isEncryptionAvailable.mockReturnValue(true);
  fs.readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
});

describe('isAvailable', () => {
  it('mirrors the keychain and is false on any failure', () => {
    expect(NotarySigningKeyStore.isAvailable()).toBe(true);
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(NotarySigningKeyStore.isAvailable()).toBe(false);
    safeStorage.isEncryptionAvailable.mockImplementation(() => {
      throw new Error('no keychain');
    });
    expect(NotarySigningKeyStore.isAvailable()).toBe(false);
  });
});

describe('getOrCreate', () => {
  it('generates and persists a fresh key at mode 0o600 when none is stored yet', () => {
    const pair = NotarySigningKeyStore.getOrCreate();
    expect(pair).toEqual({ privateKeyPem: 'PRIV', publicKeyPem: 'PUB' });
    expect(fs.mkdirSync).toHaveBeenCalledWith(SECRETS_DIR, { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      KEY_FILE,
      Buffer.from(`enc:${JSON.stringify({ privateKeyPem: 'PRIV', publicKeyPem: 'PUB' })}`),
      { mode: 0o600 },
    );
    expect(logger.info).toHaveBeenCalledWith('Generated a new Notary device signing key');
  });

  it('returns the EXISTING stored key rather than generating a new one', () => {
    fs.readFileSync.mockReturnValue(
      Buffer.from(`enc:${JSON.stringify({ privateKeyPem: 'OLD-PRIV', publicKeyPem: 'OLD-PUB' })}`),
    );
    const pair = NotarySigningKeyStore.getOrCreate();
    expect(pair).toEqual({ privateKeyPem: 'OLD-PRIV', publicKeyPem: 'OLD-PUB' });
    expect(generateSigningKeyPair).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('refuses (throws) rather than writing plaintext when the keychain is unavailable and no key exists', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(() => NotarySigningKeyStore.getOrCreate()).toThrow(/keychain is unavailable/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('does NOT silently mint a replacement key when the stored one cannot be decrypted', () => {
    fs.readFileSync.mockReturnValue(Buffer.from('garbage'));
    safeStorage.decryptString.mockImplementationOnce(() => {
      throw new Error('wrong OS user key');
    });
    // Encryption IS available, so a naive implementation would "helpfully" generate a fresh key here —
    // that is exactly the orphaning bug this store exists to avoid.
    expect(() => NotarySigningKeyStore.getOrCreate()).toThrow(/could not be read on this device/);
    expect(generateSigningKeyPair).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Could not decrypt the stored Notary signing key',
      expect.objectContaining({ err: expect.stringContaining('wrong OS user key') as string }),
    );
  });

  it('does NOT silently mint a replacement key for a decrypted-but-malformed stored value either', () => {
    fs.readFileSync.mockReturnValue(Buffer.from(`enc:${JSON.stringify({ not: 'a keypair' })}`));
    expect(() => NotarySigningKeyStore.getOrCreate()).toThrow(/could not be read on this device/);
    expect(generateSigningKeyPair).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Stored Notary signing key is malformed');
  });
});
