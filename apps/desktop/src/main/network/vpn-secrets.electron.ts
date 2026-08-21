import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { Logger } from '@tepegoz/libs';
import { isValidConnectionId } from '@tepegoz/shared-types';

/**
 * The at-rest store for VPN profile material (Phase 5).
 *
 * A WireGuard `.conf` contains a private key: whoever holds it can impersonate the user to their VPN
 * provider for as long as it is valid. Preferences are plain JSON on disk, so the config cannot live
 * there — `networkConnections` keeps only what is safe to show in a list, and the config itself lands
 * here, encrypted through the OS keychain (DPAPI on Windows) exactly like every other secret in this app.
 *
 * **It refuses to write when encryption is unavailable.** Falling back to plaintext "so the feature
 * works" would put a key on disk that the user believes is protected — worse than the feature not
 * working, because they would never find out.
 */

function secretsDir(): string {
  return join(app.getPath('userData'), 'vpn');
}

function pathFor(connectionId: string): string {
  if (!isValidConnectionId(connectionId)) {
    // The id is a filename component here as well as a partition component; the same rule guards both.
    throw new Error(
      `Refusing a secret path for an invalid connection id: ${JSON.stringify(connectionId)}`,
    );
  }
  return join(secretsDir(), `${connectionId}.enc`);
}

const VpnSecrets = {
  /** Is the OS keychain available? The UI asks before offering to import a profile at all. */
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  },

  /** Encrypt and store one connection's config text. Throws rather than degrading to plaintext. */
  save(connectionId: string, text: string): void {
    if (!VpnSecrets.isAvailable()) {
      throw new Error(
        'The OS keychain is unavailable, so a VPN private key cannot be stored safely. Refusing to ' +
          'write it in plain text.',
      );
    }
    const file = pathFor(connectionId);
    mkdirSync(secretsDir(), { recursive: true });
    writeFileSync(file, safeStorage.encryptString(text), { mode: 0o600 });
    Logger.info('Stored an encrypted VPN profile', { connectionId });
  },

  /** The stored config text, or `null` when there is none. Never logs or returns partial plaintext. */
  read(connectionId: string): string | null {
    let blob: Buffer;
    try {
      blob = readFileSync(pathFor(connectionId));
    } catch {
      return null;
    }
    try {
      return safeStorage.decryptString(blob);
    } catch (err) {
      // A profile encrypted under a different OS user/machine key cannot be recovered. Say so instead of
      // handing back garbage that would fail deep inside a tunnel process with an unrelated message.
      Logger.error('Could not decrypt a stored VPN profile', { connectionId, err: String(err) });
      return null;
    }
  },

  has(connectionId: string): boolean {
    return VpnSecrets.read(connectionId) !== null;
  },

  /** Remove a connection's stored config. Part of "remove means remove", alongside the partition wipe. */
  forget(connectionId: string): void {
    try {
      rmSync(pathFor(connectionId), { force: true });
      Logger.info('Deleted a stored VPN profile', { connectionId });
    } catch (err) {
      Logger.error('Could not delete a stored VPN profile', { connectionId, err: String(err) });
    }
  },
};

export default VpnSecrets;
