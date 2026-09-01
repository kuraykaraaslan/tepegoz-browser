import { prefixDatabase, type HashPrefix, type PrefixDatabase } from '@tepegoz/security-policy';

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

/** The persisted shape. `version` gates a future format change; a mismatch is treated as "no database". */
export interface PrefixStoreFile {
  version: 1;
  /** Epoch ms of the last successful refresh. Drives {@link PrefixStore.isStale}. */
  updatedAt: number;
  /** Lowercase 8-hex-character prefixes. Anything else in the file is dropped on read. */
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
  return [...seen];
}

/**
 * Parse persisted contents into a {@link PrefixStoreFile}, or `null` for anything unusable — absent,
 * non-JSON, wrong version, missing/!finite `updatedAt`, or a non-array `prefixes`. A partially valid
 * file keeps its good prefixes and drops the rest rather than failing whole.
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
  if (rec.version !== 1) return null;
  if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) return null;
  if (!Array.isArray(rec.prefixes)) return null;
  return { version: 1, updatedAt: rec.updatedAt, prefixes: cleanPrefixes(rec.prefixes) };
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

  /** Replace the whole set (a full refresh) and persist it, stamping `updatedAt` with `now`. */
  async replaceAll(prefixes: Iterable<HashPrefix>, now: number): Promise<void> {
    const clean = cleanPrefixes([...prefixes]);
    this.file = { version: 1, updatedAt: now, prefixes: clean };
    this.loaded = true;
    await this.io.write(JSON.stringify(this.file));
  }
}
