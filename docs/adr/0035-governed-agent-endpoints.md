# ADR-0035: Governed Agent Endpoints — the sensitive-site lockout applies regardless of the token

- **Status:** Accepted (the inbound gate decision layer only — see Consequences)
- **Date:** 2026-08-20
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (sensitive-site lockout, reused verbatim here)
- **Phase:** [Phase 9 — Safe Autonomy & Governed Delegation](../../phases/product/phase-9-safe-autonomy-delegation.md), L5/L8/L9 (Governed Agent Endpoints)

## Numbering note

The phase document names this **ADR-0018**. That number was already claimed by
[0018-mcp-client.md](0018-mcp-client.md). This lands as **ADR-0035**, continuing from
[0034](0034-verifiable-policy-bundles.md); the phase doc's task line should be read as referring to this
file.

## Context

Governed Agent Endpoints is the productized inverse of everything else this codebase's Policy Kernel
does: instead of tepegöz's own agent calling out through the single PEP, an **external** caller reaches
in through a scoped Bearer token. The phase names the exact competitor failure this is meant to avoid —
Fellou's IDOR/no-rate-limit/no-SSL-pin endpoint — and the design principle it commits to instead: **fail-
closed deny-by-default**, with full per-caller journaling so revocation and forensics are possible after
the fact.

The one question this ADR exists to answer precisely: what happens when a validly-scoped token targets a
site the interactive Policy Kernel would already refuse to touch — a bank, a password manager, a health
portal? A Bearer token is exactly the kind of artifact that can be minted wrong, leaked, or replayed; if
it could be scoped to reach a locked-out site, an inbound endpoint would be _more_ dangerous than the
browser itself, which defeats the point of calling it "governed" at all.

## Decision

**`tokenCovers` runs the sensitive-site lockout before anything the token itself says, using the exact
same `isSensitiveSite` check the interactive kernel already uses — not a second, endpoint-specific
list.**

- The refusal order is: revoked → expired → sensitive-site lockout → tool scope → danger-class scope.
  Sensitive-site comes before the token's own allow-lists specifically so a call that would ALSO have
  failed on scope is still reported as `sensitive_site_lockout` — the site is the true, structural reason
  no token could ever cover this call, and burying it behind a scope-mismatch reason would understate how
  fundamental the refusal is.
- **Danger class is checked independently of tool id**, mirroring how the interactive kernel already
  re-classifies a call on its actual arguments rather than trusting a tool's declared class: a token
  scoped to `allowedDangerClasses: ['read']` cannot ride an allowed tool id into a call that turns out to
  be `state_changing` once its real arguments are known.
- **`withinRateLimit` owns no state.** It is handed the caller's own recent-call history and a window,
  and answers a pure yes/no — the same check works whether it gates a live call or replays against a
  journal for an audit, because it is not tied to wherever that history happens to be stored.

## Consequences

**Positive.** The property this phase is riskiest without — a token being read as more trustworthy than
an interactive session — cannot happen: the lockout list and the check are the identical code path the
rest of the browser already relies on, not a parallel implementation that could quietly drift from it.
10 tests cover every denial reason and the ordering between them.

**Negative / accepted.** This is the decision the endpoint would consult on every inbound call; it is not
the endpoint. Nothing here parses an HTTP request, validates a Bearer header, or is wired into an actual
listening surface.

**Owed, and stated rather than implied.** Token minting + the Settings UI, the full Policy Kernel + HITL

- Egress Firewall + Effect Ledger re-flow on every inbound call (this ADR covers only the token's own
  scope check, which is one input to that larger flow), the "External Agents" live console, per-session
  Replay Receipts (depends on [ADR-0030](0030-notary-service.md)), and short-lived capability-scoped A2A
  grants are all untouched.
