import { z } from 'zod';

/**
 * The SupplyChainGate's input shape (Phase 12) — what a package installer knows about a candidate
 * package BEFORE deciding whether to install it, and at what trust tier. Moving "from signed = trusted
 * to attested + scoped + SBOM-diffed + declared-vs-actual-enforced" (the phase's own framing) starts
 * with making each of those four things its own checkable field, rather than one boolean a publisher
 * gets to set.
 */
export const PackageManifestSchema = z.object({
  id: z.string().min(1).max(200),
  version: z.string().min(1).max(40),
  /** Capability/tool ids this package DECLARES it needs, in its own manifest — never inferred, never
   *  optional; a package that needs nothing declares an empty array, not an absent field. */
  declaredCapabilities: z.array(z.string().min(1).max(100)),
  /** True only once the package's own Ed25519 signature has been cryptographically verified upstream of
   *  this schema — this field is a VERIFIED FACT handed in, never a claim the manifest makes about
   *  itself (a manifest cannot self-attest to being signed). */
  signatureVerified: z.boolean(),
  /** True only once a CycloneDX SBOM accompanying the package has been checked to hash-match the actual
   *  installed artifact — same rule: a verified fact, not a claim. */
  sbomVerified: z.boolean(),
  /** True only once an in-toto/SLSA build-provenance attestation has been checked. */
  attestationVerified: z.boolean(),
});
export type PackageManifest = z.infer<typeof PackageManifestSchema>;
