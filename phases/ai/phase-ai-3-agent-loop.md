# Phase AI-3 — Agent Loop: Planner-as-Validator + Progress Memory

**Status:** ⬜ Not started  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md)  ·  **Track:** [`phases/ai`](README.md)
**Goal:** Upgrade the run loop so the agent **doesn't give up prematurely** and doesn't loop: a periodic
**Planner acts as the completion validator** (the actor cannot self-declare success), the actor carries an
explicit **progress memory**, and page state is **pushed every step then kept transient** so context never
bloats. Ported from nanobrowser's two-agent loop into tepegoz's planner→reactor.

## Why (the systematic gap)

tepegoz plans **once**, then the reactor drives step-by-step and may `finish` with a give-up
("I couldn't find the blog") after reading a single page. In nanobrowser the Navigator's `done` is only a
*signal*; the **Planner's `done=true`** — run every N steps and right after a claimed done — is the sole
completion authority, so a premature give-up gets challenged and the run continues. This is the loop-level
fix for the exact failure we saw, and it is code, not a prompt sentence.

## What we port
1. **Planner-as-validator cadence:** the reactor runs to a step budget; a planner pass runs every
   `planningInterval` steps (default ~3) and whenever the actor claims completion; **only the planner's
   `done=true` terminates** the run and supplies the final answer.
2. **Actor progress "brain":** each decision carries `{ evaluation_previous_goal, memory, next_goal }`,
   where `memory` forces explicit counting ("2 of 10 done") — a strong anti-loop / progress signal.
3. **Transient page-state messages:** the verbose element list is added to the context, sent, then
   **immediately removed and replaced by the compact decision output**, so only one page-state blob is ever
   live and DOM dumps never accumulate across many steps.
4. **Stale-DOM guard:** when acting on an index after the page changed under it, detect via branch-path-hash
   subset check and re-perceive instead of acting on a stale ref (pairs with `*[n]` from AI-2).

## Exit criteria (DoD)
- [ ] The actor can **no longer unilaterally end** the run by "finishing"; a periodic Planner validates completion and is the only terminator (with the final answer). Fail-closed after the step budget / consecutive-failure cap.
- [ ] Each decision includes `evaluation_previous_goal` / `memory` / `next_goal`; `memory` is carried across steps and used for progress/counting.
- [ ] Page-state messages are transient (added → removed → replaced by compact output); long runs do not accumulate DOM dumps (measured token growth is bounded).
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** the "gave up after one page" scenario (blog behind a menu / not on the landing page) flips from fail → pass with the real model; no regression on the held-out set; loop/step caps still terminate pathological runs.
- [ ] Existing recovery taxonomy ([`recovery.ts`](../../packages/orchestrator/src/recovery.ts)) and HITL/policy gates preserved (this changes *cadence/authority*, not the security plane).
- [ ] **i18n:** none expected (internal). Coverage + self-review + acceptance metrics stay green.

## Tasks

### Completion authority
- [ ] In [`packages/orchestrator/src/reactor.ts`](../../packages/orchestrator/src/reactor.ts) / [`packages/agent-runtime/src/agent-runtime.ts`](../../packages/agent-runtime/src/agent-runtime.ts): make a periodic Planner pass the completion validator; the reactor's `finish` becomes a *claim* that forces the next planner pass rather than terminating. Keep `maxSteps` + consecutive-failure fail-closed.
- [ ] Planner completion output supplies the `final_answer`; wire it to the run summary/Agent Console.

### Progress brain
- [ ] Extend the actor decision schema with `evaluation_previous_goal` / `memory` / `next_goal` (zod at the untrusted-model boundary, mirroring `parseDecision`'s tolerance). Persist `memory` in the retained decision output across steps.

### Context control
- [ ] Add-then-remove page-state message handling so only the latest state blob is live; the persistent history is the compact decisions + selected observations (+ plan text). Keep a hard token cap as a secondary guard.

### Stale-DOM guard
- [ ] Before an index-based action following a page change, compare branch-path-hash sets (from AI-2) and re-perceive if the DOM is no longer a subset; otherwise proceed.

## Scope notes
- This deepens, but does not conflict with, [Phase 1b](../phase-1b-agentic-deepening.md)'s durable-resume /
  parallel-DAG work — those are orthogonal (durability, parallelism), this is single-run loop authority.
- Multi-action batching (an actor emitting an action *sequence* per call) is **optional** and deferred; land
  the validator + memory + transient-state first, measure, then decide if batching is worth the complexity.
