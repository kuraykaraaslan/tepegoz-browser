import type { PackageManifest } from '@tepegoz/shared-types';

/**
 * The SupplyChainGate (Phase 12) — moving "from signed = trusted to attested + scoped + SBOM-diffed +
 * declared-vs-actual-enforced", exactly as the phase states it. This module is the deterministic,
 * pre-install / pre-model decision; it verifies nothing itself (no cryptography here) and trusts its
 * caller to have already checked the signature, hashed the SBOM against the real artifact, and
 * validated the attestation — the three booleans on `PackageManifest` are facts handed in, not claims
 * this gate re-derives.
 *
 * **Three tiers, not two.** The phase's own text names both "unsigned packages still installable only in
 * an explicit quarantine tier" and, in its risk mitigation, "tier it (unsigned-blocked / signed-basic /
 * attested-premium)" — two framings that do not quite agree on whether unsigned means blocked or merely
 * sandboxed. This module implements the more specific of the two: **unsigned is never blocked outright**
 * — it installs QUARANTINED (sandboxed, no credentials), because refusing an unsigned package entirely
 * would foreclose exactly the "unverified but honest" long tail a registry needs to be useful at all.
 * Signed-but-unattested sits in the middle. Only signature + SBOM + attestation together earn the
 * unrestricted tier.
 */

export type InstallTier = 'quarantined' | 'signed_basic' | 'attested';

export interface SupplyChainVerdict {
  tier: InstallTier;
  /** Why this tier and not a higher one — always populated for `quarantined`/`signed_basic`, empty for
   *  `attested` (nothing held it back). */
  reasons: string[];
}

/**
 * Which tier a manifest earns, on its own — no scope check yet (see `declaredWithinRequestedScope`
 * below, a deliberately separate concern: a package can be fully attested and STILL ask for more than
 * the user was shown).
 */
export function evaluateSupplyChain(manifest: PackageManifest): SupplyChainVerdict {
  if (!manifest.signatureVerified) {
    return { tier: 'quarantined', reasons: ['unsigned'] };
  }
  const reasons: string[] = [];
  if (!manifest.sbomVerified) reasons.push('sbom_unverified');
  if (!manifest.attestationVerified) reasons.push('attestation_unverified');
  if (reasons.length > 0) return { tier: 'signed_basic', reasons };
  return { tier: 'attested', reasons: [] };
}

/**
 * Does this manifest ask for anything beyond what the install-time scope review actually showed the
 * user? The phase names this "declared-capabilities ⊆ requested-scopes is rejected" — read literally that
 * would reject the SAFE case; the property actually worth enforcing, and the one this function checks,
 * is the opposite: a package whose declared needs are NOT fully covered by what was disclosed is the one
 * that gets rejected, because it is asking for something the user never saw named.
 */
export function declaredWithinRequestedScope(
  declaredCapabilities: readonly string[],
  requestedScopes: readonly string[],
): { withinScope: true } | { withinScope: false; undisclosed: string[] } {
  const requested = new Set(requestedScopes);
  const undisclosed = declaredCapabilities.filter((c) => !requested.has(c));
  return undisclosed.length === 0 ? { withinScope: true } : { withinScope: false, undisclosed };
}

/**
 * The first-run declared-vs-actual check: capabilities the package ACTUALLY invoked (as the ToolGateway
 * genuinely saw, never as the package claims about itself) that its own manifest never declared it would
 * need. A non-empty result is the mismatch the phase's DoD says must block or HITL — this function only
 * detects it; the block/HITL decision and the tamper-evident install-receipt event are the caller's job.
 */
export function declaredVsActualMismatch(
  declaredCapabilities: readonly string[],
  actualToolIds: readonly string[],
): string[] {
  const declared = new Set(declaredCapabilities);
  return [...new Set(actualToolIds)].filter((id) => !declared.has(id));
}
