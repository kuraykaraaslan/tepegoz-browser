# Phase M1 — Baseline Zero (Measurement)

**Status:** ⬜ Not started  ·  **Depends on:** — (first phase of v2)  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** Make the harness **statistically honest** and produce the track's first **valid baselines** —
the denominator every later phase's exit delta divides by. Two PRs of code plus a set of **sweep
artifacts** (runs, not PRs) that are exit-blocking. M1 lands the
[statistical constitution](README.md#statistical-constitution-binds-every-phase) as code + process.

## Why

No valid full-registry baseline exists: the 2026-07-24 per-trial-isolation fixes invalidated **every**
prior `REPEAT>1` figure (see [`archive/README-v1.md`](archive/README-v1.md), 2026-07-24 note). All live
numbers to date are gpt-4o; the Anthropic product default has never been measured. Cost is token counts
only (the `estimateCostUsd` helper exists but is dead in the report path), wall-clock is sum-of-steps,
and a `2/3` is indistinguishable from a regression. Honest measurement is also the competitive
counter-weapon: the public web-agent leaderboards are in a documented methodology crisis
(arXiv:2504.01382) — the agent that can *prove* its numbers wins the argument.

## Exit criteria (DoD)

- [ ] **Escape-family baseline table** in the eval-results ledger: ~7 escape-prone scenarios × **N≥10**,
      k/N + Wilson 95% CI + $/task + wall-clock per scenario, on **both** gpt-4o and the **Anthropic
      product default** — and the question *"is escape model-specific?"* answered in writing **before**
      [C1](phase-ai-c1-structured-state-replan.md) builds.
- [ ] **Full-registry coverage sweep** (N=3, flaky-tagged) published; zero structurally-unpassable
      scenarios remain (`login_form` re-scoped to assert the Human-Handoff fires and passing on the new
      assertion).
- [ ] **Cost + wall-clock schema-enforced** in every trial record (a record missing them fails
      validation); Wilson CIs + pooled dev/held-out aggregates in the report; flaky classification live.
- [ ] **CI gate** on the **pooled held-out aggregate** (rolling multi-night window, pre-registered
      margin) in the nightly workflow; single provider nightly, dual-provider weekly.
- [ ] `s03` fixtures landed (file-download; broken-HTML/conflicting-selector stress); **realUrl
      stratum** exists (≥5 seed scenarios), explicitly **non-blocking** and outside the frozen diff-base.
- [ ] **`cookie_consent` root-cause diagnosis** (from trial transcripts — recorded, not fixed;
      [C4](phase-ai-c4-obstructed-pages.md) consumes it) and the **pre-registered vision-gate
      threshold** for [F1](phase-ai-f1-vision-evidence-gated.md) committed.
- [ ] Judge calibration set grown toward ≥25 human labels (today: 1); judge remains claim-barred until
      then.
- [ ] **Re-prioritization checkpoint held at close:** if the full baseline disagrees with the C1..C5
      failure ranking, the plan is re-cut against the data — recorded either way.
- [ ] Deltas recorded in the eval-results ledger (this phase *is* the ledger's new foundation).
      **i18n:** none expected (dev-only harness; any Agent Console string → EN+TR in the owning dict).

## Tasks

### PR1 — statistics + hygiene (unblocks C1)
- [ ] Wire the existing-but-dead [`estimateCostUsd`](../../packages/orchestrator/src/acceptance-eval.ts)
      into the report path ([`report.ts`](../../packages/agent-eval/src/report.ts)) with a
      price-per-token table; capture per-trial **end-to-end wall-clock** in
      [`harness-run.ts`](../../packages/agent-eval/src/harness-run.ts) `runOne`; both schema-enforced on
      the trial record.
- [ ] `statistics.ts` in `packages/agent-eval/src`: **Wilson 95% interval**; per-scenario **flaky
      classification** (0<k<N; cross-sweep tag via the existing `latestArchivedRun` prior); pooled
      dev/held-out aggregate lines in the report. Unit tests beside the existing scorer/report tests.
- [ ] **Re-scope `login_form`** ([`web-patterns.json`](../../packages/agent-eval/scenarios/web-patterns.json)):
      as written it is a **permanent false negative** — its "log in and read the welcome" assertion
      collides with the agent's own *never auto-submit credentials* posture. Extend
      [`EvalScenarioSchema`](../../packages/shared-types/src/eval-scenario.ts) with a success variant
      asserting the run **ends in Human-Handoff**; zod `safeParse` at the registry boundary as today.
- [ ] **Consecutive-read budget cap** in [`reactor.ts`](../../packages/orchestrator/src/reactor.ts):
      the loop detector's read exemption is exactly why one live trial burned **22 consecutive
      `browser_get_elements` calls** unpunished — N identical consecutive reads with an unchanged page
      signature (default ~5) triggers the one structured recovery nudge, then `loop_detected`. The
      structural fix (read-dedupe by construction) is [C3](phase-ai-c3-perception-economy.md)'s; this
      cap stops the bleed. Regression test: the 22-read pathology becomes a unit case.

### PR2 — fixtures + gate
- [ ] `s03` fixtures: **file-download** and **broken-HTML/conflicting-selector** stress (every current
      fixture is well-formed).
- [ ] **realUrl stratum**: ≥5 seed open-web scenarios (the schema's `realUrl` target shape has zero
      users today), own trend line, never in blocking CI or the frozen diff-base (live sites drift).
- [ ] Nightly CI ([`eval-nightly.yml`](../../.github/workflows/eval-nightly.yml)): gate on the pooled
      held-out aggregate vs a rolling window with a pre-registered margin (warn → issue, still
      non-blocking for merges).

### Sweep artifacts (runs — exit-blocking, not PR-shaped)
- [ ] Dual-provider escape-family baseline (N≥10) · full-registry N=3 flaky-tagged sweep ·
      `cookie_consent` transcript diagnosis · the F1 vision-gate threshold (written **now**, before
      anyone wants vision) · judge-label seeding · the re-prioritization checkpoint note.

## Scope notes
- Measurement-only: **no agent-behaviour change** lands here beyond the read cap (a run-away guard,
  regression-tested) and the `login_form` contract fix.
- Absorbs all of v1 [AI-1](archive/phase-ai-1-eval-harness.md)'s remainder (`s02` N≥3 run, `s26`
  cost/duration, `s27` CI/flaky, `s03`, provider cross-check) and v1 AI-8B's N-confirmation
  (`silent_api_failure` rides the escape-family sweep). `s28` adversarial fixtures route to
  [C7](phase-ai-c7-adversarial-robustness.md), not here.
- The dual-provider run is a **static cross-check**, not routing —
  [Phase 8](../phase-8-local-intelligence-sovereignty.md)'s learned router is unrelated.
