import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `ChatSecrets` — the at-rest store for chat account credentials. Pinned: `isAvailable` reflects the
 * OS keychain (false on any failure); `set` refuses to write when encryption is unavailable and
 * otherwise stores the ciphertext at mode 0o600; the `secret_ref` is sanitised to a safe filename;
 * `get` returns null for a missing file or an undecryptable blob (logging the latter); `delete` is
 * best-effort and logs rather than throws.
 */

const SECRETS_DIR = join('/userData', 'chat');

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

const ChatSecrets = (await import('./chat-secrets.electron')).default;

beforeEach(() => {
  vi.clearAllMocks();
  safeStorage.isEncryptionAvailable.mockReturnValue(true);
  fs.readFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
});

describe('isAvailable', () => {
  it('is true when the keychain says so, false on any throw', () => {
    expect(ChatSecrets.isAvailable()).toBe(true);
    safeStorage.isEncryptionAvailable.mockImplementation(() => {
      throw new Error('no keychain');
    });
    expect(ChatSecrets.isAvailable()).toBe(false);
  });
});

describe('set', () => {
  it('encrypts to a sanitised path at mode 0o600', async () => {
    await ChatSecrets.set('chat:work-xmpp', 'pencil');
    expect(fs.mkdirSync).toHaveBeenCalledWith(SECRETS_DIR, { recursive: true });
    const call = fs.writeFileSync.mock.calls[0] as [string, Buffer, { mode: number }] | undefined;
    expect(call?.[0]).toBe(join(SECRETS_DIR, 'chat_work-xmpp.enc'));
    expect(call?.[1].toString()).toBe('enc:pencil');
    expect(call?.[2]).toEqual({ mode: 0o600 });
  });

  it('rejects rather than writing plaintext when encryption is unavailable', async () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    await expect(ChatSecrets.set('ref', 's')).rejects.toThrow(/plain text/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('rejects an empty ref', async () => {
    await expect(ChatSecrets.set('', 's')).rejects.toThrow(/empty/);
  });
});

describe('get', () => {
  it('returns null for a missing file', async () => {
    expect(await ChatSecrets.get('ref')).toBeNull();
  });

  it('decrypts an existing blob', async () => {
    fs.readFileSync.mockReturnValue(Buffer.from('enc:secret'));
    expect(await ChatSecrets.get('ref')).toBe('secret');
  });

  it('returns null and logs when the blob cannot be decrypted', async () => {
    fs.readFileSync.mockReturnValue(Buffer.from('garbage'));
    safeStorage.decryptString.mockImplementation(() => {
      throw new Error('wrong key');
    });
    expect(await ChatSecrets.get('ref')).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('delete', () => {
  it('best-effort removes the file', async () => {
    await ChatSecrets.delete('chat:work');
    expect(fs.rmSync).toHaveBeenCalledWith(join(SECRETS_DIR, 'chat_work.enc'), { force: true });
  });

  it('logs rather than throwing on failure', async () => {
    fs.rmSync.mockImplementation(() => {
      throw new Error('EBUSY');
    });
    await expect(ChatSecrets.delete('ref')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
