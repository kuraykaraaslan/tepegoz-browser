import { AppError } from '@tepegoz/libs';
import { AIProviderEnum, type AIProvider } from '@tepegoz/shared-types';
import { readJsonFile, writeJsonFile } from '../lib/json-store';

/**
 * BYO-key vault (L7 / electron-desktop-security). API keys are encrypted with the OS keychain
 * (Electron `safeStorage` → Windows DPAPI) and persisted as base64 ciphertext in userData. Raw keys
 * NEVER leave the main process — the renderer only ever learns *whether* a key is set (booleans).
 *
 * The crypto and file path are injected so this core is unit-testable without an Electron runtime;
 * the Electron wiring lives in `stores.electron.ts`.
 */
export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(blob: Buffer): string;
}

export type ProviderKeyStatus = Record<AIProvider, boolean>;

export default class CredentialVault {
  private static crypto: SecretCrypto | null = null;
  private static filePath = '';
  /** provider → base64(ciphertext) */
  private static store: Record<string, string> = {};

  static init(deps: { crypto: SecretCrypto; filePath: string }): void {
    CredentialVault.crypto = deps.crypto;
    CredentialVault.filePath = deps.filePath;
    CredentialVault.store = CredentialVault.load(readJsonFile(deps.filePath));
  }

  /**
   * Lenient per-entry load: keep only string ciphertexts for KNOWN providers; drop malformed or
   * unknown entries individually. A single bad/tampered value must NOT discard every stored key
   * (whole-object zod fail-safe would), and stale/unknown provider entries are shed, not re-persisted.
   */
  private static load(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (typeof raw !== 'object' || raw === null) return out;
    const known = new Set<string>(AIProviderEnum.options);
    for (const [k, v] of Object.entries(raw)) {
      if (known.has(k) && typeof v === 'string') {
        out[k] = v;
      }
    }
    return out;
  }

  /** Test seam. */
  static reset(): void {
    CredentialVault.crypto = null;
    CredentialVault.filePath = '';
    CredentialVault.store = {};
  }

  static isEncryptionAvailable(): boolean {
    return CredentialVault.crypto?.isAvailable() ?? false;
  }

  static setKey(provider: AIProvider, apiKey: string): ProviderKeyStatus {
    const p = AIProviderEnum.parse(provider);
    const key = apiKey.trim();
    if (key.length === 0) {
      throw new AppError('API key must not be empty', 400);
    }
    const crypto = CredentialVault.requireCrypto();
    if (!crypto.isAvailable()) {
      throw new AppError('OS encryption is unavailable; cannot store the key securely', 503);
    }
    CredentialVault.store[p] = crypto.encrypt(key).toString('base64');
    CredentialVault.persist();
    return CredentialVault.status();
  }

  static removeKey(provider: AIProvider): ProviderKeyStatus {
    const p = AIProviderEnum.parse(provider);
    if (p in CredentialVault.store) {
      delete CredentialVault.store[p];
      CredentialVault.persist();
    }
    return CredentialVault.status();
  }

  static hasKey(provider: AIProvider): boolean {
    return AIProviderEnum.parse(provider) in CredentialVault.store;
  }

  static status(): ProviderKeyStatus {
    const out = {} as ProviderKeyStatus;
    for (const p of AIProviderEnum.options) {
      out[p] = p in CredentialVault.store;
    }
    return out;
  }

  /** MAIN-ONLY: decrypt a stored key (e.g. to register a provider). NEVER expose this over IPC. */
  static getKey(provider: AIProvider): string | null {
    const p = AIProviderEnum.parse(provider);
    const b64 = CredentialVault.store[p];
    if (b64 === undefined) return null;
    const crypto = CredentialVault.requireCrypto();
    if (!crypto.isAvailable()) {
      throw new AppError('OS encryption is unavailable; cannot read the stored key', 503);
    }
    return crypto.decrypt(Buffer.from(b64, 'base64'));
  }

  private static requireCrypto(): SecretCrypto {
    if (CredentialVault.crypto === null) {
      throw new AppError('Credential vault is not initialized', 500);
    }
    return CredentialVault.crypto;
  }

  private static persist(): void {
    writeJsonFile(CredentialVault.filePath, CredentialVault.store);
  }
}
