/**
 * Credential + login-manager wire types for the desktop IPC contract. Preload-safe: no
 * @tepegoz/password-core import (the sandboxed preload stays dependency-free); the login types mirror
 * password-core/src/types.ts. Provider key metadata is owned by @tepegoz/shared-types (zod-free).
 */
import type { ProviderKeyMeta, ProviderKeyStatus } from '@tepegoz/shared-types/providers';

export interface CredentialsStatus {
  /** Whether the OS keychain (safeStorage) can encrypt on this device. */
  encryptionAvailable: boolean;
  /** Per-provider "has ≥1 key" flags (kept for existing consumers; derived from `keys`). */
  providers: ProviderKeyStatus;
  /** Every stored key's metadata (NO secret; `last4` is a non-secret fingerprint). Any number per provider. */
  keys: ProviderKeyMeta[];
  /**
   * Selectable service regions for the few providers whose API has more than one endpoint (e.g. `xai`
   * regional clusters, `kimi` global vs. China) — provider id → `{ id, label }` options, first is the
   * default. Single-endpoint providers are absent (the picker renders nothing for them). The endpoint
   * URL each id resolves to stays main-side; the renderer only persists the chosen `id` per key.
   */
  regions: Record<string, ReadonlyArray<{ id: string; label: string }>>;
}

// Login credential manager — preload-safe inline types (no @tepegoz/password-core import so the
// sandboxed preload stays dependency-free). These mirror the types in password-core/src/types.ts.
export interface LoginCredentialMeta {
  id: string;
  url: string;
  username: string;
  title: string;
  notes: string;
  providerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface LoginImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface AutofillAvailablePayload {
  url: string;
  matches: LoginCredentialMeta[];
}
