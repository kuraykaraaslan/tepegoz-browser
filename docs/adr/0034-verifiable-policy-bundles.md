# ADR-0034: Verifiable Policy Bundles — narrowing enforced in the compiler, not trusted from a claim

- **Status:** Accepted (the narrowing check only — see Consequences)
- **Date:** 2026-08-20
- **Phase:** [Phase 9 — Safe Autonomy & Governed Delegation](../../phases/product/phase-9-safe-autonomy-delegation.md), L8/L5 (Verifiable Policy Bundles)

## Numbering note

The phase document names this **ADR-0017**. That number was already claimed by
[0017-feature-ui-package-i18n.md](0017-feature-ui-package-i18n.md). This lands as **ADR-0034**,
continuing from [0033](0033-transaction-mandate-kernel.md); the phase doc's task line should be read as
referring to this file.

## Context

"Constitution-as-code" curated bundles (`KVKK-Healthcare`, `Paranoid-Default`, and similar) are only
trustworthy if a bundle claiming to derive from one of them cannot secretly grant more than its parent
did. A marketplace listing that says "based on Paranoid-Default" is a claim a **publisher** makes; without
a check, nothing stops a child bundle from silently widening scope while keeping the name of a stricter
parent for the trust halo it carries.

## Decision

**`bundleNarrows` is a pure structural comparison over two bundles' declared scope — never a claim about
provenance, and never anything the bundle's own metadata gets to assert about itself.**

- Checked on two independent axes — tool ids and domains — and **every** violation on both axes is
  collected in one pass, not just the first found, so a bundle author sees everything wrong with a
  proposed child in one compile rather than fixing violations one at a time.
- `allowedDomains: null` (no restriction) and `allowedDomains: []` (nothing permitted) are distinct
  values in the schema specifically so a child that **removes** a parent's domain restriction entirely is
  its own violation kind (`domain_restriction_removed`), distinguishable from a child that merely adds
  one domain the parent didn't have. A reviewer reading "restriction removed entirely" understands the
  severity immediately; a reviewer reading a list of fifteen newly-added domains has to count.
- `bundleChainNarrows` walks a whole ancestor chain and checks every link, not just root-to-leaf directly
  — a violation introduced at any intermediate bundle is caught there, because "derives from X" has to
  hold at every step for the transitive claim to mean anything.

## Consequences

**Positive.** The one property that makes a curated bundle's name worth anything — that nothing calling
itself a child of `Paranoid-Default` can be laxer than `Paranoid-Default` — is enforced structurally and
tested directly (11 tests), rather than left to a publisher's honesty or a manual review that can miss
one added tool in a long list.

**Negative / accepted.** This is a scope check only. It says nothing about whether a bundle's _signature_
is valid, whether its provenance chain is authentic, or whether its declared red-team attack-success-rate
is real — those are separate, unimplemented concerns the phase's DoD also names.

**Owed, and stated rather than implied.** Signing, the marketplace install + scope-review flow, org-wide
pinning via RBAC, embedding the bundle hash in every notarized Action Receipt, the curated bundles
themselves (`KVKK-Healthcare`, `EU-FinServ`, `Journalist-Source-Protection`, `Paranoid-Default`), and
running the red-team corpus to publish an actual measured ASR are all untouched — this ADR covers the one
structural guarantee the compiler owes, not the bundle ecosystem around it.
