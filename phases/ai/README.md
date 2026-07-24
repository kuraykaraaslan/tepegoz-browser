# AI Agent Competence Track v2 (`phases/ai/`)

The roadmap that takes the **agent (Do mode)** from "genuinely wired backbone" to **the world's best
browser agent** — and makes that claim *falsifiable* instead of marketing. v2 supersedes the v1 track
(AI-1 … AI-8), which is preserved verbatim with all of its dated measurement history in
[`archive/`](archive/README.md); the [old → new mapping](#old--new-mapping) below says where every
remaining item went.

> **Relationship to the main roadmap:** unchanged from v1 — this deepens the agent work of
> [Phase 1a](../phase-1a-walking-skeleton-mvp.md) / [Phase 1b](../phase-1b-agentic-deepening.md); every
> cross-cutting compliance gate in [`../README.md`](../README.md) applies (zod boundary `safeParse`,
> `AppError`, per-package i18n, determinism-first, DoD coverage, no `apps/desktop` growth). Artifacts
> are **English-first**. The v1 build-vs-buy decision stands: **port proven techniques, never adopt**
> `browser-use`/`nanobrowser` as runtime dependencies (see `archive/README-v1.md`).

## North star — the falsifiable "world's best" claim

tepegoz claims *world's best browser agent* **only** when, at a dated release, **all four** hold:

1. **Head-to-head win.** It wins or ties a **pre-registered H2H battery** — ≥20 identical real-site
   tasks (≥10 Turkish-web, where no rival optimizes), task list + per-task rubrics committed to this
   repo **before** any agent runs, executed the same week on tepegoz, ChatGPT agentic browsing, Claude
   for Chrome, and Perplexity Comet, each at N≥3, scored blind from identity-stripped artifacts — on
   **verified-completion rate**: completions backed by network/page evidence, not model say-so.
2. **Bounded, honest injection ASR.** Published prompt-injection attack-success-rate on a corpus that
   includes externally-sourced attacks, reported as *"k successes in K trials, 95% binomial upper
   bound X%"* — upper bound ≤5% initially, a ≤1%-bound statement only at ≥300 pooled clean trials.
   Never framed as "beats Claude's ~1%" (incommensurable corpora).
3. **Fabricated-success ≈ 0.** On trap fixtures where the page lies about success ("Saved!" over a
   5xx), the agent reports the truth — a metric no rival publishes.
4. **Cost honesty.** $/task and wall-clock/task published alongside, competitive on first contact and
   measurably dropping on repeat domains.

Every internal number comes from the **real product model driving the real app** (all security planes
ON, real gestures), ground-truth scored, held-out protected, at the N policy below, regenerable from a
repo checkout. The H2H is explicitly a **dated research artifact outside the regenerability promise**,
re-run quarterly; the claim carries a freshness date and **is withdrawn the moment it fails to
reproduce**. Version 1 of the H2H is published even if tepegoz loses — losing honestly prices the gap.

## Statistical constitution (binds every phase)

The v1 lesson: gates specified at an N where they are noise, and "code landed, numbers owed" drift.
These rules are part of every phase's DoD:

- **Two-tier N policy.** Claim-bearing target scenarios: **N≥10** per scenario (or family-pooled
  30–70 trials) with **Wilson 95% CIs**; gates are defined on **pooled family aggregates** with a
  pre-stated detectable effect — never on a one-trial 1/3 → 2/3 flip. Broad registry coverage: N=3
  with **flaky tagging** (0<k<N over two sweeps → tagged, excluded from blocking gates, reported).
- **Fixture freeze.** A phase's exam fixtures are merged and frozen **before** its capability code
  lands. No phase authors and passes its own exam in one PR.
- **Attribution.** Parallel development is allowed; parallel exit measurement is not. Each phase's
  before/after runs on a branch containing only that phase's change; exit sweeps are serialized.
- **Anti-debt rule.** *Owed measurement* is a first-class status in the phase index; a phase is
  incomplete until its delta is recorded in the eval-results ledger; **no new phase opens while more
  than one phase sits measurement-owed.**
- **Judge discipline.** The secondary LLM judge is claim-barred until its calibration set reaches
  **≥25 human labels** (today: 1); the bridge's first run gets 100% human verification of judge
  verdicts, ≥30% thereafter.

## Consolidation as a DoD rule (replaces v1's AI-6 phase)

Every capability phase **deletes the prose steer it subsumes in the same PR** that proves the measured
delta, gated by a paired with/without sweep on the affected fixture family at pooled N with a
pre-stated equivalence margin. The living prose-debt ledger is [`PROSE-LEDGER.md`](PROSE-LEDGER.md);
each line ends **DELETED** (linking its proving sweep) or **RETAINED** (with a one-line justification
as genuinely open-ended judgement). AI-7's `/blog`-prose deletion already proved the pattern.

## Phase index — three layers

| ID | Layer | File | Goal | Depends on | Status |
|---|---|---|---|---|---|
| M1 | Measurement | [phase-ai-m1-measurement-baseline.md](phase-ai-m1-measurement-baseline.md) | Baseline Zero: statistics constitution wired, valid dual-provider baselines, scenario hygiene, diagnosis artifacts | — | ⬜ Not started |
| M2 | Measurement | [phase-ai-m2-external-yardstick.md](phase-ai-m2-external-yardstick.md) | Bridge subset (credibility) + H2H battery (the only claim-bearing cross-agent instrument) | M1 (probe after C2; claim after C5+C7) | ⬜ Not started |
| C1 | Core | [phase-ai-c1-structured-state-replan.md](phase-ai-c1-structured-state-replan.md) | Typed working-state + state-hash no-progress replan — kill the measured escape ceiling | M1 PR1 | 🟠 Measurement-owed (PR1+PR2 code landed; exit sweep owed) |
| C2 | Core | [phase-ai-c2-replanner.md](phase-ai-c2-replanner.md) | A real Replanner authority replacing static hint strings | C1 | ⬜ Not started |
| C3 | Core | [phase-ai-c3-perception-economy.md](phase-ai-c3-perception-economy.md) | Read-dedupe by construction, identity-stable refs, diff updates | M1 | ⬜ Not started |
| C4 | Core | [phase-ai-c4-obstructed-pages.md](phase-ai-c4-obstructed-pages.md) | Action-time occlusion re-check, locator cascade, cookie-consent fix, modal recovery | M1 (diagnosis) | ⬜ Not started |
| C5 | Core | [phase-ai-c5-tabs-popups-widgets.md](phase-ai-c5-tabs-popups-widgets.md) | Tab-spawn world model, send-keys, quantized scroll, typed-widget fill | M1 | ⬜ Not started |
| C6 | Core | [phase-ai-c6-verified-outcomes.md](phase-ai-c6-verified-outcomes.md) | Evidence-cited completion + the fabricated-success metric (the honesty moat) | C1 | ⬜ Not started |
| C7 | Core | [phase-ai-c7-adversarial-robustness.md](phase-ai-c7-adversarial-robustness.md) | Strict-mode wiring + attack battery + honest bounded ASR | M1 (PR1 early); C4/C5 (claim-grade run) | ⬜ Not started |
| F1 | Frontier | [phase-ai-f1-vision-evidence-gated.md](phase-ai-f1-vision-evidence-gated.md) | Vision, evidence-gated: CanonMessage image blocks + adapters + set-of-marks, escalation-only | M1 gate artifact; C3 | ⬜ Not started (gate pre-registered in M1) |
| F2 | Frontier | [phase-ai-f2-structured-data.md](phase-ai-f2-structured-data.md) | Tables/lists as typed data with clickable cell refs | M1 (cheaper after C3) | ⬜ Not started |
| F3 | Frontier | [phase-ai-f3-domain-memory.md](phase-ai-f3-domain-memory.md) | Per-domain observation memory: re-validated, advisory-only, repeat-visit speedup | C3, C1 | ⬜ Not started |

Status legend: ⬜ Not started · 🟡 In progress · 🟠 **Measurement-owed** (code landed, delta not yet in
the ledger — counts against the anti-debt rule) · ✅ Done (DoD passed, delta recorded).

## Sequencing

**Lane discipline:** at most two phases in flight. Lane A (reactor/loop-adjacent) is strictly
serialized — never two phases touching the reactor concurrently. Exit sweeps always serialized, each
on a single-change branch.

1. **M1 PR1 immediately** — it alone unblocks C1; the dual-provider escape-family baseline answers
   *"is escape gpt-4o-specific?"* **before** C1 builds. M1 close includes a mandatory
   **re-prioritization checkpoint**: if the full baseline disagrees with this plan's failure ranking,
   re-cut C1..C5 rather than defend the document.
2. **Lane A: C1 → C2 → C3 → C4 → C5.** The measured escape ceiling first (highest leverage), then
   economy (it compounds — every later N≥10 sweep gets cheaper), then the two diagnosed interaction
   classes. Exception: if M1's cookie-consent diagnosis shows a small click-path/occlusion bug, C4
   jumps ahead of C3.
3. **Lane B in parallel: C7 PR1** (strict-mode wiring + battery build — guard code path, no reactor
   collision), then **C6 after C1** (needs the typed-state substrate).
4. **M2 PR1 bridge probe right after C2** — early external falsifiability; a bad honest number is a
   valid, useful result.
5. **Frontier by evidence:** F1's gate is evaluated on the post-C4/C5 failure taxonomy against the
   threshold **pre-registered in M1** ("deferred" is a valid documented exit); F2 any time after M1;
   F3 after C3 (memory without identity-stable refs caches positional garbage).
6. **C7 claim-grade ASR after C4/C5** (measuring ASR at 1/3 benign competence inflates the safety
   number), **M2 claim-grade H2H last** — when the moat columns (ASR bound, fabricated-success,
   repeat-visit speedup, $/task) have numbers rivals cannot match.

## Old → new mapping

Honest carried-over status as of 2026-07-24. The **only valid live numbers** are
`form_validation_required` **1/3** and `silent_api_failure` **1/3** (gpt-4o, N=3, first genuinely
independent trials — the 2026-07-24 five-defect fix invalidated every earlier `REPEAT>1` figure,
including the 2026-07-10 77.8%/40% headline). Verified from archives: `cookie_consent` is **0/3 with
zero escapes** (a distinct interaction gap, not escape) and `login_form` is a **permanent false
negative as written** (its assertion collides with the agent's own "never auto-submit credentials"
posture). Registry today: **28 scenarios / 27 local fixtures / 9 held-out** (v1 docs' "23 scenarios"
was stale).

| v1 | What landed (real, wired, default-on) | Remaining → v2 home |
|---|---|---|
| [AI-1](archive/phase-ai-1-eval-harness.md) | `_electron` harness drives the real app; zod scenario registry; ground-truth scorer + secondary judge; `TEPEGOZ_EVAL_REPEAT` k/N majority; escape metric; per-trial isolation (2026-07-24) | Valid baselines, cost/wall-clock wiring, Wilson CI + flaky (s27), s03 fixtures, realUrl stratum, provider cross-check → **M1**; open-web at scale → **M2** |
| [AI-2](archive/phase-ai-2-perception-buildtree.md) | Render-DOM perception default-on: interactivity/occlusion/viewport, open shadow + same-origin iframes, `*[n]` marking, validation attrs | Identity-stable refs, diff updates, `aria-labelledby`/`label-for` → **C3**; s05 occlusion re-check + locator cascade, closed-shadow/cross-origin go/no-go → **C4** |
| [AI-3](archive/phase-ai-3-agent-loop.md) | Progress brain; planner-as-validator completion authority; loop detector (read-exempt); structural page-signature stale guard; 11-kind recovery taxonomy | Typed working-state (s15) + no-progress replan (s14) → **C1**; Replanner (s07) → **C2** |
| [AI-4](archive/phase-ai-4-action-vocabulary.md) | `scroll_to_text`, `select_option`, fill read-back verification, `browser_validate_form` (s16); measured 0/3 → 1/3 | send-keys, tab auto-switch/popup return (s18), quantized scroll, typed widgets → **C5**; the form k/N gate itself → **C1** |
| [AI-5](archive/phase-ai-5-content-security.md) | Inbound content-guard default-on (NFKC, injection redaction, forged-tag strip, taint taxonomy); SECURITY_PREAMBLE | Strict-mode wiring (landed but unreachable), attack battery, on-harness ASR (s28) → **C7** |
| [AI-6](archive/phase-ai-6-consolidation.md) | Never started as a phase | Re-scoped to the **Consolidation-as-DoD rule** + [`PROSE-LEDGER.md`](PROSE-LEDGER.md) |
| [AI-7](archive/phase-ai-7-navigation-grounding.md) | Grounded candidate resolver (no ungrounded URL ever proposed); SSRF-safe sitemap/robots reader; escape metric + trap fixtures; `/blog` prose deleted | The owed live escape numbers → **C1** exit sweep |
| [AI-8](archive/phase-ai-8-beyond-the-port.md) | 8B network recorder landed + live-proven once (the 507 capture); 8A honesty fix (nothing recommends the blind screenshot tool) | 8A vision → **F1**; 8B close-out + fabricated-success → **C6** (`silent_api_failure` k/N is owned by **C1**); 8C tables → **F2**; 8D memory → **F3** |

## Routing — reference, never duplicate

| Belongs to | Material |
|---|---|
| [Phase 1b](../phase-1b-agentic-deepening.md) | Parallel multi-tab DAG, durable resume, GB-scale tiered memory + HybridRetriever, SkillRuntime (authored skills), tepegoz-as-MCP-server, local SLM |
| [Phase 6](../phase-6-deterministic-automation.md) | Deterministic model-free signed recipes, self-healing selectors, success oracle, scheduler. F3's ownership test: *"if the model could be removed from the replay, it's Phase 6"* |
| [Phase 8](../phase-8-local-intelligence-sovereignty.md) | Sovereign mode, provider trust mesh, knowledge graph, learned ModelRouter, speculative two-tier. M1's dual-provider work is a static cross-check, not routing |
| [Phase 9](../phase-9-safe-autonomy-delegation.md) | Transaction mandates, signed policy bundles (**publishes C7's measured ASR**), governed endpoints |

**Never:** auto-judge headline numbers; anchoring to vendor self-reports (the Online-Mind2Web 97–99%
self-submissions sit on the same board as independently-listed ~58% for Operator — a methodology
crisis, arXiv:2504.01382, not a 40-point capability gulf); screenshots-every-step vision; "ASR ≤1%"
claims from double-digit trial counts; Python sidecar / second Chromium / vendor SDKs.

## Results ledger & operations

- [`eval-results-2026-07.md`](eval-results-2026-07.md) — the dated results ledger (continues; every
  phase exit records its before/after here or in a successor dated file).
- [`eval-loop-runbook.md`](eval-loop-runbook.md) — how to run the loop (knobs, gotchas, authoring,
  the iteration discipline).
- H2H protocol, rubrics, and recordings index will live under `phases/ai/` as versioned,
  pre-registered artifacts (M2).
