import { randomUUID } from 'node:crypto';
import { AppError } from '@tepegoz/libs';
import {
  AIProviderEnum,
  type AIProvider,
  type ProviderKeyMeta,
  type ProviderKeyStatus,
} from '@tepegoz/shared-types';
import { readJsonFile, writeJsonFile } from '@tepegoz/json-store';
import { VaultMessages } from './messages';

/**
 * BYO-key vault (L7 / electron-desktop-security). API keys are encrypted with the OS keychain
 * (Electron `safeStorage` → Windows DPAPI) and persisted as base64 ciphertext in userData. Raw keys
 * NEVER leave the main process — the renderer only ever learns metadata ({@link ProviderKeyMeta}:
 * id/provider/label/createdAt/last4/model) or per-provider boolean status.
 *
 * Storage is an id-keyed COLLECTION so a provider can hold any number of keys, each with a user label.
 * The on-disk shape is versioned (`{ version: 2, keys: KeyRecord[] }`); a legacy flat map
 * (`{ provider: base64 }`) is upconverted in-place on first load (defensive migration, mirroring
 * `session-store.migrateSnapshot`).
 *
 * The crypto and file path are injected so this core is unit-testable without an Electron runtime;
 * the Electron wiring lives in the desktop app's `stores.electron.ts`.
 */
export interface SecretCrypto {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(blob: Buffer): string;
}

// Re-exported from the canonical definitions in @tepegoz/shared-types (single schema source).
export type { ProviderKeyStatus, ProviderKeyMeta };

/** Current on-disk schema version. Bump + add an upconvert branch in `load()` for future changes. */
const VAULT_VERSION = 2;

/** Label given to a key migrated from the legacy single-slot file; the user can rename it afterwards. */
const MIGRATED_LABEL = 'Imported key';

/** One stored key: metadata + the encrypted secret (base64). `ciphertext` never crosses IPC. */
interface KeyRecord extends ProviderKeyMeta {
  /** base64(ciphertext) — main-process only. */
  ciphertext: string;
}

/** The persisted file shape (v2). */
interface VaultFileV2 {
  version: typeof VAULT_VERSION;
  keys: KeyRecord[];
}

export default class CredentialVault {
  private static crypto: SecretCrypto | null = null;
  private static filePath = '';
  /** The full key collection (across all providers). */
  private static store: KeyRecord[] = [];

  static init(deps: { crypto: SecretCrypto; filePath: string }): void {
    CredentialVault.crypto = deps.crypto;
    CredentialVault.filePath = deps.filePath;
    const raw = readJsonFile(deps.filePath);
    const isV2 =
      typeof raw === 'object' &&
      raw !== null &&
      (raw as { version?: unknown }).version === VAULT_VERSION;
    CredentialVault.store = CredentialVault.load(raw);
    // Upconvert a legacy (unversioned) file to v2 on disk immediately, so subsequent reads are v2.
    if (!isV2 && CredentialVault.store.length > 0) {
      CredentialVault.persist();
    }
  }

  /**
   * Lenient load: v2 files are parsed per-record (malformed/unknown-provider records dropped
   * individually so one bad entry can't discard every key). A legacy flat `{ provider: base64 }` map
   * is upconverted into records (generated id, placeholder label, last4 recovered by a single decrypt
   * when crypto is available). Anything else yields an empty collection.
   */
  private static load(raw: unknown): KeyRecord[] {
    if (typeof raw !== 'object' || raw === null) return [];
    const known = new Set<string>(AIProviderEnum.options);

    if ((raw as { version?: unknown }).version === VAULT_VERSION) {
      const keys = (raw as { keys?: unknown }).keys;
      if (!Array.isArray(keys)) return [];
      const out: KeyRecord[] = [];
      for (const k of keys) {
        const rec = CredentialVault.parseRecord(k, known);
        if (rec !== null) out.push(rec);
      }
      return out;
    }

    // Legacy flat map: { [provider]: base64Ciphertext }
    const out: KeyRecord[] = [];
    for (const [prov, v] of Object.entries(raw as Record<string, unknown>)) {
      if (known.has(prov) && typeof v === 'string') {
        out.push(CredentialVault.migrateLegacy(prov as AIProvider, v));
      }
    }
    return out;
  }

