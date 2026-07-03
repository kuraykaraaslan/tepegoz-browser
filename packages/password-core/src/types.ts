import type { SecretCrypto } from '@tepegoz/credential-vault';

export type { SecretCrypto };

/** IPC-safe credential metadata — never contains a decrypted password. */
export interface LoginCredentialMeta {
  id: string;
  /** Normalized origin, e.g. `https://example.com` */
  url: string;
  username: string;
  title: string;
  notes: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

/** Full credential with encrypted password — MAIN-PROCESS ONLY, never crosses IPC. */
export interface LoginCredential extends LoginCredentialMeta {
  /** base64(safeStorage.encryptString(plain)) */
  encryptedPassword: string;
}

/** Input for creating/updating a credential. Password is plaintext; vault encrypts on write. */
export interface NewCredential {
  url: string;
  username: string;
  /** Plaintext; the vault encrypts immediately, never stores or returns this. */
  password: string;
  title?: string;
  notes?: string;
}

export type ImportFormat = 'google-csv' | 'generic-csv';
export type ExportFormat = 'google-csv' | 'generic-csv';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AutofillAvailablePayload {
  url: string;
  matches: LoginCredentialMeta[];
}

export interface ProviderCapabilities {
  /** Can create/update/delete credentials. */
  canWrite: boolean;
  /** Supports `import()`. */
  canImport: boolean;
  /** Supports `export()`. */
  canExport: boolean;
  /** Has a live sync connection (e.g. Bitwarden). */
  canSync: boolean;
}

export interface PasswordProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;

  /** Returns metadata list (no passwords). */
  list(): Promise<LoginCredentialMeta[]>;

  /** Returns full credential with encrypted password. MAIN-PROCESS ONLY. */
  findById(id: string): Promise<LoginCredential | null>;

  /** Returns full credentials matching the normalized origin. MAIN-PROCESS ONLY. */
  findByUrl(url: string): Promise<LoginCredential[]>;

  /** Encrypt and persist a new or updated credential. Returns metadata. */
  set(credential: NewCredential): Promise<LoginCredentialMeta>;

  remove(id: string): Promise<void>;

  import?(data: string, format: ImportFormat): Promise<ImportResult>;
  export?(format: ExportFormat): Promise<string>;
}
