import type { FullHash, FullHashFetcher, HashPrefix } from '@tepegoz/security-policy';

/**
 * The network half of the `SafeBrowsingService` ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md)):
 * step 4, full-hash resolution, spoken **directly to Google Safe Browsing v5** from the main process.
 *
 * What the ADR requires of this transport, enforced here:
 *  - the request carries **hash prefixes and the API key only** — no cookies, no session, no
 *    identifying headers beyond a fixed product `User-Agent`;
 *  - it is a bare `fetch`, injected, so a test can assert exactly what crosses the wire;
 *  - with **no API key configured** {@link createFullHashFetcher} returns `null`, which the
 *    `SafeBrowsingProvider` treats as "no transport" → every prefix hit resolves to `unknown`. The
 *    feature is therefore inert until a key is provisioned, regardless of code completeness.
 *
 * Wire format targets Safe Browsing API v5 `hashes:search`
 * (`GET https://safebrowsing.googleapis.com/v5alpha1/hashes:search`). Verify the request/response
 * shape against current Google documentation before a key is provisioned and the service is enabled.
 */

const SB_V5_ENDPOINT = 'https://safebrowsing.googleapis.com/v5alpha1/hashes:search';
const PRODUCT_UA = 'tepegoz-browser SafeBrowsing/1';

/** Threat types we treat as a block. Anything else in a response is ignored. */
const BLOCKING_THREAT_TYPES = new Set([
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
]);

/** Minimal `fetch` surface — just what this client uses. Injected so the wire is assertable in tests. */
export type FetchLike = (
  url: string,
  init: { method: 'GET'; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface FullHashFetcherConfig {
  /** The Safe Browsing API key. Empty / undefined → {@link createFullHashFetcher} returns `null`. */
  apiKey: string | undefined;
  fetchImpl: FetchLike;
  /** Per-request timeout. Default 8s — a slow list lookup must not stall a navigation. */
  timeoutMs?: number;
}

function hexToBase64Url(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64url');
}

function base64ToHex(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, 'base64');
    return buf.length === 32 ? buf.toString('hex') : null;
  } catch {
    return null;
  }
}

/**
 * Pull the blocking full hashes out of a v5 `hashes:search` response, as 64-hex-character strings
 * (the form `resolveVerdict` compares against). Tolerant of shape drift: a missing field, an
 * unexpected type, or a non-blocking threat type is skipped, not thrown on.
 */
export function parseHashesSearchResponse(json: unknown): FullHash[] {
  if (typeof json !== 'object' || json === null) return [];
  const list = (json as Record<string, unknown>).fullHashes;
  if (!Array.isArray(list)) return [];
  const out: FullHash[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.fullHash !== 'string') continue;
    const details = Array.isArray(rec.fullHashDetails) ? rec.fullHashDetails : [];
    const blocks = details.some(
      (d) =>
        typeof d === 'object' &&
        d !== null &&
        BLOCKING_THREAT_TYPES.has(String((d as Record<string, unknown>).threatType)),
    );
    if (!blocks) continue;
    const hex = base64ToHex(rec.fullHash);
    if (hex !== null && !out.includes(hex)) out.push(hex);
  }
  return out;
}

/** Build the `hashes:search` URL for a set of prefixes. Prefixes go on the query string; the key too. */
export function hashesSearchUrl(prefixes: readonly HashPrefix[], apiKey: string): string {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  for (const prefix of prefixes) params.append('hashPrefixes', hexToBase64Url(prefix));
  return `${SB_V5_ENDPOINT}?${params.toString()}`;
}

/**
 * A {@link FullHashFetcher} bound to Google Safe Browsing v5, or `null` when no API key is set. The
 * returned function is what `resolveVerdict` calls — it is handed four-byte prefixes and returns full
 * hashes; it never sees a URL.
 */
export function createFullHashFetcher(config: FullHashFetcherConfig): FullHashFetcher | null {
  const apiKey = config.apiKey?.trim();
  if (apiKey === undefined || apiKey.length === 0) return null;
  const timeoutMs = config.timeoutMs ?? 8_000;

  return async (prefixes: HashPrefix[]): Promise<FullHash[]> => {
    if (prefixes.length === 0) return [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await config.fetchImpl(hashesSearchUrl(prefixes, apiKey), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': PRODUCT_UA },
        signal: controller.signal,
      });
      if (!res.ok) {
        // A 4xx/5xx is a lookup failure, not a verdict. Throw so `resolveVerdict` catches it and
        // reports `unknown` — never a silent "safe".
        throw new Error(`Safe Browsing v5 hashes:search returned ${res.status}`);
      }
      return parseHashesSearchResponse(await res.json());
    } finally {
      clearTimeout(timer);
    }
  };
}

// --- Prefix-list fetch (the local database's contents) -------------------------------------------

const SB_V5_LIST_ENDPOINT = 'https://safebrowsing.googleapis.com/v5alpha1/hashList';
/**
 * The lists we mirror locally. These are the standard client-side lists; the exact names must be
 * confirmed against current Safe Browsing v5 documentation before a key is provisioned.
 */
export const MIRRORED_LISTS = ['gc-4-byte-prefixes'] as const;

