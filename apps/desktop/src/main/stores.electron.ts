import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import CredentialVault, { type SecretCrypto } from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import { loadCatalog } from '@tepegoz/extension-catalog';
import { initDatabase, getDb } from './db/database.electron';
import { initTrustProfiles } from './security/trust-profile-host.electron';
import { initBuiltinManifests } from '../shared/extensions';
import { passwordVault } from '@tepegoz/password-vault';
import { PasswordProviderRegistry } from '@tepegoz/password-core';
import { googleCsvProvider } from '@tepegoz/password-provider-google-csv';

/**
 * Electron wiring for the main-process stores (the only place that touches `safeStorage`/`app`).
 * The store cores are Electron-free and unit-tested; this file injects the OS keychain + userData path.
 */
const safeStorageCrypto: SecretCrypto = {
  isAvailable: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (blob) => safeStorage.decryptString(blob),
};

/**
 * Load the built-in extension identity from the on-disk catalog (`resources/extensions.catalog.json`,
 * generated at build/dev time from each extension's manifest) and validate it at this trust boundary.
 * Runs ONCE at startup, before any window opens or any consumer reads the registry, so downstream
 * lookups stay synchronous. A single malformed manifest is skipped-and-logged; a missing/empty catalog
 * is fatal (the app cannot render its toolbar without it).
 */
function loadExtensionCatalog(): void {
  // resources/** ships inside app.asar, so this one path resolves in both dev and packaged builds
  // (mirrors how the brand icon is read in window.ts / index.ts).
  const catalogPath = join(app.getAppPath(), 'resources', 'extensions.catalog.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (err) {
    throw new AppError(
      `Failed to read extension catalog at ${catalogPath} — run "pnpm --filter @tepegoz/desktop generate:catalog" (${String(err)})`,
      500,
    );
  }
  const { entries, errors } = loadCatalog(raw);
  for (const error of errors) {
    Logger.warn('Skipped invalid extension manifest in catalog', { error });
  }
  if (entries.length === 0) {
    throw new AppError('No valid built-in extensions found in the catalog', 500, 'catalogEmpty');
  }
  initBuiltinManifests(entries);
}

/** Initialize stores. Call AFTER `app.whenReady()` — `getPath('userData')` requires a ready app. */
export function initStores(): void {
  const userData = app.getPath('userData');
  CredentialVault.init({
    crypto: safeStorageCrypto,
    filePath: join(userData, 'credentials.enc.json'),
  });
  PreferenceStore.init({ filePath: join(userData, 'preferences.json') });
  // Built-in extension identity: read + validate the catalog before anything reads the registry.
  loadExtensionCatalog();
  initDatabase(); // the SQLite connector (journal + history + kv) under the same user-data dir
  // The Policy Kernel's trust profiles come from that same DB, and must be in place before any tab
  // exists — a decision made in the gap would silently use the default posture for a restricted site.
  initTrustProfiles();
  const db = getDb();
  if (db !== null) {
    passwordVault.init({ crypto: safeStorageCrypto, db });
    PasswordProviderRegistry.register(passwordVault);
    PasswordProviderRegistry.register(googleCsvProvider);
  }
}

export { passwordVault };
