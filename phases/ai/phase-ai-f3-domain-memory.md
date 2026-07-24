# Phase F3 — Per-Domain Observation Memory (Frontier)

**Status:** ⬜ Not started  ·  **Depends on:** [C3](phase-ai-c3-perception-economy.md) (identity-stable
refs — memory without them caches positional garbage) + [C1](phase-ai-c1-structured-state-replan.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** A small **local** store of per-domain **observations only** — login-wall presence,
consent-banner pattern, navigation topology fingerprint, table locations — that makes repeat visits
**faster and cheaper** without ever being trusted blind. Advisory-only **by construction**: a
store-deleted run must still pass everything; a remembered observation is a *hint*, re-validated
against the live page on every read, never ground truth. 2 PRs. Absorbs v1 AI-8D (`s22`).

## Why

Skill/memory libraries are the hottest differentiator among 2026 agents, and **local-first memory
under a policy kernel is a structural advantage no cloud rival has**. It is also
[north-star condition 4](README.md#north-star--the-falsifiable-worlds-best-claim)'s engine: $/task and
wall-clock must *drop on repeat domains*. Today nothing is cached across runs — the v1 audit noted the
"never trust an old selector" discipline is satisfied only *vacuously*
(conversation memory in
[`agent-conversation-store.ts`](../../packages/persistence/src/agent-conversation-store.ts) is
per-dialogue; macros are user-authored replays — neither is agent-learned page knowledge).

## Exit criteria (DoD)

- [ ] **Repeat-visit runs on ≥3 fixture domains show ≥25% median step/token reduction** at
      equal-or-better pooled pass-rate (Wilson CIs; first-visit vs second-visit compared in one
      sweep).
- [ ] **A poisoned-hint fixture AND a drifted-domain fixture** (both frozen first) prove: memory never
      overrides live evidence, and pass-rate WITH memory ≥ the memoryless baseline — **memory can
      never make it worse** — test-locked.
- [ ] The store is **zod-`safeParse`d on read**, carries **full sync-meta** per the repo's Phase-3
      rule (UUID PK, `updated_at`/`version`/tombstone, `device_id` —
      [`packages/persistence`](../../packages/persistence)), is TTL'd, and every hint passes through
      the content-guard taxonomy (taint-tagged untrusted, like any page-derived text).
- [ ] The **routing table** (this phase vs [Phase 6](../phase-6-deterministic-automation.md) recipes vs
      [Phase 1b](../phase-1b-agentic-deepening.md) memory tiers) is in this doc; the trajectory-export
      **seam interface** is reviewed against the Phase 6 spec before landing.
- [ ] Held-out pooled aggregate: no regression beyond the flaky band; delta recorded in the
      eval-results ledger. **i18n:** internal; any Settings surface (e.g. a clear-memory control)
      EN+TR in the owning dict.

## Tasks

### PR1 — the store + injection
- [ ] Persistence model (sync-meta-carrying, per the repo rule) + a read/write seam in the agent
      runtime: observations recorded only after a **verified** success signal
      ([C6](phase-ai-c6-verified-outcomes.md)'s evidence), injected into the C1 typed working-state as
      tagged *hints* with their age.
- [ ] Re-validation on read: a hint is re-resolved against the live snapshot; a miss silently falls
      back to fresh perception (no error, no retry storm).

### PR2 — the exam + the seam
- [ ] Repeat-visit, poisoned-hint, drifted-domain fixtures + scenarios; the memory-off ablation is
      part of the exit sweep (store-deleted run must pass).
- [ ] The **trajectory-export seam**: an interface a Phase 6 stub reader consumes — **no distillation
      logic here**. Ownership test, verbatim: *"if the model could be removed from the replay, it's
      Phase 6."*
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- **Observations, not skills:** injected success-path summaries / learned action sequences are NOT
  built — that is [Phase 6](../phase-6-deterministic-automation.md) (deterministic recipes) and
  [Phase 1b](../phase-1b-agentic-deepening.md) (SkillRuntime) territory, referenced not duplicated.
- Deliberately late in the track: repeat-visit value is only measurable once first-visit competence is
  no longer the ceiling.
