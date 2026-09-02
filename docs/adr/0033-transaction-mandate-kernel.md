# ADR-0033: Transaction Mandate Kernel — bounded pre-model authority, replay-safe by construction

- **Status:** Accepted (decision layer only — see Consequences) — refined by [ADR-0039](0039-user-granted-sensitive-capabilities.md)
- **Date:** 2026-08-20

> **Amended by [ADR-0039](0039-user-granted-sensitive-capabilities.md) (2026-08-23):** inside an active
> mandate, the mandate now _satisfies_ the `financial` HITL requirement instead of only narrowing it.
> Outside a mandate nothing changes, and every replay-safety property below is untouched.

- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic policy kernel — the `financial`
  danger class this mandate can only ever narrow further, never replace)
- **Phase:** [Phase 9 — Safe Autonomy & Governed Delegation](../../phases/product/phase-9-safe-autonomy-delegation.md), L8/L2/L6

## Numbering note

The phase document names this **ADR-0016**. That number was already claimed by
[0016-per-package-i18n.md](0016-per-package-i18n.md). This lands as **ADR-0033**, continuing from
[0032](0032-restricted-unattended-trust-profile.md); the phase doc's task line should be read as
referring to this file.

## Context

Buy/book/pay is named explicitly as where excessive-agency disasters actually happen — real money moving
because an injected instruction or a misjudged step told the agent to. The existing `financial` danger
class already forces HITL and biometric confirmation on every such call (ADR-0006). What it does not yet
provide is a _bound_: a way for a user to say, once, "the agent may spend up to this much, on these
sites, until this time" and have that bound enforced **before** a model call, rather than trusting the
model to stay inside an intent it was merely told about.

The two failure modes that make this harder than an ordinary permission check: a **retried or resumed
run** re-attempting the same logical payment must never charge twice, and a **revoked** mandate must stop
authorizing new spends instantly while never retroactively un-happening a transaction that already went
through.

## Decision

**`mandateCovers` answers "would this be allowed" without touching consumption history; `consumeMandate`
answers "did this actually happen" and is where the replay-safety lives — kept as two functions so a
caller previewing a transaction never has to hand over the ledger to find out.**

- Every check in `mandateCovers` fails closed and in an order chosen so the reported reason is the
  **first true cause** — an expired-and-revoked-and-over-limit mandate reports `expired`, not
  `amount_exceeds_mandate`, because that is the fact worth knowing first.
- `hitlThreshold` can only ever **add** a confirmation, never remove the one ADR-0006 already requires
  for the `financial` class. There is no field, and no code path, that lets a mandate skip the kernel's
  own unconditional HITL — a mandate narrows what is possible within the financial tier; it does not
  reach outside it.
- **The replay check runs before everything else, including expiry.** A retried request with a
  previously-seen `idempotencyKey` returns the same "already consumed" answer regardless of whether the
  mandate has since expired or been revoked — because the transaction it is fencing against a double-
  charge already happened, and a resumed run asking "did my payment go through?" must get the same
  answer every time it asks, not a different one depending on when it asks.
- `maxAmount` is a **per-transaction** ceiling, stated as such in the schema doc rather than left
  ambiguous — a `recurring` mandate bounds each individual spend, not a cumulative total across its whole
  lifetime. A cumulative budget is a genuinely different feature this ADR does not claim to provide.

## Consequences

**Positive.** The double-charge property — the one most likely to cause real financial harm if it were
wrong — is checked directly: 17 tests cover coverage denial on every axis, replay returning the same
verdict across expiry and revocation, and a same-key/different-mandate collision being correctly treated
as unrelated.

**Negative / accepted.** `mandateCovers`/`consumeMandate` compute a verdict; they do not themselves sign
anything, journal a `HitlRequested`, or notarize a spend. "Every consumption is a journaled, notarized
event" — the forensic backstop the phase's own risk mitigation leans on — is not implemented here.

**Owed, and stated rather than implied.** Mandate signing/verification, the Mandate authoring UI, wiring
into the Capability Broker so a real call is actually denied pre-model, the notarized spend ledger
(depends on [ADR-0030](0030-notary-service.md)'s NotaryService, itself foundation-only), and the default
single-use-low-caps policy the phase's risk note asks for are all untouched.
