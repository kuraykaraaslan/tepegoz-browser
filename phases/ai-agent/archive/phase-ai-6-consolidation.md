# Phase AI-6 — Consolidation: Retire Prose + Institutionalise the Loop

**Status:** ⬜ Not started · **Depends on:** [AI-2](phase-ai-2-perception-buildtree.md), [AI-3](phase-ai-3-agent-loop.md) · **Track:** [`phases/ai`](README.md)
**Goal:** Once the code capabilities are proven to subsume the interim prompt patches, **remove the
patches** (keep the prompt small and general), and make the failure→scenario→fix→eval loop the **standing
practice** so the agent keeps improving without prose accretion.

## Why

The track's whole thesis is _code > prose_. The hand-written "REVEAL hidden navigation / collapsed menu /
try `/blog`" heuristics were a deliberate stop-gap (see [`README.md`](README.md) "Interim state"). Leaving
them after the capability lands would be dead weight and would re-introduce the fragility we set out to
remove. But we only remove them **after the eval proves** the capability covers the same cases — never on
faith.

## Exit criteria (DoD)

- [ ] The interim heuristics are removed **only where an eval scenario proves** the AI-2 perception (+ AI-3 loop, AI-4 actions) covers the case: the "REVEAL hidden navigation / collapsed menu" lines in the reactor `BROWSING_STRATEGY` and the parallel planner prose and the `browser_get_elements` description note. Any genuinely open-ended heuristic that is _not_ subsumed (e.g. a general "prefer a known URL path" reasoning nudge) is kept, intentionally, and documented as such.
- [ ] Removing each patch causes **no regression** on the real-model eval (before/after recorded); if it does, the patch stays and a follow-up capability gap is filed.
- [ ] The prompt-string tests ([`reactor.test.ts`](../../../packages/orchestrator/src/reactor.test.ts) / [`planner.test.ts`](../../../packages/orchestrator/src/planner.test.ts)) are updated to match the trimmed, general prompt.
- [ ] A short **process doc** exists (CONTRIBUTING section or `phases/ai` doc): failure → add golden scenario → diagnose (systematic → code / open-ended → small general heuristic) → prove pass-rate up on the real-model eval → green, no regression.
- [ ] The live eval runs on a schedule with a pass-rate **threshold + trend**; a regression opens an issue instead of silently passing. The offline tier is in the CI coverage gate.
- [ ] **i18n:** none expected. Coverage + self-review.

## Tasks

- [ ] Audit the interim prose against the eval: for each heuristic, confirm a scenario exercises the case and passes **without** the prose (capability-covered) or document why it stays.
- [ ] Trim [`packages/orchestrator/src/reactor.ts`](../../../packages/orchestrator/src/reactor.ts) `BROWSING_STRATEGY` + the planner prose + the `browser_get_elements` description; keep only small, general, non-subsumed heuristics.
- [ ] Update prompt-string tests to the trimmed content.
- [ ] Write the process doc; link it from [`README.md`](README.md) and the main [`../README.md`](../README.md).
- [ ] Wire the scheduled live eval + threshold/trend alerting; confirm the offline acceptance tier rides the CI coverage gate.
- [ ] Update the AI-track [`README.md`](README.md) index statuses and fold notable outcomes into the Phase 1a/1b "hardening track" list, per the repo convention.

## Scope notes

- "Retire prose" is **not** "remove all guidance" — it's remove _scenario-specific patches that code now
  covers_. A minimal, general strategy prompt remains (tab reuse, verify-after-act, don't-give-up framing).
- This phase is the ongoing home for the practice: future failures re-enter at [AI-1](phase-ai-1-eval-harness.md)
  (new scenario) and are fixed by the most-general lever available (perception/action/loop before prose).
