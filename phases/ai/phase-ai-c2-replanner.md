# Phase C2 — Replanner Role (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [C1](phase-ai-c1-structured-state-replan.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** A real **Replanner authority** — the third role of the Planner/Navigator/Validator
architecture the port reference (nanobrowser) carries — that **regenerates the plan** from the C1 typed
working-state + page evidence whenever the no-progress detector or the completion validator rejects
progress, replacing today's static per-error-kind hint strings as the only recovery voice. 1–2 PRs,
**scope evidence-gated**: if C1 alone hits the escape-family target, C2 shrinks to a close-out PR —
that outcome is valid and recorded.

## Why (v1 `s07`)

Recovery today is prose: [`recovery.ts`](../../packages/orchestrator/src/recovery.ts) maps the 11-kind
failure taxonomy to *static hint strings*, and
[`planner.ts`](../../packages/orchestrator/src/planner.ts) `validateCompletion` only judges
done/not-done — nothing ever produces a **new approach** when the current one is failing. Every top
rival architecture carries an explicit replanning authority. Split from C1 because v1 AI-3's history
shows `s07` is PR-scale on its own; C1's replan-after-N lands the *trigger* + a single replan pass,
C2 lands the *role* (routing, history, taxonomy integration).

## Exit criteria (DoD)

- [ ] Recovery-taxonomy paths that were static hints now **route through the Replanner**; journal
      traces show replan events preceding recovered runs in the exit sweep.
- [ ] **Escape-family pooled pass-rate improves further or holds C1's level with the hint strings
      deleted** — the deletion is the point (CODE > PROSE), proven by a paired with/without sweep at
      pooled N with the pre-stated equivalence margin ([`PROSE-LEDGER.md`](PROSE-LEDGER.md) updated in
      the same PR).
- [ ] Held-out pooled aggregate: no regression beyond the flaky band.
- [ ] Fixtures frozen before capability code (reuses the frozen escape family; any new
      replan-specific fixture freezes first).
- [ ] [`archive/phase-ai-3`](archive/phase-ai-3-agent-loop.md) and
      [`archive/phase-ai-7`](archive/phase-ai-7-navigation-grounding.md) marked **Done** with closure
      entries linking the sweeps.
- [ ] Delta recorded in the eval-results ledger. **i18n:** internal (model-facing English).

## Tasks

- [ ] `Planner.replan(goal, typedState, history, whatFailed)` in
      [`planner.ts`](../../packages/orchestrator/src/planner.ts) — produces a new guidance outline +
      next-step steer; routed through ModelGateway (Egress Firewall + TokenLedger apply, exactly like
      `validateCompletion`).
- [ ] Route the C1 no-progress trigger and the repeated-failure paths of
      [`recovery.ts`](../../packages/orchestrator/src/recovery.ts) into it; per-run replan budget
      (fail-closed only after the budget, preserving the loop/step caps and the HITL/policy plane
      untouched).
- [ ] Delete the subsumed static hint strings in the proving PR; update the prompt-string tests
      ([`reactor-prompt.test.ts`](../../packages/orchestrator/src/reactor-prompt.test.ts)).
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- Lane A (reactor/planner-adjacent).
- The **per-step verifier stays deterministic** change-detection — the gap being closed is the
  *replan*, not a second LLM verifier per step (v1 audit's reading, kept).
- If C1's residual makes this a close-out PR, the file records that decision and the track moves on —
  a phase shrinking on evidence is the system working.
