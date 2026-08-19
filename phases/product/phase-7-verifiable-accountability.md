# Phase 7 — Verifiable Accountability & Proof-of-Run

**Status:** 🟡 In progress (NotaryService algorithmic foundation landed 2026-08-19) · **Estimate:** ~3–4 months  ·  **Depends on:** Phase 1a/1b (Event Journal, Token
Ledger, Effect Ledger, shadow workspace, plan-preview)
**Goal:** Turn the event-sourced substrate into **proof**: convert "shown = recorded" into "recorded =
mathematically provable." Six independent strategy lenses converged on the same primitive — hash-chain the
append-only Journal, sign checkpoints with a per-device key, and emit portable, third-party-verifiable proofs
of what the agent did, under which policy, on which provider. This is the **precondition for regulated
FinServ/health/legal adoption** competitors are structurally locked out of, and it is nearly free on the
append-only Journal.
**Branch examples:** `feat/notary-service`, `feat/accountability-dashboard`, `feat/counterfactual-dry-run`,
`feat/cost-risk-contract`, `feat/data-rights`

## Exit criteria (DoD)
- [ ] **Replay Receipt** is emitted for a completed task and validated by a **standalone `tepegoz-verify` CLI**
      (no tepegöz install) → PASS; a tampered event → FAIL/TAMPERED
- [ ] **Accountability Dashboard** answers "Why did the agent do X?" with a deterministic causal trace
      reconstructed **without** a model call
- [ ] **Counterfactual Dry-Run** produces a human-readable Consequence Report for a full plan with **zero real
      side-effects**, then commits the identical plan for real on approval
- [ ] **Pre-flight Cost & Risk Contract** shown + accepted before run; on failure the auto-refund is a
      verifiable before/after diff against the contract
- [ ] **Data Rights**: a subject-access export + a **provable erasure** (tombstone + blob-refcount decrement)
      complete end-to-end; erasure is itself an append-only recorded event
- [ ] **i18n:** en+tr keys added for new surfaces (Notary/receipt UI, Accountability Dashboard, Dry-Run report,
      Cost/Risk contract, Data Rights panel, Compliance Pack export)
- [x] ADR accepted: **ADR-0014** (NotaryService: hash-chained Journal + signed Replay Receipts + anchoring)
      _(lands as [ADR-0030](../../docs/adr/0030-notary-service.md) — ADR-0014 was already claimed by an earlier, unrelated, accepted ADR before this phase document was written; see the numbering note at the top of ADR-0030.)_
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB (chain fields
      are **additive**, append-only preserved)

> **What actually runs today (2026-08-19).** The hash-chain math, the Ed25519 checkpoint signing, the
> Replay Receipt format, and the standalone verifier are all real and tested — 49 tests in
> `@tepegoz/notary`, plus an out-of-band check that the BUILT CLI runs as plain Node with no
> `node_modules`. **None of it is wired into a live run.** No migration adds chain columns to the
> `events` table, `EventJournal.append` does not compute a hash, and no signing key exists in
> `safeStorage`. A receipt cannot be produced from a real task yet — only from data handed to
> `buildReceipt` directly, which is how the whole test suite exercises it. The Accountability
> Dashboard, Counterfactual Dry-Run, Cost & Risk Contract, and Data Rights export are untouched.

## Tasks

### L1/L7/L8 — NotaryService (the foundation)
- [~] Per-event **hash chain**: `prevHash` + `selfHash` over the canonical (payload/`blobRef`/ts/actor); folded
      periodically into **Ed25519-signed checkpoints** (signing key in `safeStorage`)
      _(landed: [hash-chain.ts](../../packages/notary/src/hash-chain.ts) + [checkpoint.ts](../../packages/notary/src/checkpoint.ts). **Owed:** the `safeStorage`-backed key and wiring into `EventJournal.append` — nothing in `apps/desktop` calls this yet.)_
- [~] Portable, self-contained **Replay Receipt**: signed event subtree + authorizing **policy-IR snapshot** +
      model/provider/cost (from Token Ledger) + `cas://` blob hashes
      _(landed: [replay-receipt.ts](../../packages/notary/src/replay-receipt.ts) — the event subtree + checkpoint. **Owed:** the policy-IR snapshot and Token Ledger fields are not part of the receipt shape yet.)_
