import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `VpnSecrets` — the at-rest store for WireGuard profile material. Pinned: `isAvailable` reflects the
 * OS keychain (false on any failure); `save` refuses to write when encryption is unavailable and
 * otherwise stores the ciphertext at mode 0o600; `pathFor` rejects an invalid connection id; `read`
 * returns null for a missing file or an undecryptable blob (logging the latter); `has` is `read !==
 * null`; and `forget` best-effort-removes the file, logging rather than throwing on failure.
 */

const SECRETS_DIR = join('/userData', 'vpn');

const fs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((): Buffer => {
    throw new Error('ENOENT');
  }),
  rmSync: vi.fn(),
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
vi.mock('@tepegoz/shared-types', () => ({
  isValidConnectionId: (id: string) => /^[a-z0-9-]+$/.test(id),
}));

const VpnSecrets = (await import('./vpn-secrets.electron')).default;

beforeEach(() => {
  vi.clearAllMocks();
  safeStorage.isEncryptionAvailable.mockReturnValue(true);
  fs.readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
});

describe('isAvailable', () => {
  it('mirrors the keychain and is false on any failure', () => {
    expect(VpnSecrets.isAvailable()).toBe(true);
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(VpnSecrets.isAvailable()).toBe(false);
    safeStorage.isEncryptionAvailable.mockImplementation(() => {
      throw new Error('no keychain');
    });
    expect(VpnSecrets.isAvailable()).toBe(false);
  });
});

describe('save', () => {
  it('refuses to write when encryption is unavailable', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(() => VpnSecrets.save('conn-1', '[Interface]')).toThrow(/keychain is unavailable/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('stores the ciphertext at mode 0o600', () => {
    VpnSecrets.save('conn-1', '[Interface]\nPrivateKey=x');
    expect(fs.mkdirSync).toHaveBeenCalledWith(SECRETS_DIR, { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      join(SECRETS_DIR, 'conn-1.enc'),
      Buffer.from('enc:[Interface]\nPrivateKey=x'),
      { mode: 0o600 },
    );
  });

  it('rejects an invalid connection id before touching the disk', () => {
    expect(() => VpnSecrets.save('../evil', 'x')).toThrow(/invalid connection id/);
  });
});

describe('read / has', () => {
  it('returns null for a missing file', () => {
    expect(VpnSecrets.read('conn-1')).toBeNull();
    expect(VpnSecrets.has('conn-1')).toBe(false);
  });

  it('decrypts a stored profile', () => {
    fs.readFileSync.mockReturnValue(Buffer.from('enc:[Interface]'));
    expect(VpnSecrets.read('conn-1')).toBe('[Interface]');
    expect(VpnSecrets.has('conn-1')).toBe(true);
  });

  it('returns null and logs when the blob cannot be decrypted', () => {
    fs.readFileSync.mockReturnValue(Buffer.from('garbage'));
    safeStorage.decryptString.mockImplementation(() => {
      throw new Error('wrong key');
    });
    expect(VpnSecrets.read('conn-1')).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      'Could not decrypt a stored VPN profile',
      expect.objectContaining({ connectionId: 'conn-1' }),
    );
  });
});

describe('forget', () => {
  it('removes the file and logs, swallowing an rm failure', () => {
    VpnSecrets.forget('conn-1');
    expect(fs.rmSync).toHaveBeenCalledWith(join(SECRETS_DIR, 'conn-1.enc'), { force: true });
    expect(logger.info).toHaveBeenCalledWith('Deleted a stored VPN profile', {
      connectionId: 'conn-1',
    });

    fs.rmSync.mockImplementation(() => {
      throw new Error('locked');
    });
    expect(() => VpnSecrets.forget('conn-1')).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      'Could not delete a stored VPN profile',
      expect.objectContaining({ connectionId: 'conn-1' }),
    );
  });
});
