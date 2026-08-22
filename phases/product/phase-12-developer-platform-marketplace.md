# Phase 12 — Developer Platform & Marketplace Economy

**Status:** 🟡 In progress (SupplyChainGate decision layer landed 2026-08-20) · **Estimate:** ~6+ months (scope branches on adoption data) · **Depends on:**
Phase 1b (SkillRuntime/MCP) + Phase 2 (Adapter SDK skeleton) + Phase 3 (gateway billing) + Phase 4
(marketplace signing) + Phase 6 (RecipeCompiler) + Phase 9 (Policy Bundles)
**Goal:** Phase 4 lists a signed marketplace as distribution **plumbing** with no DX, no economics, and no
quality bar — a registry without those produces a thin, low-quality long tail. The RecipeCompiler is the supply
engine; this phase adds the **local model-free replay test harness**, the **crowdsourced site-recipe library**
that attacks the #1 abandonment pain at scale, **supply-chain attestation** beyond "signed = trusted", and the
trust + entitlement that make a paid-but-runs-locally skill economy credible. All reuse the single PEP +
signing pipeline without new security scatter. **The heavy economics are adoption-gated.**
**Branch examples:** `feat/tepegoz-sdk`, `feat/recipe-test-harness`, `feat/site-recipe-library`,
`feat/supply-chain-gate`, `feat/marketplace-economics`

## Exit criteria (DoD)

- [ ] **SDK + CLI**: `skill new` / `adapter new` scaffolds a typed package; `tepegoz test --record/--replay`
      runs a skill in CI **deterministically with NO model and NO network** (golden fixture)
- [ ] **Site-Recipe Library**: on a known site the orchestrator prefers a signed, crowdsourced deterministic
      recipe over vision/guessing; the Loop Detector flags drift for community fixes
- [~] **SupplyChainGate**: an installable package without a valid SBOM + attestation is blocked (or quarantined
  sandboxed, no credentials); declared-capabilities ⊄ requested-scopes is rejected; first-run
  declared-vs-actual mismatch → block/HITL
  _(landed: [supply-chain-gate.ts](../../packages/security-policy/src/supply-chain-gate.ts) — `evaluateSupplyChain` (three tiers: quarantined/signed_basic/attested — this phase document itself states two DIFFERENT policies for the unsigned case in different lines; [ADR-0037](../../docs/adr/0037-supply-chain-gate.md) resolves it toward quarantine-not-block and says so explicitly), `declaredWithinRequestedScope`, `declaredVsActualMismatch`. 14 tests. **Owed:** the cryptography this gate consumes as pre-verified booleans (no signature/SBOM-hash/attestation checking exists), the install flow, quarantine sandboxing, and the tamper-evident install-receipt event.)_
- [ ] **Marketplace economics**: a paid skill verifies entitlement and **still runs 100% locally** in the
      sandbox via a signed offline entitlement token; a backend outage does not brick the purchase
- [ ] **i18n:** en+tr keys added for new surfaces (CLI help/output, marketplace listing/scope-review/permission
      receipt, recipe-health UI, template gallery)
- [~] ADRs accepted: **ADR-0020** (site-recipe library + SBOM/SLSA supply-chain attestation), **ADR-0021**
  (marketplace economics + offline entitlement)
  _(the SBOM/supply-chain half lands as [ADR-0037](../../docs/adr/0037-supply-chain-gate.md) — ADR-0020 was already claimed before this phase document was written. The site-recipe-library half of ADR-0020, and ADR-0021 in full, are not written — no code landed for either.)_
- [ ] Each opened economics bet decided with cost/risk analysis (adoption-gated, like Phase 4)
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** `evaluateSupplyChain`, `declaredWithinRequestedScope`, and
> `declaredVsActualMismatch` are real and tested (14 tests). **None of it verifies anything itself.**
> This gate consumes signature/SBOM/attestation verification as pre-computed booleans; nothing in this
> repo currently produces those booleans, so nothing calls this gate with real data yet. There is no
> `tepegoz-sign` CLI, no install flow, no marketplace, no SDK, and no recipe test harness.

## Tasks

### L5 — tepegöz SDK + CLI with a local, model-free, replay-based test harness

- [ ] `@tepegoz/sdk` + a `tepegoz` CLI: `skill new` / `adapter new` scaffolds a typed package (zod I/O,
      SKILL.md frontmatter, i18n en+tr stub, `adapter.json`)
- [ ] `tepegoz dev` runs it inside a local **CapabilitySandbox** against a real headless CDP browser with
      hot-reload
- [ ] **Killer feature:** `tepegoz test --record` captures a session as Journal events + CAS blobs (golden
      fixture); `tepegoz test --replay` re-folds them deterministically with **NO model and NO network**,
      asserting tool I/O — fast, free, reproducible CI
