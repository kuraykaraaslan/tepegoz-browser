/**
 * Did prompt caching actually work on this sweep?
 *
 * A sweep must be able to PROVE this rather than assume it. Caching is a prefix match, so a caller that
 * rewrites any byte before its breakpoint writes the cache on every call and reads it back on none. The
 * requests still succeed and the answers are still right — the only symptom is a bill that is HIGHER
 * than with no caching at all, because cache writes carry a premium.
 *
 * That makes "we turned caching on" an unfalsifiable claim unless the counters are reported. This module
 * turns them into a verdict the sweep report states out loud.
 */

import type { EvalTokenUsage } from '@tepegoz/orchestrator';

/**
 * Fraction of cached input that was READ rather than written. Above this, caching is paying for itself;
 * below it, the write premium is eating the discount.
 *
 * 0.5 is deliberately undemanding — a healthy agent loop reads its prefix back on every step after the
 * first, so real hit ratios sit far above it. The bar is set to catch "broken", not to grade "good".
 */
export const HEALTHY_READ_RATIO = 0.5;

export type CacheVerdict =
  /** No cached tokens at all — caching was off, unsupported, or every prefix was below the vendor
   *  minimum. Not a failure; just nothing to report. */
  | 'not-used'
  /** Wrote the cache and read nothing back. A silent invalidator; costing money. */
  | 'wasted'
  /** Reading less than it writes. Working, but not enough to pay for itself. */
  | 'weak'
  | 'healthy';

export interface CacheHealth {
  verdict: CacheVerdict;
  readTokens: number;
  writeTokens: number;
  /** reads / (reads + writes); 0 when nothing was cached. */
  readRatio: number;
}

export function cacheHealth(usage: EvalTokenUsage): CacheHealth {
  const readTokens = usage.cacheReadTokens;
  const writeTokens = usage.cacheWriteTokens;
  const cached = readTokens + writeTokens;
  if (cached === 0) return { verdict: 'not-used', readTokens, writeTokens, readRatio: 0 };
  const readRatio = readTokens / cached;
  if (readTokens === 0) return { verdict: 'wasted', readTokens, writeTokens, readRatio };
  const verdict: CacheVerdict = readRatio >= HEALTHY_READ_RATIO ? 'healthy' : 'weak';
  return { verdict, readTokens, writeTokens, readRatio };
}

/** One report line. Deliberately blunt on the failing verdicts — a wasted cache is the kind of thing
 *  that survives for months precisely because nothing ever said it out loud. */
export function cacheHealthLine(health: CacheHealth): string {
  const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;
  const counts = `${health.readTokens.toLocaleString('en-US')} read / ${health.writeTokens.toLocaleString('en-US')} written`;
  switch (health.verdict) {
    case 'not-used':
      return 'prompt cache: not used (no cached tokens reported — caching off, unsupported, or every prefix below the vendor minimum)';
    case 'wasted':
      return `prompt cache: WASTED — ${counts}, 0% hit. A prefix is being invalidated; this costs MORE than no caching.`;
    case 'weak':
      return `prompt cache: weak — ${counts}, ${pct(health.readRatio)} of cached tokens were reads (below the ${pct(HEALTHY_READ_RATIO)} bar).`;
    case 'healthy':
      return `prompt cache: healthy — ${counts}, ${pct(health.readRatio)} of cached tokens were reads.`;
  }
}
