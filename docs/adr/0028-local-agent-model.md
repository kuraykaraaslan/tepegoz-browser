# ADR-0028: Local agent model — evidence before ownership, weights as artifacts, no RL

- **Status:** Accepted
- **Date:** 2026-08-19
- **Refines:** [ADR-0005](0005-provider-agnostic-ai.md) (provider-agnostic gateway) ·
  **complements** [ADR-0006](0006-policy-kernel-hitl.md) (policy kernel)
- **Phase:** [S12 — Local Model](../../phases/ai-agent/phase-s12-local-model.md) PR0–PR1

## Context

Every task this agent performs costs cloud money, forever, and there is no offline floor at all. The
plumbing for a local tier already exists and has for some time — a GGUF provider, GBNF-constrained
decoding, a catalogue that downloads and sha256-verifies weights, and a router branch that offloads
simple capabilities to it.

What has never existed is **evidence**. No local model has driven a decision through this harness, so
nobody knows which tiers it could own. The temptation in that situation is to route the cheap tiers
locally because they are cheap and probably fine — and the cheap tiers are precisely where a silent
quality loss goes unnoticed longest, because nobody inspects a `classify` call.

## Decision

**A capability tier is handed to the on-device model only after a measured ±5pp equivalence over ≥10
pooled trials, and the rule is code rather than a sentence.**
[`local-tier-ownership.ts`](../../packages/agent-eval/src/local-tier-ownership.ts) holds the ownership
table; it is **empty**, `ownsLocally(undefined)` returns `unmeasured`, and there is no "assume equivalent
for cheap tiers" path to take. `plan` is not even a candidate — that tier stays frontier until something
says otherwise.

The equivalence check is **one-sided**, unlike [S7](../../phases/ai-agent/phase-s7-speed.md)'s speed
guardrail: local scoring _higher_ than cloud is a reason to look at the exam, not a quality loss to guard
against.

**Training data comes only from S4-verified trajectories.** If S12b ever opens, the SFT set is curated
exclusively from runs whose completion evidence was verified — never unfiltered agent output. Training a
model on its own unverified traces bakes in its failure modes and calls the result an improvement.

**Weights are artifacts, never repository contents.** Any trained model lands as a downloaded,
sha256-verified [model-catalog](../../packages/model-catalog/src/catalog.model.ts) artifact. Committing
weights would put an unauditable binary in the trust chain of a security-first product.

**An eval-contamination check is a ship blocker.** A held-out family provably absent from training must
confirm no memorisation. A fixture appearing in both training and eval blocks the ship, because a model
that memorised the exam scores well on exactly the thing the exam exists to detect.

**Local output is untrusted like any other model output.** It passes the identical content-guard and
PolicyKernel planes. Locality is a cost and privacy property; it is not a trust property, and treating
"it ran on my machine" as "it is safe" would be the same category error as trusting a page because it
loaded quickly.

**Scope: SFT and distillation only. Agentic RL is explicitly out of scope**, routed to a future phase
with its own ADR. Saying so here is what stops "we could just train it" from expanding without a
decision.

## Consequences

**Positive.** A $0/task cost floor becomes reachable without anyone being able to quietly trade quality
for it. The ownership table is auditable: every entry must cite the sweep that produced it, and an entry
with no ledger row behind it is a claim rather than a measurement.

**Negative / accepted.** Nothing routes locally today, so the cost win is entirely prospective. The
measurement that would unlock it needs downloaded weights and local compute, which is a _different_
unavailability from the funded key that blocks the rest of the program — and worth distinguishing, since
it is one the owner could resolve without spending money on tokens.

**Owed, and stated rather than implied.** The ≥99% schema-valid dry run, the local-vs-cloud pooled sweep,
and the per-tier equivalence numbers are all unmeasured. S12b (fine-tuning) stays **DEFERRED by design**
until S12a shows a specific closable gap; S12c (sovereign mode) has no provider-picker UI. The GBNF
grammar binding a local model needs is already wired — `responseFormat: 'json'` reaches
`grammarFor(req)` — so that part of PR1 was found already done rather than built, which is recorded
rather than claimed as work.
