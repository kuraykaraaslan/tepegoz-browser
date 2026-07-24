# Phase C1 — Structured State & No-Progress Replan (Core)

**Status:** 🟡 In progress (PR1 landed 2026-07-24; PR2 + exit sweep owed)  ·
**Depends on:** [M1](phase-ai-m1-measurement-baseline.md) PR1  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** Kill the **measured escape ceiling** — the model web-searching *"how do I confirm this
saved?"* or wandering off-site instead of finishing on-page. PR1 gives the actor a **zod-typed working
state** it reasons over instead of free-text chat prose; PR2 adds a **run-level no-progress detector +
replan-after-N**. This phase **owns** the `form_validation_required` and `silent_api_failure` k/N gates
and discharges v1 [AI-7](archive/phase-ai-7-navigation-grounding.md)'s owed live escape numbers.

## Why

The only valid live numbers in the repo (2026-07-24, gpt-4o, N=3) are **1/3 and 1/3**, and in both the
interaction layer worked end-to-end — the ceiling is the model *escaping*. That makes this the highest
pass-rate leverage per PR anywhere in the track. The substrate gaps are v1's `s15`/`s14`: the model's
working memory is a free-text `memory` string riding the chat history (a structured
`AgentRunCheckpoint` exists in [`run-lifecycle.ts`](../../packages/agent-runtime/src/run-lifecycle.ts)
but is journal-only, never fed back to the model), and the structural page-signature computed by
[`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts) `readPage` is
consumed only per-action — there is no cross-step *"state unchanged for N steps → change strategy"*
signal, and `maxRecoveryAttempts` fails **closed** instead of replanning
([`reactor.ts`](../../packages/orchestrator/src/reactor.ts)). M1's dual-provider baseline answers
*"is escape gpt-4o-specific?"* before this builds.

## Exit criteria (DoD)

- [ ] **Escape-family pooled pass-rate** (~7 scenarios × N≥10, Wilson CIs) improves by the pre-stated
      detectable margin vs the M1 baseline on the **product-default model**; per-scenario:
      `form_validation_required` **and** `silent_api_failure` each **≥6/10** (from 1/3).
- [ ] **Family-pooled escape-rate at most half of the M1 baseline**; `escape_bait`,
      `url_hallucination_trap`, `sitemap_only_route` flip to majority-pass — recorded back into
      [`archive/phase-ai-7`](archive/phase-ai-7-navigation-grounding.md)'s closure note.
- [ ] The **typed working-state is what the model actually receives** — verified from a harness run
      transcript, not a unit test; token-per-step increase ≤10%.
- [ ] **Replan-after-N fires in ≥1 recorded live trial and the trial recovers** (transcript cited).
- [ ] Held-out pooled aggregate: no regression beyond the flaky band.
- [ ] Fixtures frozen before capability code (this phase's exam is the already-frozen escape family —
      no new self-authored exam in the same PR).
- [ ] The **escape/web-search-last-resort prose steers deleted in the proving PR** (paired
      with/without sweep at pooled N; [`PROSE-LEDGER.md`](PROSE-LEDGER.md) updated).
- [ ] Delta recorded in the eval-results ledger (the phase is incomplete until it is).
      **i18n:** internal; any Agent Console surface EN+TR in the owning dict.

## Tasks

### PR1 — typed working state (`s15`) — ✅ landed 2026-07-24
- [x] Schema in `@tepegoz/shared-types` (the only schema source): open tabs, selected records, filled
      fields, completed sub-tasks, pending verifications — zod `safeParse` at the untrusted-model
      boundary, tolerant optionals like the existing decision schema
      ([`reactor-decision.ts`](../../packages/orchestrator/src/reactor-decision.ts)).
      → [`agent-working-state.ts`](../../packages/shared-types/src/agent-working-state.ts); the `state`
      field on the decision is `.catch(undefined)` so a malformed patch is dropped, never fatal.
- [x] Runtime builds/updates it each step and injects it as the compact persistent context in place of
      chat-resident prose (composes with the existing transient page-state collapse in
      [`reactor-page-state.ts`](../../packages/orchestrator/src/reactor-page-state.ts)).
      → [`reactor-working-state.ts`](../../packages/orchestrator/src/reactor-working-state.ts) (merge +
      render) wired into [`reactor.ts`](../../packages/orchestrator/src/reactor.ts) `syncWorkingState`,
      prompt updated in [`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts). Injection
      verified against the real message stream by a capturing-provider test (not just a unit render).
      **Owed:** the N≥10 exit sweep on the product-default model (needs live API keys) — the DoD delta is
      not yet in the ledger, so this phase stays measurement-owed per the anti-debt rule.

### PR2 — no-progress replan (`s14`)
- [ ] Run-level state-hash detector over the structural page signature: unchanged state across N
      acting steps → a **replan trigger**, not a fail-closed stop.
- [ ] The trigger re-invokes the planner with fresh evidence (goal, typed state, what failed) via
      ModelGateway (Egress + TokenLedger apply, like `validateCompletion` today). A genuine *new
      approach*, not a "keep going" nudge — but the full Replanner *role* is
      [C2](phase-ai-c2-replanner.md); here it is the trigger + a single replan pass.
- [ ] Exit sweep on a single-change branch; serialized per the constitution.

## Scope notes
- Lane A (reactor-adjacent) — nothing else touches the reactor while this is in flight.
- **Gate ownership:** no other phase gates on `form_validation_required` / `silent_api_failure`
  ([C6](phase-ai-c6-verified-outcomes.md) gates only on what its mechanism uniquely moves).
- Durable resume / parallel DAG stay [Phase 1b](../phase-1b-agentic-deepening.md); the checkpoint
  journal is reused as substrate, not re-owned.
