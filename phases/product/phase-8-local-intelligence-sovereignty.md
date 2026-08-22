# Phase 8 — Local-First Intelligence & Sovereignty

**Status:** ⬜ Not started · **Estimate:** ~4–6 months · **Depends on:** Phase 1b (local SLM,
HybridRetriever, ModelRouter, Taint/Provenance) + Phase 7 (NotaryService, for attestations)
**Goal:** Push the local SLM + ModelRouter + Egress/Taint seams into categories **no cloud-centric rival can
touch**: a true zero-egress air-gapped mode, data-sensitivity-aware provider routing with cryptographic proof,
on-device semantic recall over your own history, and a Turkish-first **engine** layer (not just UI
translation). These are the regulated-market (KVKK/EU) and emerging-market wedges — mostly **packaging of seams
Phase 1b already builds**. Competitors' intelligence lives in the cloud; they literally cannot run air-gapped.
**Branch examples:** `feat/sovereign-mode`, `feat/provider-trust-mesh`, `feat/semantic-history-kg`,
`feat/learned-model-router`, `feat/turkish-engine`, `feat/low-data-mode`

## Exit criteria (DoD)

- [ ] **Sovereign / Air-Gapped Mode** is kernel-enforced (not a toggle): with it on, the Capability Broker
      blocks every cloud/BackendTransport egress and a signed **Egress Attestation** verifies "zero outbound
      model calls"
- [ ] **Provider Trust Mesh** routes by data-class deterministically; a leak test proves PII never left the
      device (or left only to an EU region) and the Notary records which class went where
- [ ] **Global semantic history + Personal Knowledge Graph** answers "search everything I've seen" / "who is
      this vendor" from an on-device, rebuildable, provenance-linked projection; default OFF, sensitive-site
      excluded, per-node forget works
- [ ] **Learned ModelRouter** picks per-node model from Journal outcomes, records its choice (replay-exact),
      and shows "why this model" + measured savings; security decisions remain deterministic + pre-model
- [ ] **"Düşük Veri" (Low-Data) mode** completes a task offline-resilient with a live data meter and honest
      "completed offline" vs "deferred — needs cloud" labeling
- [ ] **i18n:** en+tr keys added for new surfaces (Sovereign banner/attestation, Trust-Mesh routing settings,
      semantic-history search + KG/Memory-Audit, router explainer, Low-Data meter)
- [ ] ADRs accepted: **ADR-0015** (Sovereign egress class + Provider Trust Mesh), **ADR-0019** (global
      semantic history / Personal Knowledge Graph projection + PII-honeypot mitigations)
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L7/L8 — Sovereign / Air-Gapped Mode

- [ ] A sealed Policy-IR profile (one-way narrowing) that **hard-disables** every BackendTransport and cloud
      provider at the **Capability Broker** level — a kernel-enforced egress class, so even a prompt-injected
      agent cannot route to cloud (NOT a settings toggle)
- [ ] All plan/execute/classify run on the local ONNX/DirectML SLM with explicit **capability-downgrade
      banners** (honesty-on-limitations, not silent failure)