- [ ] A type-checked **mock ToolGateway** enforces danger-class + `idempotencyKey` rules so authors hit policy
      errors at dev time (determinism-first as a developer feature)
- [ ] _Risk:_ replay fidelity depends on recording all non-deterministic inputs as observation events; fixtures
      rot on perception drift → version fixtures against the perception-schema version + a `--rerecord` diff view

### L4/L3/L5 — Crowdsourced Site-Recipe Library

- [ ] A **"Record Recipe"** mode captures a flow once (RecipeCompiler output — a11y selectors + stability
      waits) as a signed skill keyed by domain
- [ ] On a known site the orchestrator **prefers the recipe** (deterministic, model-free, cheap) over
      vision/guessing; the Loop Detector flags drift so the community can fix it
- [ ] Recipes are signed, scope-reviewed, run in the sandbox like any skill, with an opt-in anonymized **"recipe
      health"** (success rate across users) for ranking
- [ ] This is the concrete mechanism behind Phase 4's named-but-unspecified "site-specific connectors as a
      pre-WebMCP completion-rate layer" — a self-growing completion-rate moat
- [ ] _Risk (ADR-0020):_ community-authored state-changing automations are an abuse vector → deterministic-only
      steps, Policy Kernel + taint at execution, danger-class/sensitive-site rules apply regardless of recipe,
      drift handled by Loop Detector + health signals + opt-in telemetry

### L5/L8 — SBOM + SLSA provenance attestation gate

- [ ] Require every installable skill/adapter/extension/MCP package to ship a **CycloneDX SBOM** + an
      **in-toto/SLSA build-provenance attestation**, both Ed25519-signed — not started (this is a publishing-pipeline requirement; the gate that would CONSUME the result is landed, nothing produces one yet)
- [~] A deterministic **SupplyChainGate** (pre-install, pre-model) verifies signature, SBOM-to-artifact hash
  match, no dependency on a local deny-list, and **declared-capabilities ⊆ requested-scopes**; at first run
  it checks declared vs what the ToolGateway actually sees (mismatch → block/HITL) and writes a
  tamper-evident install-receipt event
  _(landed: the tiering + scope + mismatch DECISIONS. **Not landed:** the actual signature/hash verification (this gate consumes those as pre-verified booleans), the install-receipt event, and the block/HITL action itself — `declaredVsActualMismatch` only detects, it does not act.)_
- [ ] A `tepegoz-sign` CLI auto-generates SBOM + attestation in CI; unsigned packages still installable only in
      an explicit **"unverified, sandboxed, no-credentials" quarantine tier**; enterprises get an exportable
      SBOM-equivalent for all installed skills — not started; the QUARANTINE TIER this line names is the policy `evaluateSupplyChain` implements for the unsigned case (see the ADR-0037 numbering note on the phase's own internal disagreement about this)
- [ ] Moves from "signed = trusted" to "**attested + scoped + SBOM-diffed + declared-vs-actual-enforced**"
- [ ] _Risk:_ reproducible builds for arbitrary toolchains are hard; publisher friction → tier it
      (unsigned-blocked / signed-basic / attested-premium); `tepegoz-sign` auto-generates; declared-vs-actual
      runs in-sandbox so it can't be spoofed

### L5/L7 — Capability Marketplace economics (runs-locally paid skills) _(adoption-gated)_

- [ ] Verified-publisher Ed25519 keys + full provenance shown in-UI; listing economics (free / one-time /
      subscription / usage-metered) settled through the **Phase-3 gateway billing**
- [ ] A trust surface: install counts, ratings, per-skill published attack-success-rate, and the install-time
      scope-review diff rendered as a **permission receipt**; a curated **"Security-Reviewed"** tier where
      tepegöz signs an audit attestation
- [ ] Crucially, **paid skills still run 100% locally** in the CapabilitySandbox — the gateway only does
      entitlement + billing — via signed, time-boxed **offline entitlement tokens** with a generous grace
      window, so an outage never bricks a purchase
- [ ] A **Templates Gallery** (Turkish-first KVKK / e-invoice read-only starters) drives demand-side onboarding
      with cost-quote + permission-receipt + plan-preview before install; a **self-hostable private registry**
      for on-prem/KVKK so customers aren't forced onto the managed backend. (Subsumes team-tier private packs +
      the Verified Connector partner program)
- [ ] _Risk (ADR-0021):_ entitlement bends local-first for PAID items → free items never touch backend; paid
      items use signed time-boxed offline entitlement with generous grace; tokens/keys stay in main +
      `safeStorage`, never exposed to the sandbox

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every CLI/package/manifest/entitlement trust boundary;
      AppError contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution
      trailer**
