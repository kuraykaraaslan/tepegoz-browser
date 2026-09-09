import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { ChatSecretStore } from './chat-service';

/**
 * At-rest store for chat account credentials (X-chat.1). A messaging password / OAuth token / SASL
 * secret is exactly the kind of thing preferences (plain JSON) must not hold — `chat_accounts` keeps
 * only `secret_ref` (a key), and the secret itself lands here, encrypted through the OS keychain
 * (DPAPI on Windows), the same as every other secret in this app (mirrors `vpn-secrets.electron.ts`).
 *
 * **It refuses to write when encryption is unavailable** rather than degrading to plaintext — a
 * credential the user believes is protected but is not is worse than the feature not working.
 */

function secretsDir(): string {
  return join(app.getPath('userData'), 'chat');
}

/** `secret_ref` is an opaque key set by the app; sanitise it to a safe filename component. */
function fileFor(secretRef: string): string {
  const safe = secretRef.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
  if (safe.length === 0) throw new Error('Refusing a chat secret path for an empty ref');
  return join(secretsDir(), `${safe}.enc`);
}

function isAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export const ChatSecrets: ChatSecretStore & { isAvailable: () => boolean } = {
  isAvailable,

  get(ref: string): Promise<string | null> {
    let blob: Buffer;
    try {
      blob = readFileSync(fileFor(ref));
    } catch {
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(safeStorage.decryptString(blob));
    } catch (err) {
      Logger.error('Could not decrypt a stored chat credential', { ref, err: String(err) });
      return Promise.resolve(null);
    }
  },

  set(ref: string, plain: string): Promise<void> {
    return Promise.resolve().then(() => {
      const file = fileFor(ref); // throws on an empty ref before anything is touched
      if (!isAvailable()) {
        throw new Error(
          'The OS keychain is unavailable, so a chat credential cannot be stored safely. Refusing ' +
            'to write it in plain text.',
        );
      }
      mkdirSync(secretsDir(), { recursive: true });
      writeFileSync(file, safeStorage.encryptString(plain), { mode: 0o600 });
      Logger.info('Stored an encrypted chat credential', { ref });
    });
  },

  delete(ref: string): Promise<void> {
    try {
      rmSync(fileFor(ref), { force: true });
      Logger.info('Deleted a stored chat credential', { ref });
    } catch (err) {
      Logger.error('Could not delete a stored chat credential', { ref, err: String(err) });
    }
    return Promise.resolve();
  },
};

export default ChatSecrets;