  /** Validate one v2 record; return a normalized KeyRecord or null (dropped) if malformed. */
  private static parseRecord(raw: unknown, known: Set<string>): KeyRecord | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.provider !== 'string' ||
      !known.has(r.provider) ||
      typeof r.label !== 'string' ||
      typeof r.ciphertext !== 'string'
    ) {
      return null;
    }
    return {
      id: r.id,
      provider: r.provider as AIProvider,
      label: r.label,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
      last4: typeof r.last4 === 'string' ? r.last4 : '',
      // Added after v2 shipped: records written before per-key model pinning carry no `model`, and ''
      // is exactly the "auto/tiered routing" value — so an absent field needs no file-version bump.
      model: typeof r.model === 'string' ? r.model : '',
      ciphertext: r.ciphertext,
    };
  }

  /** Wrap a legacy single-slot ciphertext into a v2 record. Recovers `last4` via one decrypt if possible. */
  private static migrateLegacy(provider: AIProvider, ciphertext: string): KeyRecord {
    let last4 = '';
    try {
      if (CredentialVault.crypto?.isAvailable() === true) {
        last4 = CredentialVault.crypto.decrypt(Buffer.from(ciphertext, 'base64')).slice(-4);
      }
    } catch {
      /* leave last4 empty — the key still works; only the fingerprint is unavailable */
    }
    return {
      id: randomUUID(),
      provider,
      label: MIGRATED_LABEL,
      createdAt: Date.now(),
      last4,
      model: '',
      ciphertext,
    };
  }

  /** Test seam. */
  static reset(): void {
    CredentialVault.crypto = null;
    CredentialVault.filePath = '';
    CredentialVault.store = [];
  }

  static isEncryptionAvailable(): boolean {
    return CredentialVault.crypto?.isAvailable() ?? false;
  }

  /**
   * Add a new key for `provider` under `label`. A new key starts on auto (`model: ''`); the model is
   * pinned afterwards, per key, via {@link setKeyModel}. Returns the renderer-safe metadata (no secret).
   */
  static addKey(provider: AIProvider, label: string, apiKey: string): ProviderKeyMeta {
    const p = AIProviderEnum.parse(provider);
    const key = apiKey.trim();
    if (key.length === 0) {
      throw new AppError(VaultMessages.EmptyApiKey, 400);
    }
    const lbl = label.trim();
    if (lbl.length === 0) {
      throw new AppError(VaultMessages.EmptyLabel, 400);
    }
    const crypto = CredentialVault.requireCrypto();
    if (!crypto.isAvailable()) {
      throw new AppError(VaultMessages.EncryptionUnavailable, 503);
    }
    const record: KeyRecord = {
      id: randomUUID(),
      provider: p,
      label: lbl,
      createdAt: Date.now(),
      last4: key.slice(-4),
      model: '',
      ciphertext: crypto.encrypt(key).toString('base64'),
    };
    CredentialVault.store.push(record);
    CredentialVault.persist();
    return CredentialVault.toMeta(record);
  }

  /** Remove the key with `id` (idempotent — removing an unknown id is a no-op). */
  static removeKey(id: string): void {
    const before = CredentialVault.store.length;
    CredentialVault.store = CredentialVault.store.filter((k) => k.id !== id);
    if (CredentialVault.store.length !== before) {
      CredentialVault.persist();
    }
  }

  /** Rename the key with `id`. Throws 404 if no such key. */
  static renameKey(id: string, label: string): void {
    const lbl = label.trim();
    if (lbl.length === 0) {
      throw new AppError(VaultMessages.EmptyLabel, 400);
    }
    const rec = CredentialVault.store.find((k) => k.id === id);
    if (rec === undefined) {
      throw new AppError(VaultMessages.KeyNotFound, 404);
    }
    rec.label = lbl;
    CredentialVault.persist();
  }

  /**
   * Pin the model the key with `id` runs with ('' clears the pin → auto/tiered routing). Throws 404 if
   * no such key. The value is stored verbatim (bounded by the caller's schema); this vault deliberately
   * knows nothing about model catalogs — the IPC boundary validates the id against the provider's list.
   */
  static setKeyModel(id: string, model: string): void {
    const rec = CredentialVault.store.find((k) => k.id === id);
    if (rec === undefined) {
      throw new AppError(VaultMessages.KeyNotFound, 404);
    }
    rec.model = model.trim();
    CredentialVault.persist();
  }

  /**
   * The model pinned on the key a run for `provider` would actually use — that provider's
   * highest-priority key, the SAME record {@link getFirstKeyForProvider} decrypts. `''` when the
   * provider has no key, or its top key is on auto.
   */
  static modelForProvider(provider: AIProvider): string {
    const p = AIProviderEnum.parse(provider);
    return CredentialVault.store.find((k) => k.provider === p)?.model ?? '';
  }

  /**
   * Reorder the whole key collection to match `orderedIds` (drag-and-drop priority). The list ORDER is
   * the source of truth: the first key overall is the default, and the first key of each provider is
   * that provider's active key. Ids not present in `orderedIds` (e.g. a concurrent add) keep their
   * relative order at the end; unknown ids are ignored.
   */
  static reorderKeys(orderedIds: string[]): void {
    const byId = new Map(CredentialVault.store.map((k) => [k.id, k]));
    const next: KeyRecord[] = [];
    const seen = new Set<string>();
    for (const id of orderedIds) {
      const rec = byId.get(id);
      if (rec !== undefined && !seen.has(id)) {
        next.push(rec);
        seen.add(id);
      }
    }
    for (const rec of CredentialVault.store) {
      if (!seen.has(rec.id)) next.push(rec);
    }
    CredentialVault.store = next;
    CredentialVault.persist();
  }

  /** All stored keys' metadata (NO ciphertext), in PRIORITY order (top = default). Safe for the renderer. */
  static listMeta(): ProviderKeyMeta[] {
    return CredentialVault.store.map((k) => CredentialVault.toMeta(k));
  }

  /** Metadata for one provider only, in priority order. */
  static listMetaByProvider(provider: AIProvider): ProviderKeyMeta[] {
    const p = AIProviderEnum.parse(provider);
    return CredentialVault.listMeta().filter((m) => m.provider === p);
  }

  /** The provider of the highest-priority (top) key overall, or null if no keys are stored. */
  static topProvider(): AIProvider | null {
    return CredentialVault.store[0]?.provider ?? null;
  }

  /** Per-provider "has ≥1 key" flags — derived from the collection so old status consumers keep working. */
  static status(): ProviderKeyStatus {
    const out = {} as ProviderKeyStatus;
    for (const p of AIProviderEnum.options) {
      out[p] = CredentialVault.store.some((k) => k.provider === p);
    }
    return out;
  }

  /** MAIN-ONLY: decrypt the key with `id` (e.g. to register a provider). NEVER expose over IPC. */
  static getKeyById(id: string): string | null {
    const rec = CredentialVault.store.find((k) => k.id === id);
    return rec === undefined ? null : CredentialVault.decrypt(rec);
  }

  /** MAIN-ONLY: decrypt the highest-priority (first-in-order) key for `provider`, or null if none. */
  static getFirstKeyForProvider(provider: AIProvider): string | null {
    const p = AIProviderEnum.parse(provider);
    const rec = CredentialVault.store.find((k) => k.provider === p);
    return rec === undefined ? null : CredentialVault.decrypt(rec);
  }

  private static decrypt(rec: KeyRecord): string {
    const crypto = CredentialVault.requireCrypto();
    if (!crypto.isAvailable()) {
      throw new AppError(VaultMessages.DecryptionUnavailable, 503);
    }
    return crypto.decrypt(Buffer.from(rec.ciphertext, 'base64'));
  }

  private static toMeta(rec: KeyRecord): ProviderKeyMeta {
    return {
      id: rec.id,
      provider: rec.provider,
      label: rec.label,
      createdAt: rec.createdAt,
      last4: rec.last4,
      model: rec.model,
    };
  }

  private static requireCrypto(): SecretCrypto {
    if (CredentialVault.crypto === null) {
      throw new AppError(VaultMessages.NotInitialized, 500);
    }
    return CredentialVault.crypto;
  }

  private static persist(): void {
    const file: VaultFileV2 = { version: VAULT_VERSION, keys: CredentialVault.store };
    writeJsonFile(CredentialVault.filePath, file);
  }
}