/**
 * Little-endian bit reader over a byte buffer — bit 0 is the LSB of byte 0, which is the order Safe
 * Browsing's Rice-Golomb payloads are packed in.
 */
class BitReader {
  private bit = 0;
  constructor(private readonly buf: Buffer) {}
  /** Read `n` (0..32) bits as an unsigned integer, or `null` past the end. */
  read(n: number): number | null {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bit >>> 3;
      if (byte >= this.buf.length) return null;
      const b = (this.buf[byte]! >>> (this.bit & 7)) & 1;
      value |= b << i;
      this.bit++;
    }
    return value >>> 0;
  }
  /** Unary prefix: count the 1-bits up to the terminating 0. `null` past the end. */
  readUnary(): number | null {
    let q = 0;
    for (;;) {
      const b = this.read(1);
      if (b === null) return null;
      if (b === 0) return q;
      q++;
    }
  }
}

/**
 * Decode a Safe Browsing Rice-Golomb-coded delta list into ascending uint32 values.
 * `first` is the initial value; each subsequent value is the previous plus a delta whose quotient is
 * unary-coded and whose low `k` bits follow. `count` deltas are expected. Returns `null` on truncation.
 */
export function decodeRiceDeltas(
  first: number,
  k: number,
  count: number,
  data: Buffer,
): number[] | null {
  const out = [first >>> 0];
  const reader = new BitReader(data);
  let prev = first >>> 0;
  for (let i = 0; i < count; i++) {
    const q = reader.readUnary();
    if (q === null) return null;
    const r = k === 0 ? 0 : reader.read(k);
    if (r === null) return null;
    const delta = (q * 2 ** k + r) >>> 0;
    prev = (prev + delta) >>> 0;
    out.push(prev);
  }
  return out;
}

function u32ToPrefixHex(value: number): HashPrefix {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b.toString('hex');
}

/**
 * Pull four-byte hash prefixes out of a v5 `hashList.get` body. `additionsFourBytes` carries the
 * additions either as a plain base64 blob of concatenated 4-byte prefixes (`rawHashes`) or
 * Rice-Golomb-coded deltas (`riceParameter` + `firstValue` + `entriesCount` + `encodedData`). Both
 * are handled; a malformed or truncated payload yields `[]`, which the caller treats as "keep the
 * previous set". Delta application against a stored version number is still owed — this returns the
 * additions only.
 */
export function parseHashListResponse(json: unknown): HashPrefix[] {
  if (typeof json !== 'object' || json === null) return [];
  const additions = (json as Record<string, unknown>).additionsFourBytes;
  if (typeof additions !== 'object' || additions === null) return [];
  const rec = additions as Record<string, unknown>;

  if (rec.riceParameter !== undefined) {
    const k = typeof rec.riceParameter === 'number' ? rec.riceParameter : NaN;
    const first =
      typeof rec.firstValue === 'number'
        ? rec.firstValue
        : typeof rec.firstValue === 'string'
          ? Number(rec.firstValue)
          : NaN;
    const count =
      typeof rec.entriesCount === 'number'
        ? rec.entriesCount
        : typeof rec.entriesCount === 'string'
          ? Number(rec.entriesCount)
          : NaN;
    if (!Number.isInteger(k) || k < 0 || k > 32 || !Number.isFinite(first) || !Number.isInteger(count) || count < 0) {
      return [];
    }
    if (typeof rec.encodedData !== 'string') return [];
    let data: Buffer;
    try {
      data = Buffer.from(rec.encodedData, 'base64');
    } catch {
      return [];
    }
    const values = decodeRiceDeltas(first, k, count, data);
    if (values === null) return [];
    const seen = new Set<HashPrefix>();
    for (const v of values) seen.add(u32ToPrefixHex(v));
    return [...seen];
  }

  if (typeof rec.rawHashes !== 'string') return [];
  let buf: Buffer;
  try {
    buf = Buffer.from(rec.rawHashes, 'base64');
  } catch {
    return [];
  }
  if (buf.length % 4 !== 0) return [];
  const out: HashPrefix[] = [];
  for (let i = 0; i < buf.length; i += 4) out.push(buf.toString('hex', i, i + 4));
  return out;
}

export function hashListUrl(listName: string, apiKey: string): string {
  const params = new URLSearchParams({ key: apiKey, name: listName });
  return `${SB_V5_LIST_ENDPOINT}?${params.toString()}`;
}

/** Fetches the full four-byte prefix set for {@link MIRRORED_LISTS}, or `null` with no API key. */
export function createPrefixListFetcher(
  config: FullHashFetcherConfig,
): (() => Promise<HashPrefix[]>) | null {
  const apiKey = config.apiKey?.trim();
  if (apiKey === undefined || apiKey.length === 0) return null;
  const timeoutMs = config.timeoutMs ?? 30_000;

  return async (): Promise<HashPrefix[]> => {
    const all = new Set<HashPrefix>();
    for (const name of MIRRORED_LISTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await config.fetchImpl(hashListUrl(name, apiKey), {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': PRODUCT_UA },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Safe Browsing v5 hashList "${name}" returned ${res.status}`);
        for (const prefix of parseHashListResponse(await res.json())) all.add(prefix);
      } finally {
        clearTimeout(timer);
      }
    }
    return [...all];
  };
}