- [x] Standalone open-source **`tepegoz-verify` CLI**: re-folds events deterministically and validates the
      chain **without tepegöz installed** → PASS / FAIL / TAMPERED
      _(landed: [cli.ts](../../packages/notary/src/cli.ts), bundled to a dependency-free single file by [scripts/build-cli.mjs](../../packages/notary/scripts/build-cli.mjs). Verified in-session by running the BUILT output — `node dist/tepegoz-verify.mjs receipt.json` — against a genuine and a hand-tampered receipt, not merely by compiling the source. PASS/TAMPERED/INVALID/usage-error map to exit codes 0/1/2/3.)_
- [ ] Optional **opt-in** anchoring of the daily root hash to OpenTimestamps / RFC3161 (hash only, content never
      sent) for non-repudiation of WHEN (keeps local-first default) — not started
- [ ] *Risk:* chaining over redacted payloads proves the redacted record is intact, not the original PII →
      hash the pre-redaction content into a sealed **local-only** digest so redaction is itself provable — not started; recorded as an open risk in [ADR-0030](../../docs/adr/0030-notary-service.md)

### L9 — Accountability Dashboard + deterministic causal explainer
- [ ] First-class Dashboard (not buried in Settings) folding the Journal into longitudinal views: per-domain
      access history, per-tool invocation counts + danger-class breakdown, every `PolicyBlocked` /
      `HitlRequested` / `HitlResolved` with reason codes, loop trips, egress blocks, token spend over time —
      per-profile isolated, virtualized
- [ ] Right-click any step → **"Explain this action"** produces a deterministic causal trace **without calling
      the model**: originating intent → DAG node planned-vs-actual → the exact sanitized perception snapshot
      that triggered it → policy classification + reason code → taint/provenance chain → which prior step's
      output fed this input
- [ ] The model only *optionally* renders the deterministic facts into prose, **visually segregated** and
      labeled "generated"; the deterministic trace is always shown and is authoritative

### L2/L3/L8 — Counterfactual Dry-Run
- [ ] "Dry-Run" execution mode runs the full DAG in the existing **shadow workspace** with all
      state-changing/destructive/financial tools intercepted at the **Capability Broker** and replaced by
      deterministic simulations; the Effect Ledger records intended-but-not-executed effects
- [ ] Produces a human-readable **Consequence Report** ("will send 3 emails, delete 12 files, spend ~250 TL,
      touch these domains") before commit
- [ ] One-click **commit** replays the exact same plan for real; or **edit** (existing plan-preview HITL) and
      re-dry-run. Directly answers the #1 trust fear (zero-click Drive-wipe class)
- [ ] *Risk:* simulation can't perfectly predict server-side outcomes → label simulated branches as estimates,
      re-validate read state at real-run time, keep HITL on destructive/financial even after dry-run

### L3/L7 — Pre-flight Cost & Risk Contract
- [ ] Before any task runs, surface a binding **Run Contract**: estimated token cost (from the DAG cost
      estimator), highest danger-class node, count of HITL gates, which adapters/sites will be touched
- [ ] User accepts (recorded as an event); on failure/loop/abort the Token-Ledger auto-refund is shown as a
      reconciled before/after with a verifiable diff ("promised ≤X, spent Y, refunded Z"), replayable from the
      Journal — weaponizes competitors' #1/#2 cost complaints (no refund, no pre-cost telegraphing)

### L1/L2/L6 — KVKK/GDPR self-service + living Compliance Pack
- [ ] **Data Rights** panel treating the local Journal + memory + blob store as a queryable personal-data
      corpus: enter a subject (email/domain/name/profile) → deterministic search across events, FTS5 memory,
      CAS blobs → a portable **SAR export bundle** (machine- + human-readable, en+tr)
- [ ] **Provable erasure**: tombstone events + blob-refcount decrement + memory-audit purge, recorded as
      append-only "erasure performed" events so deletion is itself provable (reuses the `kv` tombstone column
      already in schema v1)
- [ ] Retention-policy engine + a **Compliance module** that auto-generates, from live config/usage, the
      EU-AI-Act / KVKK artifacts (register of processing, per-provider model cards, human-oversight statement
      from Policy Kernel + HITL stats, data-flow map)
- [ ] *Risk:* append-only vs right-to-erasure tension → erasure = crypto-shred blob bytes + redact event
      payloads to tombstones while preserving the erasure event (lawful record-of-processing); generated docs
      framed as evidence/templates with an explicit "not legal advice" disclaimer

### Cross-cutting (as in every phase)
- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/receipt/CLI-input trust boundary; AppError
      contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution trailer**
