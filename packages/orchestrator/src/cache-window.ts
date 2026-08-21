/**
 * Which slice of the Reactor's message array is safe to prompt-cache.
 *
 * The Reactor keeps its history compact by collapsing superseded blobs **in place**: when a new
 * page-state arrives the previous one becomes a placeholder, and the same happens to the typed working
 * ledger. That is good for tokens and fatal for a naively-placed cache breakpoint, because caching is a
 * prefix match — one rewritten byte before the breakpoint invalidates it, and the request then pays the
 * cache-write premium while reading nothing back.
 *
 * Split out as a pure function so the rule is stated once, unit-tested against the exact mutation
 * pattern it guards, and impossible to get subtly wrong at a second call site.
 */

/**
 * The last index that no future step will rewrite, given the two indices the Reactor may still mutate.
 *
 * Returns `null` when nothing qualifies yet — the normal state of the first step or two, not an error.
 *
 * @param lastStateIndex     index of the live (not yet collapsed) page-state message, or `null`
 * @param workingStateIndex  index of the live typed working-ledger message, or `null`
 */
export function stableIndexBefore(
  lastStateIndex: number | null,
  workingStateIndex: number | null,
): number | null {
  const mutable: number[] = [];
  if (lastStateIndex !== null) mutable.push(lastStateIndex);
  if (workingStateIndex !== null) mutable.push(workingStateIndex);
  // Nothing is mutable yet, so nothing is provably stable either: the messages present now are the ones
  // about to BECOME the collapsible pair. Claiming stability here would be the exact off-by-one this
  // module exists to prevent.
  if (mutable.length === 0) return null;
  const stable = Math.min(...mutable) - 1;
  return stable >= 0 ? stable : null;
}
