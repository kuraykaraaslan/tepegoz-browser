import type {
  ExportFormat,
  ImportResult,
  LoginCredential,
  LoginCredentialMeta,
  NewCredential,
  PasswordProvider,
  ProviderCapabilities,
} from '@tepegoz/password-core';
import { PasswordProviderRegistry } from '@tepegoz/password-core';
import { parseGoogleCsv, serializeGoogleCsv } from './csv-parser';

/**
 * Google Password Manager CSV interop provider. Read-only on its own — `set()` delegates to the
 * registered `local` vault. This keeps the local vault as the single encrypted storage engine while
 * this provider owns only the import/export data-plane logic.
 */
export class GoogleCsvProvider implements PasswordProvider {
  readonly id = 'google-csv';
  readonly displayName = 'Google Password Manager (CSV)';
  readonly capabilities: ProviderCapabilities = {
    canWrite: false,
    canImport: true,
    canExport: true,
    canSync: false,
  };

  list(): Promise<LoginCredentialMeta[]> {
    return Promise.resolve([]);
  }

  findById(): Promise<LoginCredential | null> {
    return Promise.resolve(null);
  }

  findByUrl(): Promise<LoginCredential[]> {
    return Promise.resolve([]);
  }

  set(credential: NewCredential): Promise<LoginCredentialMeta> {
    const local = PasswordProviderRegistry.get('local');
    if (!local) throw new Error('Local vault not registered');
    return local.set(credential);
  }

  remove(): Promise<void> {
    // No-op: this provider doesn't own any credentials.
    return Promise.resolve();
  }

  async import(data: string): Promise<ImportResult> {
    const rows = parseGoogleCsv(data);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      try {
        await this.set({
          url: row.url,
          username: row.username,
          password: row.password,
          title: row.name,
          notes: row.note,
        });
        result.imported++;
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return result;
  }

  async export(format: ExportFormat): Promise<string> {
    // Decryption lives in the local vault (safeStorage). Delegate entirely so the CSV provider never
    // needs to touch encryption keys.
    const local = PasswordProviderRegistry.get('local');
    if (!local?.export) return serializeGoogleCsv([]);
    return local.export(format);
  }
}

export const googleCsvProvider = new GoogleCsvProvider();
