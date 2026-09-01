import { prefixDatabase, type HashPrefix, type PrefixDatabase } from '@tepegoz/security-policy';
import { applyHashListDelta, type HashListDelta } from './safe-browsing-v5-client';

/**
 * The on-disk half of the `SafeBrowsingService` ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md)):
 * a locally-held set of four-byte Safe Browsing v5 hash prefixes plus the timestamp of the last
 * successful refresh.
 *
 * This module is deliberately Electron-free and I/O-injected — the `.electron` wiring supplies a real
 * `userData`-backed reader/writer. That keeps every decision that matters testable without a disk:
 * what a corrupt file does (treated as absent), what an empty set does (`database()` returns `null`,
 * which the provider reads as `unknown` — never a false "clear"), and when a refresh is due.
 */

/**
 * The persisted shape. `version` gates a format change; an unknown value is treated as "no database".
 * `1` (no `versionToken`) is still read — a pre-delta file just forces one full refresh — and always
 * rewritten as `2`.
 */
export interface PrefixStoreFile {
  version: 2;
  /** Epoch ms of the last successful refresh. Drives {@link PrefixStore.isStale}. */
  updatedAt: number;
  /**
   * Opaque Safe Browsing list version token from the last successful refresh. Sent back as
   * `?version=` to request an incremental update; absent until the first delta-aware refresh lands.
   */
  versionToken?: string;
  /**
   * Lowercase 8-hex-character prefixes, kept **lexically sorted** — delta removal indices are
   * positions in this order. Anything else in the file is dropped on read.
   */
  prefixes: HashPrefix[];
}

export interface PrefixStoreIo {
  /** Raw file contents, or `null` when the file does not exist. */
  read(): Promise<string | null>;
  /** Persist raw contents. The implementation is expected to write atomically. */
  write(contents: string): Promise<void>;
}

const HEX8 = /^[0-9a-f]{8}$/;

function cleanPrefixes(input: readonly unknown[]): HashPrefix[] {
  const seen = new Set<HashPrefix>();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const lower = value.toLowerCase();
    if (HEX8.test(lower)) seen.add(lower);
  }
  return [...seen].sort();
}

/**
 * Parse persisted contents into a {@link PrefixStoreFile}, or `null` for anything unusable — absent,
 * non-JSON, unknown version, missing/!finite `updatedAt`, or a non-array `prefixes`. A partially
 * valid file keeps its good prefixes and drops the rest rather than failing whole.
 */
export function parsePrefixFile(raw: string | null): PrefixStoreFile | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const rec = data as Record<string, unknown>;
  if (rec.version !== 1 && rec.version !== 2) return null;
  if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) return null;
  if (!Array.isArray(rec.prefixes)) return null;
  const versionToken =
    typeof rec.versionToken === 'string' && rec.versionToken.length > 0
      ? rec.versionToken
      : undefined;
  return {
    version: 2,
    updatedAt: rec.updatedAt,
    ...(versionToken !== undefined ? { versionToken } : {}),
    prefixes: cleanPrefixes(rec.prefixes),
  };
}

export class PrefixStore {
  private file: PrefixStoreFile | null = null;
  private loaded = false;

  constructor(private readonly io: PrefixStoreIo) {}

  /** Read the file once into memory. Safe to call repeatedly; a corrupt file loads as "no database". */
  async load(): Promise<void> {
    this.file = parsePrefixFile(await this.io.read());
    this.loaded = true;
  }

  /**
   * The prefix set for `checkUrl` / `resolveVerdict`, or `null` when nothing usable is stored yet.
   * `null` is the honest answer before the first refresh — the provider maps it to `unknown`, so a
   * missing database never reads as "this URL is clear".
   */
  database(): PrefixDatabase | null {
    if (!this.loaded || this.file === null || this.file.prefixes.length === 0) return null;
    return prefixDatabase(this.file.prefixes);
  }

  /** Epoch ms of the last successful refresh, or `null` if none has completed. */
  updatedAt(): number | null {
    return this.file?.updatedAt ?? null;
  }

  /**
   * The opaque list version token to send on the next refresh for an incremental update, or `null`
   * when none is stored (first launch, or a pre-delta `version: 1` file) — in which case the next
   * refresh is a full one.
   */
  versionToken(): string | null {
    return this.file?.versionToken ?? null;
  }

  /** The held prefixes in their stored lexical order — the ordering delta removal indices refer to. */
  sortedPrefixes(): HashPrefix[] {
    return this.file ? [...this.file.prefixes] : [];
  }

  /** How many prefixes are currently held. */
  count(): number {
    return this.file?.prefixes.length ?? 0;
  }

  /**
   * Whether a refresh is due. Always `true` when nothing has ever been stored, so the first launch
   * always fetches.
   */
  isStale(maxAgeMs: number, now: number): boolean {
    const at = this.updatedAt();
    return at === null || now - at >= maxAgeMs;
  }

  /**
   * Replace the whole set (a full refresh) and persist it, stamping `updatedAt` with `now`. A
   * `versionToken` is stored when the refresh carried one (so the *next* refresh can go incremental);
   * omitting it clears any stored token.
   */
  async replaceAll(
    prefixes: Iterable<HashPrefix>,
    now: number,
    versionToken?: string | null,
  ): Promise<void> {
    const clean = cleanPrefixes([...prefixes]);
    const token = versionToken !== undefined && versionToken !== null ? versionToken : undefined;
    this.file = {
      version: 2,
      updatedAt: now,
      ...(token !== undefined ? { versionToken: token } : {}),
      prefixes: clean,
    };
    this.loaded = true;
    await this.io.write(JSON.stringify(this.file));
  }

  /**
   * Apply an incremental `hashList` update against the stored set. Returns `'applied'` — the new set
   * is persisted and `updatedAt` / the version token stamped — or `'need-full'` when the delta cannot
   * be trusted (an out-of-range removal index, or a checksum mismatch). On `'need-full'` the stored
   * set is left untouched and the caller should fall back to a full refresh.
   */
  async applyDelta(delta: HashListDelta, now: number): Promise<'applied' | 'need-full'> {
    const result = applyHashListDelta(this.sortedPrefixes(), delta);
    if (!result.ok) return 'need-full';
    this.file = {
      version: 2,
      updatedAt: now,
      ...(delta.versionToken !== null ? { versionToken: delta.versionToken } : {}),
      prefixes: result.prefixes,
    };
    this.loaded = true;
    await this.io.write(JSON.stringify(this.file));
    return 'applied';
  }
}
