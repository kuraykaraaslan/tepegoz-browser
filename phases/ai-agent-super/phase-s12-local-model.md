# Phase S12 — Local Model, train-if-needed (W3 Speed)

**Status:** ⬜ Not started · **Depends on:** [S0](phase-s0-truth-and-repair.md) (S12a baseline), [S4](phase-s4-verified-outcomes.md) (S12b honest trajectory labels) · **Track:** [AI Agent Super](README.md)

**Goal:** Give the agent a real local-model tier — first off-the-shelf with **no training**, then fine-tune/distill **only if** the evidence shows a closable gap — for a **$0/task** cost floor and an offline/sovereign mode, honestly tiered so nothing over-promises. Three sub-phases, each a gate that must **fail** before the next opens: S12a (measure open-weights GGUF as-is + wire the local provider into the real decision path), S12b (SFT/distil an agent-specialised SLM from the program's own S4-verified trajectories — only if S12a leaves a gap), S12c (package the winner as a sovereign BYO-key-free provider). Scope honesty is binding: SFT/distillation only; frontier-grade agentic RL is **explicitly out of scope**, routed to a future phase.

## Why

The whole program depends on a **funded frontier key** for both eval and production. There is **no offline competence floor**, and every task pays cloud $/task forever — this is owner pain 3 (too slow / too costly), the [W3 Speed](README.md#the-four-owner-pains--workstreams) cost dimension. The [budget table](README.md#budget--eval-spend-owner-unfunded-for-now) prices the program at $2,500–8,000 of cloud eval alone; production spend is unbounded and permanent.

The plumbing **already exists but nothing agent-competent runs on it**:

- [`local-provider.ts`](../../packages/local-inference/src/local-provider.ts) is a working GGUF provider (request/response mapping in [`map-request.ts`](../../packages/local-inference/src/map-request.ts) / [`map-response.ts`](../../packages/local-inference/src/map-response.ts)), and [`json-grammar.ts`](../../packages/local-inference/src/json-grammar.ts) does **constrained decoding** — the exact mechanism our JSON-in-text decision path ([`reactor-decision.ts`](../../packages/orchestrator/src/reactor-decision.ts)) needs to keep a small model schema-valid.
- [`model-catalog`](../../packages/model-catalog/src/catalog.model.ts) downloads and verifies weights ([`downloader.ts`](../../packages/model-catalog/src/downloader.ts) + [`sha256.ts`](../../packages/model-catalog/src/sha256.ts) + [`install-state.ts`](../../packages/model-catalog/src/install-state.ts)) — the artifact channel is built.
- But [`models.ts:77-79`](../../packages/model-gateway/src/models.ts) wires `local-slm` as the plan/exec/classify tier of a **placeholder profile only**, and [`model-router.ts`](../../packages/model-gateway/src/model-router.ts) (`LOCAL_SLM_MODEL`, the `eligibleForLocal` branch at L94) routes to it **only under a `costSaver` flag for `SIMPLE_CAPABILITIES`** — and nothing actually serves that route in the real loop. `local-slm` is a routing **stub**: no agent-competent model has ever driven a live decision through it.

The measured reality forces the honesty-first design. The [ledger](eval-results.md#current-measured-state-carried-from-the-v2-ledger--the-baseline-this-program-starts-from) shows only **5 of 52** scenarios ever measured live and the DoD Anthropic model at N=3. We have **no idea** how a local model performs on our harness because it has never been run through it. So the design principle (matching the [Never list](README.md#never-inherited--program-additions) "no vendor self-report anchoring"): **do not claim a trained model beats frontier**; plan the **smallest intervention that clears a measured bar**, and escalate to the more expensive tier **only if the cheaper one fails its gate**.

**Sequencing consequence.** S12a is **not funding-blocked** — its sweeps run on local compute, no cloud key — so it starts **early** (Lane C, parallel to S2/S3, no reactor collision: it only wires the provider seam and measures) and immediately attacks the cost pain. S12b/S12c are **late and evidence-gated**: fine-tuning needs [S4](phase-s4-verified-outcomes.md)-verified honest completion labels **and** a meaningful volume of real runs before there is data worth training on. If the data is too thin or S12a already closes the cheap tiers, S12b stays **DEFERRED** and S12a's cheap-tier offload is the shipped win.

## Exit criteria (DoD)

Because S12 is three gated sub-phases, the DoD is partitioned. S12a is `local` (not `⏸ funded`); S12b/S12c may carry a `⏸ funded sweep` tag **only** where a paired teacher/cloud comparison is drawn.

**S12a — off-the-shelf local baseline (NO training)**
- [ ] The local GGUF provider drives a **real decision** through the live loop (not the routing stub): a chosen open-weights instruct model (Qwen/Llama-class) serves `exec` and `classify` capabilities end-to-end via [`local-provider.ts`](../../packages/local-inference/src/local-provider.ts) + [`json-grammar.ts`](../../packages/local-inference/src/json-grammar.ts) constrained decode, decisions parse through [`reactor-decision.ts`](../../packages/orchestrator/src/reactor-decision.ts) at ≥99% schema-valid over the S0 registry dry-run **(local sweep)**.
- [ ] Published **local-vs-cloud** pooled family pass + **$/task** + **wall-clock/task** on the S0 registry, same harness, all planes on, Wilson 95% CIs on pooled aggregates, transport/dead-key exclusions accounted per [constitution](constitution.md#the-rules) **(local sweep)**.
- [ ] The set of tiers a local model can **already own without quality loss (±5pp equivalence margin)** is established and recorded — starting with [`SIMPLE_CAPABILITIES`](../../packages/model-gateway/src/model-router.ts) micro-decisions (classify / summarise / loop-detect). For each such tier the default profile routes to local **(local sweep)**.
- [ ] Delta recorded in [`eval-results.md`](eval-results.md); the [budget table](README.md#budget--eval-spend-owner-unfunded-for-now) gains the actual local $/task (≈$0 compute-amortised) as the cost floor.

**S12b — fine-tune / distil an agent-specialised SLM (opens ONLY if S12a leaves a real, closable gap)**
- [ ] Gate-open evidence: S12a's local sweep shows a **specific tier** where off-the-shelf local trails cloud by **>5pp** on a pooled family and that gap is judged closable by SFT (recorded rationale) — otherwise this PR set stays **DEFERRED**.
- [ ] SFT dataset curated **only** from [S4](phase-s4-verified-outcomes.md)-verified-completion trajectories (Journal [`event-journal.ts`](../../packages/persistence/src/event-journal.ts) + `agent-eval-runs/` structured decision/observation traces); a **dataset card** documents provenance, counts, and the verified-completion filter.
- [ ] Training runs **offline / out-of-repo**; weights land only as a **downloaded [model-catalog](../../packages/model-catalog/src/catalog.model.ts) artifact**, sha256-verified — **never committed** (enforces the [Never list](README.md#never-inherited--program-additions)).
- [ ] The fine-tuned SLM **beats the S12a off-the-shelf baseline** on the target tier at pooled **N≥10** with Wilson CIs, published $/task + provenance **(⏸ funded sweep — the teacher/cloud comparison arm needs the frontier key; the local-vs-local arm is a local sweep)**.
- [ ] **SHIP GATE — eval-contamination check:** a held-out fixture set that is provably **never in training** confirms no data-poisoning / memorisation; a fixture appearing in both training and eval **blocks the ship**.
- [ ] Scope honesty asserted in the ADR: SFT/distillation only; **agentic RL explicitly out of scope**.

**S12c — sovereign / offline mode**
- [ ] The winning local config is a **first-class provider option** in the gateway ([`models.ts`](../../packages/model-gateway/src/models.ts) / [`model-router.ts`](../../packages/model-gateway/src/model-router.ts)), selectable **BYO-key-free**.
- [ ] Local output stays **untrusted**: it passes through the **same** content-guard + [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) planes as any provider — a security invariant, verified by test, unchanged by locality.
- [ ] A **defined task subset** completes **fully offline** at a published success rate; cost floor = **$0/task** on that subset **(local sweep)**.

**Constitution items (every sub-phase)**
- [ ] Exam fixtures **frozen in PR0 before** any capability/provider code lands (fixture-freeze rule).
- [ ] Each measured delta recorded in [`eval-results.md`](eval-results.md) per the recording contract (tier, N, exclusions, CIs, $/wall-clock).
- [ ] Any prose deletion is paired with a **with/without sweep** at pooled N with a stated equivalence margin (S12 owns **no** [PROSE-LEDGER](PROSE-LEDGER.md) rows — see below; this line applies only if a routing change incidentally retires a steer).
- [ ] i18n **EN + full TR parity in the same PR** for any UI surface (S12c sovereign-mode provider picker copy).

## Tasks

### PR0 — fixture freeze (local-tier exam)
- [ ] Add the S12 scenario families to [`packages/agent-eval`](../../packages/agent-eval/src/scenario-registry.ts) (see [Fixtures](#fixtures)); register in [`scenario-registry.ts`](../../packages/agent-eval/src/scenario-registry.ts), freeze before any provider-wiring code. Reuse [`statistics.ts`](../../packages/agent-eval/src/statistics.ts) family pooling + Wilson CIs and [`harness-config.ts`](../../packages/agent-eval/src/harness-config.ts) knobs; **no new scorer** — reuse [`scorer.ts`](../../packages/agent-eval/src/scorer.ts).
- [ ] Add a `local` run tier to [`harness-run.ts`](../../packages/agent-eval/src/harness-run.ts) accounting so `local` sweeps are labelled distinctly from `funded`/`scripted` in the ledger.

### PR1 — S12a: wire the local provider into the real decision path (Lane C, no reactor collision)
- [ ] Replace the `local-slm` **placeholder** in [`models.ts:77-79`](../../packages/model-gateway/src/models.ts) with a real profile pointing the `exec`/`classify` tiers at a catalogued GGUF model id; keep `plan` on the frontier tier for now.
- [ ] Serve the [`model-router.ts`](../../packages/model-gateway/src/model-router.ts) `eligibleForLocal` route through [`local-provider.ts`](../../packages/local-inference/src/local-provider.ts) so a `SIMPLE_CAPABILITIES` decision actually reaches the GGUF backend (today the branch resolves to a stub).
- [ ] Bind [`json-grammar.ts`](../../packages/local-inference/src/json-grammar.ts) constrained decoding to the decision schema so [`reactor-decision.ts`](../../packages/orchestrator/src/reactor-decision.ts) `extractJson`/`coerceDecisionShape` gets schema-valid output; add a `local-provider` gateway test mirroring [`streaming-guard.test.ts`](../../packages/model-gateway/src/streaming-guard.test.ts) (non-streaming lock preserved).
- [ ] File-cap: keep the router change a thin edit; if profile config exceeds 250 lines, split a `local-profiles.ts` under model-gateway (documented split, not `apps/desktop` growth).

### PR2 — S12a: baseline sweep + cheap-tier ownership (local sweep, no cloud key)
- [ ] Run the frozen S12a exam on the S0 registry, local vs cloud arms, via [`harness-run.ts`](../../packages/agent-eval/src/harness-run.ts); reuse [`escape-metric.ts`](../../packages/agent-eval/src/escape-metric.ts) so cost is not the only axis.
- [ ] Compute per-tier ±5pp equivalence; record which `SIMPLE_CAPABILITIES` micro-decisions the local model owns without loss; make those the routing default in [`model-router.ts`](../../packages/model-gateway/src/model-router.ts).
- [ ] Append the dated delta to [`eval-results.md`](eval-results.md) with actual local $/task + wall-clock; update the README budget table's cost-floor row. **This is the shipped cost win even if S12b never opens.**

### PR3 — S12b: trajectory dataset pipeline (opens only on a proven >5pp gap; else DEFERRED)
- [ ] Build an **out-of-repo** curation pipeline reading Journal [`event-journal.ts`](../../packages/persistence/src/event-journal.ts) + `agent-eval-runs/` traces, keeping **only** [S4](phase-s4-verified-outcomes.md)-verified-completion trajectories; emit an SFT set + **dataset card** (provenance, counts, filter). No weights, no dataset in the repo — the pipeline script + card only.
- [ ] Define the **held-out contamination set**: fixtures provably excluded from training, wired as a distinct family in [`scenario-registry.ts`](../../packages/agent-eval/src/scenario-registry.ts).

### PR4 — S12b: distil + eval gate (⏸ funded arm)
- [ ] Document the offline distillation from the frontier planner/exec teacher (the cloud tier the program already uses); constrained decode via [`json-grammar.ts`](../../packages/local-inference/src/json-grammar.ts) keeps outputs schema-valid.
- [ ] Land the trained weights as a sha256-verified [model-catalog](../../packages/model-catalog/src/downloader.ts) artifact (**never committed**).
- [ ] Run the ship-gate: contamination check (blocks on any train∩eval overlap) + pooled N≥10 vs the S12a baseline; record delta + provenance in [`eval-results.md`](eval-results.md).

### PR5 — S12c: sovereign provider option + offline subset (local sweep)
- [ ] Expose the winning config as a first-class, BYO-key-free provider in [`models.ts`](../../packages/model-gateway/src/models.ts); add the EN+TR provider-picker copy in the owning package's `src/i18n/` (defineDict/useT, same PR).
- [ ] Test that local output routes through the **same** content-guard + [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) planes as any provider (security invariant test).
- [ ] Run the offline task subset; publish the fully-offline success rate + $0/task floor to [`eval-results.md`](eval-results.md).

## Fixtures

Added to [`packages/agent-eval`](../../packages/agent-eval/src/scenario-registry.ts), **frozen in PR0**:

- **`local_baseline_*`** (S12a) — a representative slice of the S0 registry re-tagged for the local tier so the local-vs-cloud paired arms pool cleanly (reuses existing scenarios; no new page fixtures — the point is the same exam on a new provider).
- **`local_simple_capability_*`** (S12a) — micro-decision probes (classify / summarise / loop-detect) isolating the `SIMPLE_CAPABILITIES` tier where the ±5pp equivalence is measured.
- **`local_offline_subset_*`** (S12c) — the defined offline-completable task subset (deterministic fixture pages, no network egress) for the $0/task floor.
- **`local_heldout_contamination_*`** (S12b SHIP GATE) — a held-out family that is **provably never** in any training set; presence in both training and eval blocks the ship.

## Prose steers

**None.** S12 owns **zero** rows in [`PROSE-LEDGER.md`](PROSE-LEDGER.md) — it changes the *model behind* the decision, not the strategy prose in front of it. If a routing change ever incidentally retires a steer, the constitution's paired-sweep rule applies, but no S12 row is scheduled.

## ADR

**Adds ADR-0028** (`docs/adr/0028-local-agent-model.md`, to be authored in this phase) — *Local agent model.* Records: (1) **training-data provenance** — SFT data comes **only** from the program's own [S4](phase-s4-verified-outcomes.md)-verified honest completion trajectories, never unfiltered agent output; (2) the **offline eval-contamination gate** as a ship blocker (held-out fixtures never in training); (3) **weights-as-artifact, never committed** (downloaded via model-catalog, sha256-verified); (4) **sovereign-mode security invariants unchanged** — local output is untrusted and passes the identical content-guard + PolicyKernel planes; (5) **scope boundary** — SFT/distillation only, **agentic RL out of scope**, routed to a future phase. Continues the ADR sequence from 0025 (0024 is the current head; [S1](phase-s1-foundation-native-loop.md)/[S5](phase-s5-code-execution.md)/[S9](phase-s9-memory-skills.md) take 0025–0027). Consistent with the [routing boundary](README.md#routing--what-stays-out): S12 ships a **static** local tier; the **learned** ModelRouter and speculative two-tier stay with [Phase 8](../phase-8-local-intelligence-sovereignty.md).

## Risks

- **Distilling the agent's own mistakes.** Training on self-generated traces risks baking in failure modes. **Mitigation:** the [S4](phase-s4-verified-outcomes.md) verified-completion filter (honest labels, not vanity) + the held-out contamination gate are the guardrails; both are DoD ship-gates, not best-effort.
- **Thin data volume.** There may not be enough real verified runs to train on. **Mitigation:** S12b stays **DEFERRED** by design until volume exists; S12a's cheap-tier offload is the shipped win regardless. This is an explicit gate, not a failure state.
- **Local model too weak for exec, silently degrades quality.** **Mitigation:** the ±5pp equivalence margin is measured *before* any tier is handed to local; `plan` stays frontier until proven; nothing over-promises (honesty-first, no vendor self-report anchoring).
- **Constrained-decode brittleness.** A small model may fight the JSON schema. **Mitigation — spike-first in PR1:** validate [`json-grammar.ts`](../../packages/local-inference/src/json-grammar.ts) drives ≥99% schema-valid parse through [`reactor-decision.ts`](../../packages/orchestrator/src/reactor-decision.ts) on a dry-run **before** committing to the exec-tier wiring; if it fails, S12a scope narrows to `classify`/`SIMPLE_CAPABILITIES` only.
- **Local compute variance skews wall-clock.** **Mitigation:** publish the exact hardware in the ledger entry; wall-clock is reported as machine-relative, and the $0/task floor (not raw latency) is the headline S12 claim.