- [ ] Support importing a larger quantized GGUF (30–70B) for org NPU/GPU deployments
- [ ] Ship a signed **Egress Attestation** an IT admin can verify ("this session made zero outbound model
      calls"); pairs with NotaryService

### L7/L8 — Provider Trust Mesh (route by data-sensitivity, with proof)

- [ ] Extend ModelRouter into a policy-driven mesh: each context chunk carries its taint/provenance + a
      **data-class** label; Policy-IR rules bind data-classes to allowed providers/regions
      (`taint=PII → local SLM only`, `taint=financial → EU-region endpoint only`, `public → any`)
- [ ] The Egress Firewall enforces the binding **deterministically before any model call**; the Token Ledger +
      Notary record which data-class went to which provider/region → provable "PII never left this device /
      left only to EU." Subsumes the per-call "KVKK Mode" data-residency enforcement
- [ ] Region-pinned endpoints (EU Anthropic/Azure) as first-class routing targets
- [ ] _Risk:_ taint granularity must be accurate or guarantees are hollow → **fail closed** (unknown taint →
      local SLM, the most conservative target); journal every routing decision (auditable, not silent)

### L1/L2 — Global on-device semantic history + Personal Knowledge Graph

- [ ] **(a) Semantic history:** a profile-level FTS5 + sqlite-vec index over sanitized page main-content + tool
      outputs (reuse the exact RRF BM25+cosine ranker, bge-m3/e5 embeddings), wired into the deterministic
      omnibox as a **NON-AI** "search my history semantically" mode + exposed as a read tool
- [ ] **(b) Knowledge graph:** node/edge KG (people/orgs/sites/files/products; edges visited/emailed/bought/
      mentioned-with) built by **local-SLM NER at fold time**, every node carrying provenance (source LSN +
      `cas://` blob), surfaced in the Memory Audit Panel with per-node **forget** tombstone
- [ ] Auto-promote to hnswlib/LanceDB ANN above the measured 50–100k threshold (the Phase 1b switch point)
- [ ] Optional deterministic **proactive recall** ("You researched this vendor on 12 March")
- [ ] _Risk (ADR-0019):_ PII honeypot → derived projection (deletable + rebuildable from events), default OFF
      behind Memory-Audit opt-in, encrypted per-profile partition, never synced unless E2EE CloudSync is on,
      sensitive-site lockout excludes bank/health pages from indexing, honors "Forget this site" tombstones

### L7/L1/L2 — Quality/cost-aware learned ModelRouter + speculative two-tier

- [ ] Replace the static cost-saver toggle with a **deterministic-by-record learned router**: a feature vector
      per task-node (capability, risk class, token estimate, page-stability, prior success on this site/intent
      cluster) feeds a small on-device contextual-bandit picking {local-SLM, Haiku, Sonnet, Opus} to maximize
      success per cost/latency budget; it learns ONLY from Journal outcomes; its choice is recorded as an
      observation event (replay-exact); "why this model" + estimated savings in the Console/Ledger
- [ ] Optional **speculative two-tier execution**: local SLM produces a sub-second draft (optimistic UI) while
      cloud verifies in parallel; **only read/low-risk steps commit optimistically** (Policy-Kernel-enforced),
      state-changing always waits for the verified tier, divergence rolls back via the Effect Ledger before any
      side-effect
- [ ] _Risk:_ the learned component decides **quality/cost only, never security**; Policy Kernel stays
      deterministic + pre-model; Console marks "draft → confirmed/corrected"

### L4/L7 — Turkish-first engine layer (below the UI)

- [ ] Extend the Content Sanitizer with **Turkish i/İ/ı/I confusable + casing attack rules** and Turkish-aware
      Unicode normalization (a real homoglyph injection vector)
- [ ] A deterministic morphology-aware **intent normalizer** (local lexicon + lemmatizer) that canonicalizes
      Turkish verb forms before the SLM classifier, improving the cost-saver local path
- [ ] Turkish honorific/formality-aware output style (siz/sen, resmî/samimi) for agent-composed drafts/form-fills
- [ ] _Risk:_ keep deterministic (rule/lexicon based); SLM is fallback not primary, so it stays replayable

### L7/L4/L2 — Low-Data / Offline-Resilient "Düşük Veri" mode

- [ ] A named profile that routes classify/summarize/redact/loop-detect entirely to the local SLM (cloud only
      for genuine planning ambiguity); strips images and uses **a11y-tree-only** perception (no vision) to slash
      tokens/bandwidth; checkpoints aggressively so a dropped connection resumes from the L2 checkpoint
- [ ] Live **data-used meter** beside the token meter; stays usable offline for local-page/PWA/journal tasks;
      steps needing cloud are checkpointed into a deferred queue auto-resumed via the Recovery Coordinator
- [ ] Console honestly marks "completed offline" vs "deferred — needs cloud"; published per-capability offline
      coverage (no silent quality regression)

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/routing/index trust boundary; AppError
      contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution trailer**
