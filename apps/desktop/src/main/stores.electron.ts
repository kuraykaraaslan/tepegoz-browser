import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { initDatabase } from './db/database.electron';

/**
 * Electron wiring for the main-process stores (the only place that touches `safeStorage`/`app`).
 * The store cores are Electron-free and unit-tested; this file injects the OS keychain + userData path.
 */
const safeStorageCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (blob) => safeStorage.decryptString(blob),
};

/** Initialize stores. Call AFTER `app.whenReady()` — `getPath('userData')` requires a ready app. */
export function initStores(): void {
  const userData = app.getPath('userData');
  CredentialVault.init({
    crypto: safeStorageCrypto,
    filePath: join(userData, 'credentials.enc.json'),
  });
  PreferenceStore.init({ filePath: join(userData, 'preferences.json') });
  initDatabase(); // the SQLite connector (journal + history + kv) under the same user-data dir
}
