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
