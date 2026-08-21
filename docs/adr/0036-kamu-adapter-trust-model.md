# ADR-0036: Kamu public-service adapter trust model — read is free, write is never quiet

- **Status:** Accepted (the classification decision only — see Consequences)
- **Date:** 2026-08-20
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (sensitive-site lockout — deliberately NOT modified)
- **Phase:** [Phase 11 — Regional Trust Pack](../../phases/product/phase-11-regional-trust-kamu.md), L6/L8/L3 (Kamu Safe Adapter Pack)

## Numbering note

The phase document names this **ADR-0022**. That number was already claimed by
[0022-file-operations-sandbox.md](0022-file-operations-sandbox.md). This lands as **ADR-0036**,
continuing from [0035](0035-governed-agent-endpoints.md); the phase doc's task line should be read as
referring to this file.

## Context

`sensitive-site.ts`'s existing `government` category already covers the whole `gov.tr` tree, and gates it
the way every sensitive site is gated: a read prompts for confirmation, a state-changing action is denied
outright with no path to proceed. That is the correct default for an ordinary, unreviewed agent action
reaching a government site — but it is the _wrong_ rule for the thing this phase actually wants to ship:
a signed, version-pinned Kamu recipe whose write step — submitting a randevu, confirming a beyanname — is
the entire reason the recipe was authored. An outright deny with no override would make read-write Kamu
automation categorically impossible, which is the opposite of the phase's stated goal.

The two things that cannot be true at once are (1) "state-changing on a government site is always
denied, no exceptions" and (2) "a reviewed Kamu recipe can actually submit an appointment request" — so
the phase needs a _second_, narrower rule for a _specifically identified_ class of traffic, not a
loosening of the first rule.

## Decision

**`classifyKamuStep` is a separate module, not a change to `sensitive-site.ts`, and it answers only for
traffic already identified as coming from a reviewed Kamu recipe.**

- **Domains are named individually** — `turkiye.gov.tr`, `gib.gov.tr`, `sgk.gov.tr`, `mhrs.gov.tr` — not
  matched via the general `gov.tr` suffix. A Kamu recipe pack has no business claiming coverage of a
  government domain nobody actually reviewed it against, even though that domain is still technically
  `gov.tr`.
- **A read is zero-approval; a write is force-asked with biometric, regardless of what danger class the
  step's own tool declared.** This is the phase's read-only-first posture made concrete: routine
  visibility (checking randevu availability, viewing tax debt) costs nothing, while anything that
  mutates state on a government portal is unconditionally escalated to the strictest interactive tier
  this codebase has — never silently downgraded by a recipe's own metadata.
- **`not_kamu` is a fall-through signal, not a refusal.** A step outside the four named domains gets no
  opinion from this module at all — the caller is expected to route it back to the ordinary
  sensitive-site + danger-class rules, exactly as it would for any other site. This module narrows what
  is _possible_ for Kamu traffic specifically; it has no authority to loosen anything else.

## Consequences

**Positive.** The tension between "government writes are always denied" and "a reviewed Kamu recipe must
be able to write" is resolved without touching the shared `sensitive-site.ts` map that every other part
of the codebase relies on — the blast radius of a mistake here is the four named domains, not the whole
lockout system. 9 tests cover both the domain-scoping precision (subdomain matches; an unreviewed
`gov.tr` site outside the four is explicitly NOT covered) and the read/write split.

**Negative / accepted.** This module has no way to know, on its own, that a given step actually came from
a _reviewed, signed_ Kamu recipe rather than an ordinary agent action that happens to target
`turkiye.gov.tr` — that provenance check is the caller's responsibility, and is not built. Calling
`classifyKamuStep` for an unreviewed action would incorrectly grant it zero-approval reads.

**Owed, and stated rather than implied.** The recipe provenance/signing check this module's safety
depends on, 2FA/CAPTCHA routing to the Human Handoff Controller, the Credential Vault's dedicated
sensitive-site lockout class for TC Kimlik No, version pinning + the "recipe stale, falling back to
manual" failure state, and the read-only-mode recipes themselves (checking randevu availability, tax
debt, document lists) are all untouched. This ADR covers the classification rule the recipes would need
to call, not the recipes.
