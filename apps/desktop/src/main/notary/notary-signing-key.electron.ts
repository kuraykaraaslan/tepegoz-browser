import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { Logger } from '@tepegoz/libs';
import { generateSigningKeyPair, type SigningKeyPair } from '@tepegoz/notary';

/**
 * The at-rest store for the device's Notary checkpoint-signing key (Phase 7 — key custody is
 * deliberately out of `@tepegoz/notary` itself; see `checkpoint.ts`'s module doc). Encrypted through
 * the OS keychain (DPAPI on Windows), the same as every other secret in this app (mirrors
 * `vpn-secrets.electron.ts` / `chat-secrets.electron.ts`) — **it refuses to write when encryption is
 * unavailable** rather than degrading to plaintext.
 *
 * One key for the device's lifetime: every checkpoint a receipt carries is only as trustworthy as the
 * key that signed it staying stable, so nothing here rotates or regenerates a key that already exists —
 * `getOrCreate` only ever GENERATES on a genuinely missing file, never to paper over a decrypt failure
 * (e.g. the OS user/machine key changed). Silently minting a replacement there would orphan every
 * checkpoint already signed under the old key without saying so.
 */

function secretsDir(): string {
  return join(app.getPath('userData'), 'notary');
}

function keyFile(): string {
  return join(secretsDir(), 'signing-key.enc');
}

function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function isSigningKeyPair(v: unknown): v is SigningKeyPair {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).privateKeyPem === 'string' &&
    typeof (v as Record<string, unknown>).publicKeyPem === 'string'
  );
}

/**
 * Three outcomes, kept distinct on purpose: 'missing' is the ordinary first-run case (generate one);
 * 'corrupt' means a file IS there but this device cannot make sense of it (wrong OS user/machine key,
 * truncated write, a future format this build doesn't understand) — `getOrCreate` must never treat that
 * the same as 'missing', or it would silently mint a replacement key and orphan every checkpoint already
 * signed under the old one.
 */
type StoredKeyResult =
  { status: 'missing' } | { status: 'corrupt' } | { status: 'ok'; pair: SigningKeyPair };

function readStored(): StoredKeyResult {
  let blob: Buffer;
  try {
    blob = readFileSync(keyFile());
  } catch {
    return { status: 'missing' };
  }
  try {
    const parsed: unknown = JSON.parse(safeStorage.decryptString(blob));
    if (isSigningKeyPair(parsed)) return { status: 'ok', pair: parsed };
    Logger.error('Stored Notary signing key is malformed');
    return { status: 'corrupt' };
  } catch (err) {
    Logger.error('Could not decrypt the stored Notary signing key', { err: String(err) });
    return { status: 'corrupt' };
  }
}

const NotarySigningKeyStore = {
  /** Is the OS keychain available? A caller may check this before offering anything that would need a
   *  fresh key, to fail with a clear reason rather than a thrown error deep in a checkpoint flow. */
  isAvailable,

  /**
   * The device's Ed25519 checkpoint-signing key, generating and persisting one on first use. Throws when
   * the OS keychain is unavailable and no key exists yet — refuse, never fall back to plaintext. Also
   * throws (rather than silently minting a replacement) when a stored key is present but unreadable —
   * see {@link StoredKeyResult}. Returns the SAME key on every later call this device ever makes.
   */
  getOrCreate(): SigningKeyPair {
    const stored = readStored();
    if (stored.status === 'ok') return stored.pair;
    if (stored.status === 'corrupt') {
      throw new Error(
        'The stored Notary signing key could not be read on this device. Refusing to generate a ' +
          'replacement — that would silently invalidate every checkpoint already signed under it.',
      );
    }
    if (!isAvailable()) {
      throw new Error(
        'The OS keychain is unavailable, so a Notary signing key cannot be created safely. Refusing ' +
          'to write it in plain text.',
      );
    }
    const fresh = generateSigningKeyPair();
    mkdirSync(secretsDir(), { recursive: true });
    writeFileSync(keyFile(), safeStorage.encryptString(JSON.stringify(fresh)), { mode: 0o600 });
    Logger.info('Generated a new Notary device signing key');
    return fresh;
  },
};

export default NotarySigningKeyStore;
