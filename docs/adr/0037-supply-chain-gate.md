# ADR-0037: SupplyChainGate — from "signed = trusted" to attested + scoped + declared-vs-actual-enforced

- **Status:** Accepted (the decision layer only — see Consequences)
- **Date:** 2026-08-20
- **Phase:** [Phase 12 — Developer Platform & Marketplace Economy](../../phases/product/phase-12-developer-platform-marketplace.md), L5/L8 (SBOM + SLSA provenance attestation gate)

## Numbering note

The phase document names this **ADR-0020**. That number was already claimed by
[0020-tab-boundary-model.md](0020-tab-boundary-model.md). This lands as **ADR-0037**, continuing from
[0036](0036-kamu-adapter-trust-model.md); the phase doc's task line should be read as referring to this
file.

## Context

A registry without a quality bar produces a thin, low-quality long tail — Phase 4 lists signing as
distribution plumbing with no DX, no economics, and no quality bar of its own. "Signed" alone answers
only "who published this", never "does it declare what it actually does" or "does it do what it
declared". The phase's own framing states the target precisely: move from _signed = trusted_ to
_attested + scoped + SBOM-diffed + declared-vs-actual-enforced_ — four separate, checkable claims instead
of one binary one.

The phase's own text also contains a real tension worth resolving explicitly rather than silently:
one DoD line says an unsigned package installs only in an "unverified, sandboxed, no-credentials"
quarantine tier (i.e., unsigned still installs), while the risk-mitigation note proposes tiering as
"unsigned-blocked / signed-basic / attested-premium" (i.e., unsigned is blocked). Those are different
policies, and a gate has to pick one.

## Decision

**`evaluateSupplyChain` implements the quarantine reading, not the block reading: unsigned never
installs outright blocked, only sandboxed with no credentials.** Refusing an unsigned package entirely
would foreclose exactly the "unverified but honest" long tail a registry needs to be useful — most
community authors will not clear a full attestation pipeline on day one, and a hard block would simply
keep the registry empty. Three tiers result: `quarantined` (unsigned), `signed_basic` (signed, but
missing SBOM and/or attestation verification — both reasons collected, not just the first), and
`attested` (all three verified).

**Every one of the three trust facts on `PackageManifest` — `signatureVerified`, `sbomVerified`,
`attestationVerified` — is documented as a fact handed in by the caller, never something the manifest
claims about itself.** This module does no cryptography; it composes verdicts from verified inputs,
which is what keeps it pure and fast to test while leaving the actual signature/hash/attestation
checking to whichever code owns those primitives.

**`declaredWithinRequestedScope` corrects a literal reading of the phase's own DoD text.** "Declared-
capabilities ⊆ requested-scopes is rejected", read literally, rejects the _safe_ case. The property
actually worth enforcing — and the one this function checks — is the reverse: a package whose declared
needs are **not** fully covered by what scope review disclosed to the user is the one that gets
rejected, because it is asking for something the user never saw named.

**`declaredVsActualMismatch` is the first-run enforcement the phase asks for**, kept as detection only:
it returns which tools the package genuinely invoked (as the ToolGateway would see, never as the
manifest claims) that its own declaration never mentioned. The block/HITL decision and the tamper-
evident install-receipt event are the caller's responsibility.

## Consequences

**Positive.** The three concerns the phase's "signed = trusted → attested + scoped + declared-vs-actual"
framing names are each their own tested function (14 tests) rather than folded into one opaque check —
a reviewer can verify the tiering logic, the scope-disclosure rule, and the runtime-drift detector
independently.

**Negative / accepted.** This gate has no memory: it evaluates one manifest, one scope comparison, or
one actual-vs-declared diff at a time, and holds no state about a package across installs or runs. A
caller that does not persist and re-check the manifest at every future update gets no protection from
this ADR against a package quietly re-publishing with a wider declaration later.

**Owed, and stated rather than implied.** Signature/hash/attestation verification itself (the three
booleans this gate consumes are assumed already computed), the `tepegoz-sign` CLI, the actual install
flow and quarantine sandboxing, the tamper-evident install-receipt event, and the exportable SBOM-
equivalent for enterprises are all untouched. This ADR covers the decision rules a real
SupplyChainGate would need to call, not the gate.
