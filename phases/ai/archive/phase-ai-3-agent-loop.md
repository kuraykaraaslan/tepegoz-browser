# Phase AI-3 — Agent Loop: Planner-as-Validator + Progress Memory

**Status:** 🟡 In progress (PR1 + PR2 landed: progress-brain fields + transient page-state; **planner-as-validator** completion authority (actor's `finish` is only a claim) + periodic done-check + fail-closed reject cap. **PR3 landed (code):** stale-ref / re-click-loop guard via a host-computed **structural page-signature** (`sig`, shadow/iframe-piercing) consumed by `browser_update_page`, plus a loop-detector **recovery nudge** with idempotent reads exempted — shipped with a mechanism deviation from the original plan, see the Stale-DOM guard task. **PR3 remaining:** on-harness measurement.)  ·  **Depends on:** [AI-1](phase-ai-1-eval-harness.md)  ·  **Track:** [`phases/ai`](README.md)
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
- [x] Guard the stale-ref / already-effected-click / **re-click-loop** failure class. *(PR3 — shipped with a **mechanism deviation** from the spec above. Instead of a pre-action branch-path-hash **subset** check that re-perceives before acting, the host computes a compact **structural signature** (`sig`) over the visible actionable set — piercing **open shadow roots + same-origin iframes** to match AI-2's clickable surface — returned from `readPage` ([`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts)). `browser_update_page` compares it ([`browser-tools.ts`](../../packages/browser-tools/src/browser-tools.ts) `pageChanged`/`structuralOnlyChange`) so an in-place SPA toggle (menu/drawer/panel) that leaves url/title/innerText untouched is no longer mis-reported as a no-op — the false `changed:false` that drove re-click loops — and returns a re-read `note`; `scroll` is special-cased so a viewport move never reads as "a menu opened". The reactor then gives **one** structured recovery nudge before conceding `loop_detected`, and **idempotent reads (`dangerClass:'read'`) are exempt** from the run-global loop counter so re-reading state every step is never mistaken for a loop ([`reactor.ts`](../../packages/orchestrator/src/reactor.ts)). The proactive branch-path-hash subset re-perceive reusing AI-2's `markNewElements` fingerprints is **not** built — the reactive `sig` supersedes it for this failure class; if a proactive pre-action guard is later wanted it is a separate task. Unit-tested (plumbing/regression only; competence still pends the on-harness measurement below).)*

## Scope notes
- This deepens, but does not conflict with, [Phase 1b](../phase-1b-agentic-deepening.md)'s durable-resume /
  parallel-DAG work — those are orthogonal (durability, parallelism), this is single-run loop authority.
- Multi-action batching (an actor emitting an action *sequence* per call) is **optional** and deferred; land
  the validator + memory + transient-state first, measure, then decide if batching is worth the complexity.

## Audited gaps (external review, 2026-07)

The 2026-07 audit confirmed the Observe→Decide→Act→Verify→Update loop, the goal-level validator, the error
taxonomy, and the action-signature loop-detector are all real and wired. Three deepenings remain:

- [ ] **`s15` — structured working-state (not chat-resident).** The model's actual working memory is a
      **free-text `memory` string carried in the chat history** plus a transient last-perception blob — the
      *opposite* of a structured state object. A structured record **does** exist
      ([`run-lifecycle.ts` `AgentRunCheckpoint`](../../packages/agent-runtime/src/run-lifecycle.ts):
      `url`/`title`/`tabId`/`lastSuccessfulStep`/`lastFailure`) but it is wired to the **journal for durable
      resume**, never fed back into the model's context, and omits selected-records / filled-fields /
      completed-subtasks / pending-verifications. Give the actor a typed working-state it reasons over
      (open tabs, selected records, filled fields, done sub-tasks, pending verifications) instead of relying
      on chat-resident prose.
- [ ] **`s14` — run-level no-progress + replan-after-N.** The loop-detector keys on the **action signature**,
      not the page-**state** hash: a real `sig` is computed but consumed only by `browser_update_page`'s
      per-action `changed`, never as a cross-step "state unchanged for N steps → stop" signal. And "after N
      failed steps, generate a new plan" is **not** built — `maxRecoveryAttempts` fails **closed** and ends
      the run; the periodic `Planner.validateCompletion` only judges done/not-done and never regenerates a
      path. Add a run-level state-hash no-progress detector and a genuine replan trigger.
- [ ] **`s07` — a real Replanner role.** Of the suggested Planner/Executor/Verifier/Replanner split, only a
      reactive one-action Executor and a **goal-level** (not per-step) Verifier operate live; the Planner's
      step DAG is discarded to a guidance outline, and there is **no Replanner** — recovery is a static
      per-error-kind hint string. When the no-progress detector (`s14`) or the completion validator rejects
      progress, route to a `Planner.replan(goal, history, whatFailed)` that produces a *new* approach, rather
      than only pushing a "keep going" nudge. (Per-step verification staying deterministic change-detection is
      fine; the gap is the *replan*, not a second LLM verifier per step.)
