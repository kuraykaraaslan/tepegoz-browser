/**
 * Prompt-cache planning (provider-agnostic half).
 *
 * A {@link CanonCacheHint} says which bytes the caller promises are stable. This module decides whether
 * acting on that promise is worth it, which is a separate question: vendors refuse to cache a prefix
 * below a minimum size, and a breakpoint that never hits still pays the cache-**write** premium. The
 * failure mode this guards against is subtle and expensive — caching that is silently costing money.
 *
 * Kept pure and vendor-free so the decision is unit-testable without a client, a key, or a network call.
 */

import type { CanonCacheHint, CanonMessageContent, CanonUsage } from './types';

/**
 * Vendor minimum cacheable prefix, in tokens. Below this the prefix silently does not cache — the
 * request succeeds, the cache counters stay zero, and nothing tells you why.
 */
export const MIN_CACHEABLE_TOKENS = 1024;

/**
 * Characters per token assumed when sizing a prefix without spending a `count_tokens` round-trip.
 *
 * Deliberately on the HIGH side of English prose (~4). Over-estimating the ratio means we demand MORE
 * characters before setting a breakpoint, so the error lands on "did not cache something we could
 * have" rather than "paid the write premium for a prefix too small to cache".
 */
export const ASSUMED_CHARS_PER_TOKEN = 4.5;

/** Minimum prefix size, in characters, before a breakpoint is worth setting. */
export const MIN_CACHEABLE_CHARS = Math.ceil(MIN_CACHEABLE_TOKENS * ASSUMED_CHARS_PER_TOKEN);

/** Size of one canonical content payload, in characters. Blocks are summed by their text-bearing
 *  fields; an image's base64 payload counts because it is exactly what the prefix has to re-send. */
export function contentChars(content: CanonMessageContent): number {
  if (typeof content === 'string') return content.length;
  let n = 0;
  for (const block of content) {
    switch (block.type) {
      case 'text':
        n += block.text.length;
        break;
      case 'image':
        n += block.data.length;
        break;
      case 'tool_use':
        n += block.name.length + JSON.stringify(block.input ?? null).length;
        break;
      case 'tool_result':
        n += block.content.length;
        break;
    }
  }
  return n;
}

/**
 * Is `hint` asking for a message breakpoint at all, and at which index?
 *
 * Returns `null` when the hint is absent, omits the index, or names a negative one — the "nothing is
 * stable yet" state every run starts in, which is normal and not an error.
 */
export function stableMessageIndex(hint: CanonCacheHint | undefined): number | null {
  const index = hint?.lastStableMessageIndex;
  if (index === undefined || !Number.isInteger(index) || index < 0) return null;
  return index;
}

/** Is a prefix of `chars` characters large enough to be worth a breakpoint? */
export function worthCaching(chars: number): boolean {
  return chars >= MIN_CACHEABLE_CHARS;
}

/** The vendor default when a hint does not pin one. */
export function ttlOf(hint: CanonCacheHint | undefined): '5m' | '1h' {
  return hint?.ttl ?? '5m';
}

/**
 * Verdict on whether caching is actually working, for a call where it was requested.
 *
 * `wasted` is the one that matters: tokens were written to the cache and none were ever read back. One
 * such call is normal (somebody has to write the cache first). A *run* of them means a silent
 * invalidator — a mutated prefix, a varying tool set, a timestamp in the system prompt — and the caller
 * is paying the 1.25x write premium for a 0% hit rate.
 */
export interface CacheEffect {
  requested: boolean;
  readTokens: number;
  writeTokens: number;
  /** Wrote to the cache and read nothing back. */
  wasted: boolean;
}

export function cacheEffect(hint: CanonCacheHint | undefined, usage: CanonUsage): CacheEffect {
  const requested =
    hint !== undefined && (hint.systemAndTools === true || stableMessageIndex(hint) !== null);
  const readTokens = usage.cacheReadTokens ?? 0;
  const writeTokens = usage.cacheWriteTokens ?? 0;
  return {
    requested,
    readTokens,
    writeTokens,
    wasted: requested && writeTokens > 0 && readTokens === 0,
  };
}
