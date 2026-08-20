# ADR-0032: The restricted unattended trust profile — sealed, one-way, never a door around the financial tier

- **Status:** Accepted (the narrowing decision function only — see Consequences)
- **Date:** 2026-08-20
- **Refines:** [ADR-0031](0031-recipe-compiler-trust-model.md) (RecipeCompiler trust model)
- **Phase:** [Phase 6 — Deterministic Replayable Automation](../../phases/product/phase-6-deterministic-automation.md), L2/L8 (AutomationScheduler)

## Numbering note

The phase document names this **ADR-0013**. That number was already claimed by
[0013-agent-orchestration-hitl.md](0013-agent-orchestration-hitl.md). This lands as **ADR-0032**,
continuing from [0031](0031-recipe-compiler-trust-model.md); the phase doc's task line should be read as
referring to this file.

## Context

The Scheduler is, in the phase's own words, "the highest-agency surface" in the automation stack: a
recipe that ran once with a human watching is later invoked with **no human present at all**. Whatever a
scheduled run is allowed to do unattended has to be a real, checkable subset of what the same recipe was
allowed to do interactively — not a policy an author writes once and hopes stays narrow, but a boundary
the system itself refuses to let widen.

This is the same shape of problem this repo has already solved once, in a different corner: the
AI-agent-super program's remembered grants ([ADR-0027](0027-agent-memory.md)) and its `auto`-autonomy fix
both exist because a persistent permission is exactly the kind of thing that quietly grows scope if
nothing structurally prevents it. The Scheduler is the same risk with the human's *absence* as the
constant, rather than time.

## Decision

**`mayRunUnattended` computes each step's yes/no from two ceilings that cannot be raised by the function
itself, and `narrowToUnattended`'s output is checked directly to be a subset of what interactive
authoring approved — never assumed from reading the implementation.**

- **The tier ceiling is absolute.** `destructive` and `financial` steps are never auto-run, with or
  without a pre-approval flag, with or without prior interactive use. There is no parameter that raises
  this ceiling — it is one `Set` literal (`NEVER_UNATTENDED`) inside the module, not a configurable
  policy, which is what makes "no override exists for this tier" a property of the code rather than a
  claim about how it is currently configured.
- **The sealed-narrowing ceiling is per-recipe.** `InteractiveProfile.approvedToolIds` is the set of tools
  *this specific recipe* actually invoked while a human was watching — not "every tool the user has ever
  approved anywhere". A tool outside that set is refused with its own distinct reason
  (`not_in_interactive_profile`), checked *after* the tier check, so an investigator reading a refusal
  reason for a `destructive` step always sees `never_unattended_tier` — the true cause — never a
  coincidentally-also-true narrower one.
- **`state_changing` is the only tier state-changing steps can cross, and only when the human explicitly
  pre-approved it at authoring time.** `preApprovedIdempotent` is read, never inferred or set by the
  scheduler itself — the one door into unattended state-change is a decision the recipe's author made
  with a human present, not a runtime heuristic.

## Consequences

**Positive.** The sealed-narrowing property — that an unattended profile can never exceed its interactive
ceiling — is checked directly in the test suite by asserting set membership, not merely argued for in
prose. 10 tests cover every tier, the pre-approval gate, and the ceiling-ordering-of-reasons property that
makes a refusal's stated reason trustworthy.

**Negative / accepted.** This module answers one yes/no per step; it does not itself pause a run,
journal a `HitlRequested`, push a notification, or resume on approval. The phase's actual guarantee —
"any step needing HITL pauses… never auto-approves" — depends on a scheduler that calls this function and
then *acts* correctly on a `false` verdict, which does not exist yet.

**Owed, and stated rather than implied.** The AutomationScheduler itself (persisted as journal events,
survives restart), the pause/notify/resume mechanism, per-run journaled audit, and the fail-closed
precondition check (VPN down / not logged in → skip, never silent degrade) are all untouched. This ADR
covers the decision function the scheduler will need to call, not the scheduler.
