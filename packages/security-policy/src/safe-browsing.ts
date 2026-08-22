import { createHash } from 'node:crypto';
import { urlExpressions } from './safe-browsing-canonical';

/**
 * Safe Browsing v5 local lookup: **the URL never leaves the machine.**
 *
 * The shape of the guarantee, and why it is a shape rather than a promise:
 *
 *  1. The URL is canonicalized and expanded locally into the ≤30 host/path forms a blocklist could name.
 *  2. Each is SHA-256'd and truncated to its first four bytes.
 *  3. Those four-byte prefixes are looked up in a locally-held set. Nothing is sent.
 *  4. A hit is a MAYBE, not a verdict — four bytes collide by design, which is what makes the next step
 *     private. Resolving it means asking a server for the full hashes that share that prefix; the
 *     request carries the prefix, never the URL, and the comparison happens here.
 *
 * `checkUrl` performs steps 1–3 and returns the prefixes that hit. It has no network access and takes no
 * transport — it *cannot* leak the URL, rather than being trusted not to. Step 4 lives behind
 * {@link resolveFullHashes}, which is handed only prefixes.
 */

/** A 4-byte hash prefix, as 8 lowercase hex characters — the form the local set is keyed by. */
export type HashPrefix = string;

/** A full 32-byte SHA-256, as 64 lowercase hex characters. */
export type FullHash = string;

export const PREFIX_BYTES = 4;

/** SHA-256 of one canonical expression. */
export function fullHash(expression: string): FullHash {
  return createHash('sha256').update(expression, 'utf8').digest('hex');
}

/** The first four bytes of an expression's hash — all that is ever compared locally. */
export function hashPrefix(expression: string): HashPrefix {
  return fullHash(expression).slice(0, PREFIX_BYTES * 2);
}

/** Every prefix a URL could match. Empty for a URL the blocklist does not describe (non-http(s)). */
export function urlHashPrefixes(rawUrl: string): HashPrefix[] {
  const out: HashPrefix[] = [];
  for (const expression of urlExpressions(rawUrl)) {
    const prefix = hashPrefix(expression);
    if (!out.includes(prefix)) out.push(prefix);
  }
  return out;
}

/** The locally-held prefix set. Read-only to the checker: lookup cannot mutate or fetch. */
export interface PrefixDatabase {
  has(prefix: HashPrefix): boolean;
}

/** Build a database from downloaded prefixes. */
export function prefixDatabase(prefixes: Iterable<HashPrefix>): PrefixDatabase {
  const set = new Set<HashPrefix>();
  for (const p of prefixes) set.add(p.toLowerCase());
  return { has: (prefix) => set.has(prefix.toLowerCase()) };
}

export interface LocalCheck {
  /** Prefixes that hit the local set. Empty means definitively safe — no lookup is needed. */
  hits: HashPrefix[];
  /**
   * True when the URL is unequivocally clear of the blocklist without contacting anyone. This is the
   * common case and the reason the design is private in practice, not just in principle.
   */
  clear: boolean;
}

/**
 * Step 1–3. Pure, synchronous, and network-free by construction.
 *
 * Note what is NOT a parameter: any transport, endpoint, or fetch function. This function could not send
 * the URL anywhere if it wanted to, which is a stronger statement than a comment promising it does not.
 */
export function checkUrl(rawUrl: string, db: PrefixDatabase): LocalCheck {
  const hits = urlHashPrefixes(rawUrl).filter((p) => db.has(p));
  return { hits, clear: hits.length === 0 };
}

export type Verdict = 'safe' | 'unsafe' | 'unknown';

/** Asks a server for every full hash sharing a given prefix. Sees prefixes; never a URL. */
export type FullHashFetcher = (prefixes: HashPrefix[]) => Promise<FullHash[]>;

/**
 * Step 4: turn a prefix hit into a verdict.
 *
 * The comparison is local. The server learns only which four-byte buckets were asked about — which, on a
 * list of millions of entries, is shared by a large number of unrelated URLs. That is the entire privacy
 * argument, and it only holds if the caller passes prefixes: the signature makes passing a URL impossible.
 *
 * Fails to `unknown`, never to `safe`. A fetch that errors, times out or is offline must not be reported
 * as a clean bill of health — the caller decides whether to warn, and it needs to know it is guessing.
 */
export async function resolveVerdict(
  rawUrl: string,
  db: PrefixDatabase,
  fetchFullHashes: FullHashFetcher,
): Promise<Verdict> {
  const { hits, clear } = checkUrl(rawUrl, db);
  if (clear) return 'safe';

  let candidates: FullHash[];
  try {
    candidates = await fetchFullHashes(hits);
  } catch {
    return 'unknown';
  }

  const known = new Set(candidates.map((h) => h.toLowerCase()));
  const ours = new Set(urlExpressions(rawUrl).map(fullHash));
  for (const hash of ours) {
    if (known.has(hash)) return 'unsafe';
  }
  // Every hit was a prefix collision: the URL shares four bytes with a listed entry but is not it.
  return 'safe';
}
