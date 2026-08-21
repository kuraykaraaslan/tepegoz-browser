import type { PolicyBundle } from '@tepegoz/shared-types';

/**
 * "A child bundle can never widen a parent" (Phase 9, Verifiable Policy Bundles), enforced
 * deterministically here rather than trusted from a publisher's claim. A curated bundle like
 * `Paranoid-Default` is only worth installing if downstream bundles that derive from it are provably at
 * least as strict — otherwise "derives from Paranoid-Default" is marketing, not a guarantee.
 */

export type NarrowingViolation =
  | { kind: 'tool_added'; toolId: string }
  | { kind: 'domain_restriction_removed' }
  | { kind: 'domain_added'; domain: string };

export type NarrowingVerdict =
  { narrows: true } | { narrows: false; violations: NarrowingViolation[] };

/**
 * Does `child` narrow (or at most match) `parent` — never exceed it on any axis?
 *
 * Checked axis by axis, and ALL violations are collected rather than stopping at the first — a compiler
 * rejecting a bundle should tell its author everything wrong with it in one pass, not make them fix one
 * violation only to discover a second on the next compile.
 */
export function bundleNarrows(parent: PolicyBundle, child: PolicyBundle): NarrowingVerdict {
  const violations: NarrowingViolation[] = [];

  const parentTools = new Set(parent.allowedToolIds);
  for (const toolId of child.allowedToolIds) {
    if (!parentTools.has(toolId)) violations.push({ kind: 'tool_added', toolId });
  }

  // `null` on the PARENT means "no domain restriction" — nothing a child does on this axis can widen an
  // already-unrestricted parent, so only a restricted parent constrains its child here.
  if (parent.allowedDomains !== null) {
    if (child.allowedDomains === null) {
      // The child claims NO restriction where the parent had one — the maximum possible widening on this
      // axis, reported as its own violation kind so a reviewer sees "removed the restriction entirely"
      // rather than a list of every domain that happens to now be newly allowed.
      violations.push({ kind: 'domain_restriction_removed' });
    } else {
      const parentDomains = new Set(parent.allowedDomains.map((d) => d.toLowerCase()));
      for (const domain of child.allowedDomains) {
        if (!parentDomains.has(domain.toLowerCase())) {
          violations.push({ kind: 'domain_added', domain });
        }
      }
    }
  }

  return violations.length === 0 ? { narrows: true } : { narrows: false, violations };
}

/**
 * Walk an entire ancestor chain and confirm every child narrows its immediate parent — the property
 * that has to hold at EVERY link for "derives from X" to mean anything transitively, not just at the
 * one link someone happened to check.
 */
export function bundleChainNarrows(chain: readonly PolicyBundle[]): NarrowingVerdict {
  const violations: NarrowingViolation[] = [];
  for (let i = 1; i < chain.length; i++) {
    const parent = chain[i - 1];
    const child = chain[i];
    if (parent === undefined || child === undefined) continue;
    const link = bundleNarrows(parent, child);
    if (!link.narrows) violations.push(...link.violations);
  }
  return violations.length === 0 ? { narrows: true } : { narrows: false, violations };
}
