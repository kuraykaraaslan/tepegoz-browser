# Phase AI-3 — Agent Loop: Planner-as-Validator + Progress Memory

**Status:** 🟡 In progress (PR1 + PR2 landed: progress-brain fields + transient page-state; **planner-as-validator** completion authority (actor's `finish` is only a claim) + periodic done-check + fail-closed reject cap. **PR3 remaining:** stale-DOM guard + on-harness measurement.)  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md)  ·  **Track:** [`phases/ai`](README.md)
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
- [x] The actor can **no longer unilaterally end** the run by "finishing"; a periodic Planner validates completion and is the only terminator (with the final answer). Fail-closed after the step budget / consecutive-failure cap. *(PR2: `Reactor.validateCompletion` option — the actor's `finish` is a claim that `Planner.validateCompletion` must confirm; only `done:true` ends the run with the authoritative `final_answer`; a periodic pass (`planningInterval`, default 3 actions) also ends it if the goal is already met; `maxCompletionRejects` concedes to the actor rather than looping forever; `maxSteps` still caps. Wired on in agent-runtime; the validator call routes through ModelGateway so the Egress-Firewall + TokenLedger apply. Unit-tested.)*
- [x] Each decision includes `evaluation_previous_goal` / `memory` / `next_goal`; `memory` is carried across steps and used for progress/counting. *(PR1: added to the `act`+`finish` `DecisionSchema` as tolerant optionals; the system prompt requests them and frames `memory` as a running progress ledger; the compact decisions (with `memory`) are the persistent history — see transient-state below.)*
- [x] Page-state messages are transient (added → removed → replaced by compact output); long runs do not accumulate DOM dumps (measured token growth is bounded). *(PR1: observations over `STATE_COLLAPSE_THRESHOLD` are page-state; when a new one arrives the previous is collapsed to a placeholder, so exactly one full page-state is ever live. Unit-tested.)*
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness:** the "gave up after one page" scenario (blog behind a menu / not on the landing page) flips from fail → pass with the real model; no regression on the held-out set; loop/step caps still terminate pathological runs. *(Owed — the validator (PR2) is the give-up fix; the loop mechanics are unit-verified, but the real fail→pass with the product model still pends the Electron-ABI eval env, same blocker as AI-1/AI-2.)*
- [x] Existing recovery taxonomy ([`recovery.ts`](../../packages/orchestrator/src/recovery.ts)) and HITL/policy gates preserved (this changes *cadence/authority*, not the security plane). *(PR1 touches only the actor decision shape + context bookkeeping; the ToolGateway PEP, loop/step caps, recovery, and guard paths are unchanged — all 27 reactor tests green.)*
- [x] **i18n:** none (internal). PR1 coverage: brain-field parsing, transient-state collapse (message capture across turns), and prompt guidance; self-review.

## Tasks

### Completion authority
- [x] In [`reactor.ts`](../../packages/orchestrator/src/reactor.ts) / [`agent-runtime.ts`](../../packages/agent-runtime/src/agent-runtime.ts): a periodic Planner pass is the completion validator; the reactor's `finish` becomes a *claim* (`settleClaim`) — only `Planner.validateCompletion`'s `done` terminates. `maxSteps` + `maxCompletionRejects` fail-closed. *(Validator is opt-in on `ReactOptions`; agent-runtime enables it — legacy reactor callers keep direct-finish behaviour.)*
- [x] `Planner.validateCompletion` supplies the `final_answer`; wired to the run summary (`ReactResult.summary` → the terminal Agent Console line).

### Progress brain
- [x] Extend the actor decision schema with `evaluation_previous_goal` / `memory` / `next_goal` (zod at the untrusted-model boundary, mirroring `parseDecision`'s tolerance — all optional so weak models still parse). Persisted implicitly: the retained assistant decisions carry `memory` across steps.

### Context control
- [x] Add-then-collapse page-state handling so only the latest state blob is live; the persistent history is the compact decisions + selected observations (+ plan text). `MAX_OBSERVATION_CHARS` remains the per-observation hard cap.

### Stale-DOM guard
- [ ] Before an index-based action following a page change, compare branch-path-hash sets (from AI-2) and re-perceive if the DOM is no longer a subset; otherwise proceed. *(PR2 — pairs with AI-2 `*[n]`/fingerprints.)*

## Scope notes
- This deepens, but does not conflict with, [Phase 1b](../phase-1b-agentic-deepening.md)'s durable-resume /
  parallel-DAG work — those are orthogonal (durability, parallelism), this is single-run loop authority.
- Multi-action batching (an actor emitting an action *sequence* per call) is **optional** and deferred; land
  the validator + memory + transient-state first, measure, then decide if batching is worth the complexity.
