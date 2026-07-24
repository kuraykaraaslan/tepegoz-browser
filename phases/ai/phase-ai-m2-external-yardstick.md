# Phase M2 — External Yardstick: Bridge Subset + Head-to-Head (Measurement)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md) (bridge probe
runs after [C2](phase-ai-c2-replanner.md); claim-grade H2H after [C5](phase-ai-c5-tabs-popups-widgets.md)
+ [C7](phase-ai-c7-adversarial-robustness.md)'s claim-grade ASR)  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** The two instruments that make the [north-star claim](README.md#north-star--the-falsifiable-worlds-best-claim)
falsifiable **outside** our own harness: a pre-registered **bridge subset** (credibility needle) and the
**head-to-head battery** (the *only* claim-bearing cross-agent instrument). Two PRs of protocol/tooling
plus a **named ops budget** — H2H execution is not PR-shaped work and is not pretended to be.

## Why

"World's best" is unfalsifiable from an internal fixture suite alone, and comparing our numbers to
vendor leaderboard self-reports is apples-to-oranges by construction (browser-use's self-submitted ~97%
sits on the same Online-Mind2Web board as an independently-listed ~58% for Operator — a methodology
crisis, arXiv:2504.01382, not a 40-point capability gulf). The only honest paths are: (a) our own
pre-registered subset run under our own published methodology, and (b) identical tasks run on all four
products the same week, scored blind. Both are dated research artifacts, re-run per release/quarter,
**outside the repo-regenerability promise** (rivals drift weekly).

## Exit criteria (DoD)

- [ ] **Bridge subset pre-registered:** ~30–50 Online-Mind2Web/Skyvern-Web-Bench-style tasks
      (read/write mix preserved, **≥10 Turkish-web** tasks), the task list committed to the repo
      **before** the first run.
- [ ] **Bridge executed + published:** live through the real app on the M1 realUrl tier; **100%
      human verification of judge verdicts on run 1** (≥30% thereafter); published with Wilson CIs,
      $/task, wall-clock, and a methodology appendix explicit enough for a skeptic to re-run — framed
      as *"our subset, our methodology"*, **never juxtaposed with vendor leaderboard numbers**.
- [ ] **First probe run right after C2** — early falsifiability; a bad honest number prices the gap
      and is a valid, recorded result.
- [ ] **H2H protocol executed as pre-registered:** ≥20 identical real-site tasks (≥10 Turkish-web),
      per-task rubrics committed before any agent runs, same-week execution on tepegoz + ChatGPT
      agentic browsing + Claude for Chrome + Perplexity Comet, N≥3 each, scored **blind** from
      identity-stripped artifacts (or by a hired external rater); per-task win/lose/tie table +
      recordings archived, dated. **Version 1 is published even if tepegoz loses.**
- [ ] The comparison sheet carries the **moat columns** — ASR upper bound, fabricated-success rate,
      repeat-visit speedup, $/task, wall-clock — marked N/A where rivals publish nothing.
- [ ] The README **claim template** states exactly which north-star conditions are met/unmet; any
      claim carries a freshness date and a written withdrawal trigger; both instruments are wired to
      re-run per release/quarter.
- [ ] Deltas + artifacts recorded under `phases/ai/` (versioned rubrics, recordings index) and in the
      eval-results ledger. **i18n:** published artifacts are English-first; Turkish task prompts are
      preserved verbatim as data.

## Tasks

### PR1 — bridge subset
- [ ] Task-list pre-registration doc (committed before run 1); scenarios expressed in the existing
      zod registry (`realUrl` targets, [M1](phase-ai-m1-measurement-baseline.md) stratum).
- [ ] Human-verification workflow for judge verdicts (labels feed the M1 calibration set).
- [ ] Report shape: per-task k/N + CI, $/task, wall-clock, read-vs-write split.

### PR2 — H2H protocol tooling
- [ ] Pre-registered per-task rubrics; identity-stripped artifact-scoring workflow (recordings with
      product chrome removed, or an external rater); recordings index.
- [ ] **ToS review before v1** (driving rival products for benchmarking) — recorded outcome.
- [ ] Scheduling/ops runbook + the named ops budget (execution cost is a known number, not hidden
      inside "2 PRs").

### Execution (runs)
- [ ] Bridge probe (post-C2) → bridge claim-grade re-run as needed → H2H claim-grade
      (post-C5 + C7-claim; publishing during the escape era would be an own-goal, publishing without
      the moat columns wastes the shot).

## Scope notes
- Absorbs v1 [AI-1](archive/phase-ai-1-eval-harness.md)'s open-web/realUrl ambition at scale; consumes
  M1's statistics machinery unchanged.
- **Verified-completion scoring** (network/page evidence, not model say-so) reuses
  [C6](phase-ai-c6-verified-outcomes.md)'s evidence machinery on our side; rivals are scored from
  observable artifacts only.
- Blind scoring in a solo-owner project is a real constraint — the mitigations (pre-registration,
  artifact stripping, external rater) are part of the protocol, and their residual weakness is stated
  in the methodology appendix rather than hidden.
