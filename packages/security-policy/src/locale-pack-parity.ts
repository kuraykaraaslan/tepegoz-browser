/**
 * Locale-pack parity (Phase 11, "Locale-as-a-Plugin"): the install-time check that stands between a
 * signed, community-authored locale pack and the app's own `Resources` shape.
 *
 * A signature only proves who published a pack, never that its content is *shaped* right. Every place in
 * this codebase that calls `t('some.nested.key')` trusts that the key resolves to a string at run time —
 * a pack that is missing a key, or that has turned a string into a nested object at the same path,
 * crashes or silently renders `undefined` in the middle of the UI. This check is what lets a malformed
 * pack be refused at INSTALL time instead of discovered by a user hitting the broken string in
 * production, which the phase's own risk note names directly: *"locale strings are validated by zod
 * parity at install so a malformed pack can't break the UI."*
 *
 * Deliberately independent of `@tepegoz/i18n/testing`'s `keyPaths` (used by every package's own
 * compile-time EN/TR parity test): that export is a dev/test-time helper for trusted, first-party
 * dictionaries. This module walks structurally UNTRUSTED input — a pack loaded from disk at runtime —
 * and must not assume it is even well-formed enough to walk without checking each step, which a plain
 * recursive helper does not need to do for a TypeScript object literal it was compiled against.
 */

export interface LocalePackParity {
  ok: boolean;
  /** Key paths the base (English) resource has that the pack does not — a `t()` call on any of these
   *  would resolve to nothing in the pack's locale. */
  missingKeys: string[];
  /** Key paths the pack has that the base does not — dead weight at best, and a sign the pack was built
   *  against a different `Resources` version at worst. */
  extraKeys: string[];
  /** A key present in BOTH, but as a plain string on one side and a nested object on the other — the
   *  shape mismatch that actually breaks a caller, distinct from a key simply being absent. */
  shapeMismatches: string[];
}

type LeafKind = 'string' | 'object';

/** Every key path in a value, alongside what kind of leaf it resolves to. `null`/non-object input at any
 *  level (untrusted!) is treated as "not further walkable" rather than thrown on. */
function pathKinds(value: unknown, prefix = ''): Map<string, LeafKind> {
  const out = new Map<string, LeafKind>();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [key, v] of Object.entries(value)) {
    const path = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (typeof v === 'string') {
      out.set(path, 'string');
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      out.set(path, 'object');
      for (const [k, kind] of pathKinds(v, path)) out.set(k, kind);
    }
    // Anything else (number, boolean, array, null) at a leaf position is neither a valid string entry
    // nor a walkable section — it is simply absent from the kind map, which `checkLocalePackParity`
    // then correctly reports as a missing key rather than crediting it as present.
  }
  return out;
}

/**
 * Compare a candidate pack's resource tree against the base (English) shape it must match.
 *
 * `ok` is true only when there are zero entries in all three problem lists — a pack that is merely
 * missing one deeply-nested key is exactly as un-installable as one that is missing everything, because
 * either one produces a broken string somewhere the moment that key is reached.
 */
export function checkLocalePackParity(
  baseResources: Record<string, unknown>,
  packResources: unknown,
): LocalePackParity {
  const base = pathKinds(baseResources);
  const pack = pathKinds(packResources);

  const missingKeys: string[] = [];
  const shapeMismatches: string[] = [];
  for (const [path, baseKind] of base) {
    const packKind = pack.get(path);
    if (packKind === undefined) {
      // Only a missing STRING leaf is reported directly — a `t()` call resolves a leaf, never a
      // section. When a whole section is absent, every leaf underneath it is independently missing
      // too (each has its own map entry), which reports the same fact once per actually-affected
      // caller instead of once for the section AND once per leaf under it.
      if (baseKind === 'string') missingKeys.push(path);
    } else if (packKind !== baseKind) {
      shapeMismatches.push(path);
    }
  }
  const extraKeys = [...pack.entries()]
    .filter(([path, kind]) => kind === 'string' && !base.has(path))
    .map(([path]) => path);

  return {
    ok: missingKeys.length === 0 && extraKeys.length === 0 && shapeMismatches.length === 0,
    missingKeys,
    extraKeys,
    shapeMismatches,
  };
}
