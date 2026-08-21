import { AppError } from '@tepegoz/libs';
import type { Db } from '@tepegoz/persistence';
import type {
  LoginCredential,
  LoginCredentialMeta,
  NewCredential,
  PasswordProvider,
  ProviderCapabilities,
  ImportResult,
  SecretCrypto,
} from '@tepegoz/password-core';
import { normalizeOrigin } from '@tepegoz/password-core';
import { PasswordStore } from './password-store';
import { VaultMessages } from './messages';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Local encrypted password vault. Implements `PasswordProvider`; encrypted via an injected
 * `SecretCrypto` (Electron `safeStorage`/DPAPI in the desktop app) and persisted in SQLite.
 * Raw passwords NEVER leave this class — the `findById`/`findByUrl` methods are main-process
 * only and never exposed over IPC.
 */
export class PasswordVault implements PasswordProvider {
  readonly id = 'local';
  readonly displayName = 'Local Vault';
  readonly capabilities: ProviderCapabilities = {
    canWrite: true,
    canImport: true,
    canExport: true,
    canSync: false,
  };

  private crypto: SecretCrypto | null = null;
  private db: Db | null = null;

  /** Must be called once at app startup (in stores.electron.ts). */
  init(deps: { crypto: SecretCrypto; db: Db }): void {
    this.crypto = deps.crypto;
    this.db = deps.db;
  }

  /** Test seam. */
  reset(): void {
    this.crypto = null;
    this.db = null;
  }

  list(): Promise<LoginCredentialMeta[]> {
    return Promise.resolve(PasswordStore.list(this.requireDb()));
  }

  findById(id: string): Promise<LoginCredential | null> {
    return Promise.resolve(PasswordStore.findById(this.requireDb(), id));
  }

  findByUrl(url: string): Promise<LoginCredential[]> {
    return Promise.resolve(PasswordStore.findByUrl(this.requireDb(), normalizeOrigin(url)));
  }

  set(credential: NewCredential): Promise<LoginCredentialMeta> {
    const { url, username, password, title = '', notes = '' } = credential;
    if (!url.trim()) throw new AppError(VaultMessages.EmptyUrl, 400);
    if (!username.trim()) throw new AppError(VaultMessages.EmptyUsername, 400);
    if (!password) throw new AppError(VaultMessages.EmptyPassword, 400);

    const crypto = this.requireCrypto();
    if (!crypto.isAvailable()) throw new AppError(VaultMessages.EncryptionUnavailable, 503);

    const origin = normalizeOrigin(url);
    const encryptedPw = crypto.encrypt(password).toString('base64');
    const now = Date.now();

    const existing = PasswordStore.findByUrl(this.requireDb(), origin).find(
      (c) => c.username === username.trim(),
    );

    const id = existing?.id ?? uuid();

    PasswordStore.upsert(this.requireDb(), {
      id,
      url: origin,
      username: username.trim(),
      title,
      notes,
      encryptedPw,
      providerId: this.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return Promise.resolve({
      id,
      url: origin,
      username: username.trim(),
      title,
      notes,
      providerId: this.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  remove(id: string): Promise<void> {
    PasswordStore.remove(this.requireDb(), id);
    return Promise.resolve();
  }

  /** Decrypt a stored password. MAIN-PROCESS ONLY — never call from IPC handlers. */
  decrypt(credential: LoginCredential): string {
    const crypto = this.requireCrypto();
    if (!crypto.isAvailable()) throw new AppError(VaultMessages.DecryptionUnavailable, 503);
    return crypto.decrypt(Buffer.from(credential.encryptedPassword, 'base64'));
  }

  async import(data: string): Promise<ImportResult> {
    const lines = data.split('\n').filter(Boolean);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const header = lines[0]?.toLowerCase() ?? '';
    const hasHeader =
      header.includes('name') || header.includes('url') || header.includes('username');
    const rows = hasHeader ? lines.slice(1) : lines;

    for (const line of rows) {
      try {
        const cols = parseCsvLine(line);
        const [name, url, username, password] = cols;
        if (!url || !username || !password) {
          result.skipped++;
          continue;
        }
        await this.set({ url, username, password, title: name ?? '' });
        result.imported++;
      } catch (err) {
        result.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    return result;
  }

  export(): Promise<string> {
    const all = PasswordStore.list(this.requireDb());
    const lines: string[] = ['name,url,username,password,note'];

    for (const meta of all) {
      const full = PasswordStore.findById(this.requireDb(), meta.id);
      if (!full) continue;
      const plain = this.decrypt(full);
      lines.push(
        [
          csvEscape(meta.title),
          csvEscape(meta.url),
          csvEscape(meta.username),
          csvEscape(plain),
          csvEscape(meta.notes),
        ].join(','),
      );
    }
    return Promise.resolve(lines.join('\n'));
  }

  private requireDb(): Db {
    if (!this.db) throw new AppError(VaultMessages.NotInitialized, 500);
    return this.db;
  }

  private requireCrypto(): SecretCrypto {
    if (!this.crypto) throw new AppError(VaultMessages.NotInitialized, 500);
    return this.crypto;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const passwordVault = new PasswordVault();
