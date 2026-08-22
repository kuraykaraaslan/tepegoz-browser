# Phase 9 — Safe Autonomy & Governed Delegation

**Status:** 🟡 In progress (Mandate kernel + Policy Bundle narrowing + Agent Endpoint gate decision layers landed 2026-08-20) · **Estimate:** ~4–6 months · **Depends on:** Phase 1a/1b (Policy Kernel, HITL,
Windows Hello, Effect Ledger fencing, tepegöz-as-MCP-server) + Phase 2 (IntegrationAdapters, Credential Vault)

- Phase 7 (NotaryService)
  **Goal:** The killer agentic use cases — buy/book/pay, agent-to-agent delegation, inbound MCP — are exactly
  where injection and excessive-agency disasters happen (CometJacking, 1Password vault takeover, zero-click Drive
  wipe, Fellou's IDOR endpoint). The single Policy-Enforcement-Point + sealed one-way narrowing + Effect Ledger
  fencing let tepegöz ship **cryptographically bounded, revocable, replay-safe autonomy primitives** that turn
  those liabilities into flagship trust features — **without widening the security floor**.
  **Branch examples:** `feat/mandate-kernel`, `feat/policy-bundles`, `feat/governed-agent-endpoints`

## Exit criteria (DoD)

- [~] **Transaction Mandate**: the agent can transact ONLY inside an active, signed mandate; anything outside is
  denied **pre-model** at the Capability Broker; every consumption is journaled + notarized; revoke is
  instant; replay never double-charges (Effect Ledger fencing)
  _(landed: [mandate-kernel.ts](../../packages/security-policy/src/mandate-kernel.ts) — `mandateCovers` + `consumeMandate`, 17 tests including replay returning the same verdict across expiry/revocation. **Owed:** signing, wiring into the Capability Broker, journaling, and notarization — nothing here is called by a real run yet.)_
- [~] **Verifiable Policy Bundle**: a signed, versioned bundle installs with scope review; a child bundle can
  **never widen** a parent (sealed narrowing enforced at compile-to-IR); each notarized receipt embeds the
  bundle hash in force
  _(landed: [policy-bundle-narrowing.ts](../../packages/security-policy/src/policy-bundle-narrowing.ts) — `bundleNarrows` + `bundleChainNarrows`, 11 tests. **Owed:** signing, the marketplace install/scope-review flow, the curated bundles themselves, and embedding the bundle hash in a receipt.)_
- [~] **Governed Agent Endpoint**: an external client calls a scoped Bearer token; every inbound call re-flows
  the full Policy Kernel + HITL + Egress + Effect Ledger; sensitive-site lockout holds regardless of token;
  revocation + per-caller audit + kill-switch work
  _(landed: [agent-endpoint-gate.ts](../../packages/security-policy/src/agent-endpoint-gate.ts) — `tokenCovers` + `withinRateLimit`, 10 tests directly asserting the sensitive-site lockout is checked BEFORE the token's own scope. **Owed:** an actual listening surface, token minting, and the full Policy Kernel/HITL/Egress/Effect-Ledger re-flow this line asks for — only the token's own scope check exists today.)_
- [ ] **i18n:** en+tr keys added for new surfaces (Mandate authoring/consumption UI, Policy Bundle install/scope
      review, Agent Endpoints settings + External-Agents console)
- [x] ADRs accepted: **ADR-0016** (Transaction Mandate Kernel), **ADR-0017** (Verifiable Policy Bundles),
      **ADR-0018** (Governed Agent Endpoints)
      _(land as [ADR-0033](../../docs/adr/0033-transaction-mandate-kernel.md), [ADR-0034](../../docs/adr/0034-verifiable-policy-bundles.md), [ADR-0035](../../docs/adr/0035-governed-agent-endpoints.md) — all three numbers were already claimed before this phase document was written; see each ADR's numbering note.)_
- [ ] Red-team: injection cannot exceed an active mandate, widen a bundle, or escalate a scoped token
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** The Mandate coverage/consumption logic, the Policy Bundle
> narrowing check, and the Agent Endpoint token gate are all real and tested (38 tests across
> `@tepegoz/shared-types` and `@tepegoz/security-policy`). **None of them is reachable from a live
> call.** There is no Capability Broker wiring, no signing, no listening HTTP/MCP surface, no minting
> UI, and no journaling. Every test in this phase constructs its own mandate/bundle/token fixtures —
> nothing here has ever seen a real one.

## Tasks

### L8/L2/L6 — Transaction Mandate Kernel (bounded, signed, revocable authority)

- [ ] A **Mandate** primitive: a signed, deterministic, zod-validated authorization object (max amount,
      currency, allowed merchants/domains, expiry, single-use vs recurring, required HITL thresholds) compiled
      into the Policy IR
- [ ] The agent can only transact **INSIDE** an active mandate; anything outside is denied **pre-model** by the
      Capability Broker; crossing a sub-threshold triggers **Windows-Hello HITL** (financial risk class already
      exists)
- [ ] Every consumption is a journaled, **notarized** event → a provable spend ledger; mandates revoke
      instantly and are **replay-safe** via Effect Ledger idempotency/fencing (no double-charge on resume)
- [ ] _Risk (ADR-0016):_ real money = real liability → deterministic pre-model enforcement, mandatory HITL on
      financial class, notarized spend ledger as forensic backstop, default single-use low caps

### L8/L5 — Verifiable Policy Bundles ("constitution-as-code")

- [ ] A signed, versioned **Policy Bundle** artifact: the existing `tepegoz.md` / `*.rules.yaml` compiled to
      JSON IR + Ed25519 signature + provenance + human-readable rationale + the bundle's measured **red-team
      attack-success-rate**
- [ ] Bundles install via the marketplace with signature + scope review; org-policy can **pin** a bundle
      org-wide (RBAC); every notarized Action Receipt embeds the bundle hash that authorized it ("which
      constitution was in force" is provable)
- [ ] Curated bundles: `KVKK-Healthcare`, `EU-FinServ`, `Journalist-Source-Protection`, `Paranoid-Default`.
      (Org-pin = team distribution — subsumes the team-tier shared signed policy packs)
- [ ] _Risk (ADR-0017):_ narrowing must hold across bundle inheritance → enforce **deterministically in the
      compiler** (a child bundle can never widen a parent); run the red-team corpus on each published bundle to
      publish its **actual** ASR (no claims without measurement)

### L5/L8/L9 — Governed Agent Endpoints (productized inbound MCP + A2A)

- [ ] Wrap the planned tepegöz-as-MCP-server as **Agent Endpoints**: a Settings surface minting scoped,
      revocable Bearer tokens (per-token capability allowlist, danger-class ceiling, **sensitive-site lockout
      enforced regardless of token**, per-token rate-limit/quota); every inbound call still flows through the
      full Policy Kernel + HITL + Egress Firewall + Effect Ledger
- [ ] **"External Agents" live console**: which Bearer identity called what tool when, allow/deny/HITL outcomes,
      cost, rate-limit status, per-session Replay Receipts — sourced from the Journal, SIEM-exportable, with a
      live **kill-switch**
- [ ] Short-lived, capability-scoped **A2A grants** ("this external orchestrator may call `dom_read_*` and
      `browser_navigate` on domain X for 10 minutes, read-only, no credential tools") = the same mechanism;
      headless/remote callers auto-deny destructive when no human is present
- [ ] _Risk (ADR-0018):_ new highest-value trust boundary → fail-closed deny-by-default, zod `safeParse` every
      inbound payload, tokens never grant more than the minting profile holds, full per-caller journaling
      enables revocation + forensics (the opposite of Fellou's IDOR/no-rate-limit/no-SSL-pin)

### Cross-cutting (as in every phase)

- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/mandate/bundle/inbound-MCP trust boundary;
      AppError contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution
      trailer**
