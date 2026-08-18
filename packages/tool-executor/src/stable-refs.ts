/**
 * Identity-stable ref assignment (S2 PR1) — pure, so it is unit-testable and Electron-free.
 *
 * ## The identity formula, and why it is not what the phase doc first proposed
 *
 * The phase sketched `ref = hash(tag + role + accessible name + structural path)`. Including the
 * structural path defeats the property being bought: `ref-stability-across-rerender` rebuilds the list
 * at a new nesting depth in reverse order, so every path changes while nothing about the elements does.
 * A path-inclusive hash would renumber all of them — exactly the failure the phase exists to fix.
 *
 * So identity is **content-first**: `tag | role | accessible name | href`. Duplicate controls (three
 * "Add to cart" buttons) collide by construction, which is handled explicitly rather than hashed away:
 * an occurrence suffix (`#0`, `#1`, …) separates them in document order. Two identical controls that
 * swap places therefore swap refs — accepted, because nothing distinguishes them to a *human* reader
 * either, and the alternative (path in the key) breaks the common case to fix a rare one.
 *
 * ## The degraded mode
 *
 * A site that regenerates its DOM wholesale with new labels defeats any content identity. When the
 * carry-over rate falls below {@link MIN_CARRY_OVER_RATE} the snapshot is treated as a different page:
 * the registry resets and refs go positional again. That is the honest outcome — stability was already
 * impossible — and it is reported so the caller can stop claiming refs are stable.
 */

/** Below this share of keys carried over from the previous snapshot, identity is not achievable. */
export const MIN_CARRY_OVER_RATE = 0.3;

/** Per-tab, per-page assignment state. Reset on navigation, or on a wholesale-rewrite degradation. */
export interface RefRegistry {
  /** The page these refs belong to — a different URL is a different ref space. */
  url: string;
  /** identity key → the ref number that element has held for this page. */
  byKey: Map<string, number>;
  /** Next unused ref number. Monotonic within a page so a retired element's number is never recycled. */
  next: number;
}

export function createRefRegistry(url: string): RefRegistry {
  return { url, byKey: new Map(), next: 1 };
}

/**
 * Add an occurrence suffix so duplicate content keys stay distinguishable. Document order decides which
 * duplicate is `#0`, which keeps the assignment deterministic for identical inputs.
 */
export function disambiguate(contentKeys: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return contentKeys.map((key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${String(n)}`;
  });
}

export interface RefAssignment {
  /** `refs[i]` is the ref for node `i` — 1-based, stable across snapshots, NOT contiguous. */
  refs: number[];
  /** Share of this snapshot's keys that were already known. 1 = nothing moved; 0 = a new page. */
  carryOverRate: number;
  /** True when the carry-over rate forced a reset and refs fell back to positional for this snapshot. */
  degraded: boolean;
}

/**
 * Assign a ref to every node, reusing the number an identity already holds. Mutates `registry` — it is
 * the per-tab carry-over state, and rebuilding it per snapshot is exactly what we are getting rid of.
 */
export function assignStableRefs(keys: readonly string[], registry: RefRegistry): RefAssignment {
  if (keys.length === 0) return { refs: [], carryOverRate: 1, degraded: false };

  const known = keys.filter((k) => registry.byKey.has(k)).length;
  const carryOverRate = known / keys.length;
  // A first snapshot has nothing to carry over and is not a degradation — it is where identity starts.
  const degraded = registry.byKey.size > 0 && carryOverRate < MIN_CARRY_OVER_RATE;
  if (degraded) {
    registry.byKey.clear();
    registry.next = 1;
  }

  const refs = keys.map((key) => {
    const existing = registry.byKey.get(key);
    if (existing !== undefined) return existing;
    const ref = registry.next;
    registry.next += 1;
    registry.byKey.set(key, ref);
    return ref;
  });
  return { refs, carryOverRate, degraded };
}

/**
 * The registry as a flat table, for validation at the trust boundary.
 *
 * The keys are built from page-controlled strings, so the driver `safeParse`s this against
 * `StableRefTableSchema` (`@tepegoz/shared-types`, the single schema source) before trusting it — the
 * same place the CDP payload itself is validated. This package stays schema-free by design: it is a
 * pure leaf with no workspace dependencies, and giving it one to hold a zod import would invert that.
 */
export function registryTable(registry: RefRegistry): { key: string; ref: number }[] {
  return [...registry.byKey].map(([key, ref]) => ({ key, ref }));
}
