# AI Agent Super — the sole authoritative agent competence roadmap (v3)

The program that takes tepegoz's **agent (Do mode)** from "genuinely wired backbone, thinly measured" to
a browser agent competitive with **Claude for Chrome** (reliability + safety) **and** **Perplexity
Comet** (assistant UX) — and keeps every claim **falsifiable and honestly measured**, never marketing.

> **This folder is the single authoritative AI roadmap.** It **supersedes and replaces** the v2 track
> in [`../ai/`](../ai/) (M1–M2 / C1–C7 / F1–F3). Those phase documents are retired by [S0](phase-s0-truth-and-repair.md);
> their still-valid machinery is **absorbed here, not destroyed** — the statistical constitution
> ([`constitution.md`](constitution.md)), the results ledger ([`eval-results.md`](eval-results.md)), the
> prose-debt ledger ([`PROSE-LEDGER.md`](PROSE-LEDGER.md)), the eval harness + frozen fixtures, and the
> v1 measurement history + build-vs-buy decision ([`history.md`](history.md)) all continue. The broader
> product phases ([1b](../product/phase-1b-agentic-deepening.md) / [6](../product/phase-6-deterministic-automation.md) /
> [8](../product/phase-8-local-intelligence-sovereignty.md) / [9](../product/phase-9-safe-autonomy-delegation.md)) stay,
> but their **AI-specific routing is dissolved** — this program now decides for itself what it owns; the
> [routing section](#routing--what-stays-out) records the boundary.

> **Compliance (binding):** every cross-cutting gate in [`../README.md`](../README.md) applies — strict
> TS (no `@ts-ignore`), zod `safeParse` at every trust boundary, `AppError`, per-package i18n (EN + full
> TR parity in the same PR), determinism-first, no `apps/desktop` growth, **no AI attribution trailers**
> (CI-enforced), sync-ready persistence. Binding ADRs: 0005 (provider-agnostic gateway), 0006
> (deterministic policy kernel, pre-model), 0007 (single tool plane), 0008 (DOM/a11y-first perception,
> vision as **fallback**), 0009 (`AppError`), 0010 (TS conventions + deviations), 0013 (agent
> orchestration + two-stage HITL, serialized execution — API is source of truth over docs), 0024 (action
> interception). New ADRs continue from **0025** (0024 is the current head).

## North star — the falsifiable "world's best" claim

The claim is **inherited verbatim** from v2 and stays binding. tepegoz claims *world's best browser
agent* **only** when, at a dated release, **all four** hold (full text in [`constitution.md`](constitution.md)):

1. **Head-to-head win** — a pre-registered H2H battery (≥20 identical real-site tasks, ≥10 Turkish-web),
   rubrics committed **before** any run, executed the same week vs ChatGPT agentic browsing / Claude for
   Chrome / Perplexity Comet, N≥3 each, scored blind on **verified-completion rate** (network/page
   evidence, not model say-so). Owned by [S11](phase-s11-benchmark-h2h.md).
2. **Bounded, honest injection ASR** — published as *"k successes in K trials, 95% binomial upper bound
   X%"*, upper bound ≤5% initially. Owned by [S6](phase-s6-safety-control-plane.md).
3. **Fabricated-success ≈ 0** — on trap fixtures where the page lies ("Saved!" over a 5xx), the agent
   reports the truth. A metric no rival publishes. Owned by [S4](phase-s4-verified-outcomes.md).
4. **Cost honesty** — $/task and wall-clock/task published, dropping on repeat domains. Owned by
   [S7](phase-s7-speed.md) ($ / wall-clock) + [S9](phase-s9-memory-skills.md) (repeat-domain drop).

The program's own added bar: **competitive with Claude for Chrome on reliability + safety AND with Comet
on assistant UX, at 2026 state of the art, every internal number live-measured** (real product model,
real app, all security planes on, ground-truth scored, held-out protected, regenerable from a checkout).

## The four owner pains → workstreams

The owner's verdict — *"hala istediğim gibi çalışmıyor"* — decomposes into four confirmed pains. Each
maps to a workstream with **one headline metric** it must move.

| Pain | Workstream | Phases | Headline metric |
|---|---|---|---|
| 1. Can't complete tasks on real sites | **W1 Reliability** | [S3](phase-s3-reliability-actions.md), [S4](phase-s4-verified-outcomes.md), [S5](phase-s5-code-execution.md) | verified-completion rate (web-patterns + real-failures + acceptance) |
| 2. Can't see pages properly | **W2 Perception** | [S2](phase-s2-perception-v2.md), [S10](phase-s10-vision-escalation.md) | perception-family pass rate + tokens/step |
| 3. Too slow | **W3 Speed** | [S1](phase-s1-foundation-native-loop.md), [S2](phase-s2-perception-v2.md), [S7](phase-s7-speed.md), [S12](phase-s12-local-model.md) | p50 wall-clock/task + $/task (acceptance) |
| 4. Weak UX / control feel | **W4 Control & trust** | [S6](phase-s6-safety-control-plane.md), [S8](phase-s8-assistant-ux.md) | approvals/task, ASR upper bound, time-to-first-feedback |
| — foundation | **Foundation** | [S0](phase-s0-truth-and-repair.md), [S1](phase-s1-foundation-native-loop.md) | honest baseline exists; native/streaming substrate |
| — claim | **Claim** | [S11](phase-s11-benchmark-h2h.md) | all four north-star conditions have a dated number |

## Phase index

| ID | File | Goal | Depends on | Status |
|---|---|---|---|---|
| S0 | [phase-s0-truth-and-repair.md](phase-s0-truth-and-repair.md) | Absorb + retire the v2 track, repair all doc/code/number drift, first full-registry honest baseline, taxonomy that may re-cut this program | — | 🟠 **Measurement-owed** (PR0–PR3 landed 2026-08-16: freeze, archive, v2 retirement, artefact + pointer repair. PR4–PR6 = the ⏸ funded sweep) |
| S1 | [phase-s1-foundation-native-loop.md](phase-s1-foundation-native-loop.md) | Native tool-calling + multimodal `CanonMessage` + streaming-to-UI (settled-to-Journal) | S0 | 🟡 **PR0–PR1 landed** 2026-08-18 (paired set + "before" exclusion rate frozen; `CanonMessage.content` widened to `string | CanonContentBlock[]`, schema in shared-types, `safeParse` at the gateway; ADR-0025 lands in PR5) |
| S2 | [phase-s2-perception-v2.md](phase-s2-perception-v2.md) | Identity-stable refs + diff/dedupe + compact serialization + label resolution + `get_page_text` | S0 | ⬜ Not started |
| S3 | [phase-s3-reliability-actions.md](phase-s3-reliability-actions.md) | Dialogs, tab-spawn world model, wait-for, send-keys, hover/drag, nav verbs, typed widgets, click-time occlusion + locator cascade, cookie-consent fix | S0; S2 (refs) | ⬜ Not started |
| S4 | [phase-s4-verified-outcomes.md](phase-s4-verified-outcomes.md) | Evidence-cited completion, fabricated-success ≈ 0, URL re-verify before mutation | S1 | ⬜ Not started |
| S5 | [phase-s5-code-execution.md](phase-s5-code-execution.md) | Isolated-world code-exec (security-first) + structured table/list extraction | S2 | ⬜ Not started (ADR-0026) |
| S6 | [phase-s6-safety-control-plane.md](phase-s6-safety-control-plane.md) | Autonomy-to-main (bug fix), risk tiers, `follow_a_plan` grants, advisory critic, strict-mode, ASR battery, credential broker | S0 (PR1 early); S3 (claim ASR) | 🟡 **PR0–PR3 landed** 2026-08-16 (exam frozen; autonomy defect closed; six derived risk tiers + TR-covering sensitive-site map; plan-scoped grants on proper eTLD+1 — all deterministic, no sweep owed). PR4–PR7 not started |
| S7 | [phase-s7-speed.md](phase-s7-speed.md) | wall-clock/$ targets, adaptive validation, quick-mode encoding, visibility-gated realism | S1, S2 | ⬜ Not started |
| S8 | [phase-s8-assistant-ux.md](phase-s8-assistant-ux.md) | Streaming narration, live step feed, plan-grant UX, risk-tier approvals, agent-active indicator, backgroundable runs, commerce flow | S1, S6, S4 | ⬜ Not started |
| S9 | [phase-s9-memory-skills.md](phase-s9-memory-skills.md) | Per-domain advisory memory, skill/shortcut library, per-task remembered grants | S2, S6 | ⬜ Not started (ADR-0027) |
| S10 | [phase-s10-vision-escalation.md](phase-s10-vision-escalation.md) | Escalation-only vision (ADR-0008): triggers, budgeted downscale, set-of-marks | S1; gate from S0 | ⬜ Not started |
| S11 | [phase-s11-benchmark-h2h.md](phase-s11-benchmark-h2h.md) | realUrl bridge (≥10 TR) + pre-registered H2H + 4-condition claim | S3 (probe); S6+S4+S9 (claim) | ⬜ Not started |
| S12 | [phase-s12-local-model.md](phase-s12-local-model.md) | Local-LLM track: off-the-shelf baseline → fine-tune/distill → sovereign/offline | S0 (S12a); S4 (S12b) | ⬜ Not started (ADR-0028) |

Status legend: ⬜ Not started · 🟡 In progress · 🟠 **Measurement-owed** (code + frozen fixtures landed,
delta not yet in the ledger — counts against the anti-debt rule) · ✅ Done (DoD passed, delta recorded).

> **Because eval is unfunded** (owner decision — see below), phases legitimately rest at 🟠
> measurement-owed once code + fixtures land; the funded sweep is what converts 🟠 → ✅. This is expected
> and tracked, not drift.

### Old (v2) → new (S) residual-scope map

| v2 | → | S-home |
|---|---|---|
| C1 (typed state + escape) | → | exit sweep folded into [S0](phase-s0-truth-and-repair.md); the code already landed |
| C2 (replanner) | → | replan cadence in [S3](phase-s3-reliability-actions.md) / [S7](phase-s7-speed.md) |
| C3 (perception economy) | → | [S2](phase-s2-perception-v2.md) |
| C4 + C5 (obstructed pages, tabs/widgets) | → | [S3](phase-s3-reliability-actions.md) |
| C6 (verified outcomes) | → | [S4](phase-s4-verified-outcomes.md) |
| C7 (adversarial ASR) | → | [S6](phase-s6-safety-control-plane.md) |
| F1 (vision) | → | [S10](phase-s10-vision-escalation.md) |
| F2 (structured data) | → | [S5](phase-s5-code-execution.md) |
| F3 (domain memory) | → | [S9](phase-s9-memory-skills.md) |
| M1 machinery (Wilson CIs, flaky, cost, wall-clock, family pooling) | → | **absorbed** (already landed; [S0](phase-s0-truth-and-repair.md) records the truth) |
| M2 (external yardstick / H2H) | → | [S11](phase-s11-benchmark-h2h.md) |

### Status-truth audit (S0 PR2, 2026-08-16) — what is actually landed

The retired v2 index read **C1 "Measurement-owed"** and **M1 / C7 "Not started"** while all three had
landed code, hiding an anti-debt breach **×3**. Audited against `git log`, the truth is:

| v2 item | Landed code (commits) | Owed measurement | Debt home |
|---|---|---|---|
| **M1** measurement backbone | `e01691b`, `f9e639d` (merge `715a10e`) — cost, wall-clock, Wilson CIs, honest scenarios, read cap, per-tag pooled family aggregates | **none** — this *is* the measuring instrument, not a capability claim | **absorbed**, no debt |
| **C1** typed state + escape | `d591523` (typed working state), `1c5ddd0` (no-progress replan), `f04aeb2` + `5a0cfb0` (escape→replan trigger), `68d6e90` (truncation salvage) — all default-on | exit sweep | **folded into S0** PR4 |
| **C7-PR1** adversarial robustness | `1403a05` (`setStrictMode` reachable), `4cf2caa` (24-scenario frozen battery), `54848f4` (harness strict-mode knob) | first live `atk_*` numbers | **folded into S0** PR4 (N=3, caveated); claim-grade N≥10 is [S6](phase-s6-safety-control-plane.md)'s |
| Harness robustness | `4dd89d6` (transport-invalid exclusion + readiness barrier), `ac579b5` (dead-key → `UNMEASURED` + sweep abort) | none — exclusion machinery the baseline depends on | **absorbed**, no debt |

**Anti-debt state: 1 measurement-owed (S0) — compliant.** C1's and C7's owed sweeps do not each count
as separate debt because both are discharged by the *same* S0 full-registry baseline.

**Update 2026-08-16 — S6-PR1 landed; the count is unchanged.** The autonomy-enforcement fix carries
**no measurement debt**: its DoD line is explicitly deterministic and testable offline ("No ⏸"), and it
is discharged by unit + regression tests, not by a sweep. A phase only enters 🟠 when a *sweep* is owed,
so S6 reads 🟡 in-progress and the anti-debt count stays at **1**. Every other S-phase reads ⬜ **Not
started** truthfully: their code does not exist yet.

## Sequencing, lanes & measurement gates

```
S0 (absorb old track + repair + baseline + taxonomy → the taxonomy MAY re-cut this program)
 ├─ S6-PR1  autonomy-bug fix (tiny, lane-independent, no sweep dependency)   ← immediately after S0
 ├─ Lane A (reactor/gateway, strictly serialized):      S1 → S3(reactor PRs) → S7
 ├─ Lane B (perception/tool-executor):                  S2 → S3(executor PRs) → S5
 └─ Lane C (policy/UI/local, no reactor collision):     S6-rest · S8 · S12a   (behind their substrates)

Interleave, ≤2 phases in flight:  S2 ∥ S1 · S4 ∥ S5 ∥ S6-rest · S9 ∥ S10 · S12a early (cost win)
Gates:  G1 native≈JSON + streaming · G2 tokens −30% · G3 cookie ≥8/10 + new-family ≥70%
        G7 −40% wall-clock @ equivalence · ASR claim-grade only AFTER S3
S11:  bridge probe allowed after S3 · claim-grade H2H LAST (after S6 ASR + S4 fabricated-success + S9 speedup)
S12:  S12a early (local baseline + cheap-tier offload) · S12b/S12c LATE, evidence-gated (need S4 labels + trajectory volume)
```

**Constitution rules enforced program-wide** (full text: [`constitution.md`](constitution.md)):
**anti-debt** (no new phase opens while >1 phase sits measurement-owed — S0 restores compliance day one);
**fixture freeze before capability code** (a PR0 per phase; no phase authors and passes its own exam in
one PR); **attribution** (each exit sweep on a single-change branch, serialized); **two-tier N**
(claim-bearing N≥10 with Wilson CIs on pooled family aggregates; broad coverage N=3 with flaky tags);
**consolidation-as-DoD** (a subsumed prose steer is deleted in the same PR that proves its paired
with/without sweep); **judge discipline** (secondary LLM judge claim-barred until ≥25 human labels;
today: 1).

## Budget — eval spend (owner: unfunded for now)

Live measurement needs a **funded Anthropic key**; the owner has chosen to **plan without a budget** for
now. Consequence: every DoD sweep below is marked **⏸ awaiting funded key**. Code and frozen fixtures may
land; **no phase reaches ✅ until its sweep runs and the delta is in [`eval-results.md`](eval-results.md)**.
[S0](phase-s0-truth-and-repair.md) measures the real $/trial and replaces these order-of-magnitude
estimates with actuals; the rule is **no sweep without a ledger entry recording its actual cost**.

| Sweep | Trials | Est. cost (⏸) |
|---|---|---|
| S0 full-registry baseline (52 × N=3, Anthropic tier) | ~156 | $150–500 |
| One family paired sweep (before+after, ~7 × N=10 × 2 arms) | ~140 | $150–400 |
| Claim-grade ASR (24 `atk_*` × N≥10) | ~240 | $250–700 |
| Program total (~2 full-registry + ~14 paired + ASR + bridge/H2H) | ~2,500–3,500 | **$2,500–8,000** |

S12a's local-baseline sweeps run on **local compute (no cloud key)** and are the one measurement track
not funding-blocked — an early, cheap cost win.

## Routing — what stays out

Since the AI routing to Phases 1b/6/8/9 is dissolved, this program states its own boundary. **Reference,
never duplicate.**

| Stays with | Material |
|---|---|
| [Phase 6](../product/phase-6-deterministic-automation.md) | Deterministic **model-free** signed recipes, self-healing selectors, success oracle. Ownership test: *"if the model could be removed from the replay, it's Phase 6."* S9's skills are model-driven templates, not recipes. |
| [Phase 8](../product/phase-8-local-intelligence-sovereignty.md) | Provider trust mesh, knowledge graph, **learned** ModelRouter, speculative two-tier. S12 ships a *static* local tier, not a learned router. |
| [Phase 9](../product/phase-9-safe-autonomy-delegation.md) | Transaction mandates, signed policy bundles (**publishes S6's measured ASR**), governed endpoints. |
| **This program's own backlog** (evidence-gated, no other home now) | **True parallel background runs** (relaxes ADR-0013's one-run-at-a-time — needs a superseding ADR + real isolation; S8 ships "single run, backgroundable" first); deterministic action-replay caching (Phase-6 boundary preserved). |

## Never (inherited + program additions)

Auto-judge headline numbers · anchoring to vendor self-reports (the Online-Mind2Web 97–99%
self-submissions vs ~58% independently-listed Operator is a methodology crisis, arXiv:2504.01382, not a
capability gulf) · **screenshots-every-step vision** · "ASR ≤1%" from double-digit trials · Python
sidecar / second Chromium / vendor agent SDKs (`browser-use`/`nanobrowser` = **port techniques, never
adopt**) · **renderer-trusted security decisions** (the S6 bug — never again) · **weights committed to
the repo** (S12 — models are downloaded artifacts) · training on unfiltered agent output (S12 — only
S4-verified trajectories, held-out contamination-gated).

## Operations

- [`eval-results.md`](eval-results.md) — the dated results ledger (continues the v2 ledger; every phase
  exit records before/after here).
- [`constitution.md`](constitution.md) — the statistical constitution + consolidation-as-DoD rule.
- [`PROSE-LEDGER.md`](PROSE-LEDGER.md) — the prose-debt ledger, re-owned to S-phases.
- [`fixture-freeze.md`](fixture-freeze.md) — the frozen baseline exam (8 registries, 52 scenarios,
  SHA-256 per file); every phase PR0 cites it as the base its delta was measured against.
- [`history.md`](history.md) — v1 measurement history + the `browser-use`/`nanobrowser` build-vs-buy
  decision, preserved.
- Eval loop runbook: [`eval-loop-runbook.md`](eval-loop-runbook.md) (moved here by S0).
