# Phase C6 — Verified-Outcome Honesty (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [C1](phase-ai-c1-structured-state-replan.md) (typed-state
substrate)  ·  **Track:** [`phases/ai` v2](README.md)

**Goal:** Generalize the **live-proven** network recorder into the track's **honesty moat**: the
completion validator consumes **typed network evidence** for mutating actions, a completion claim
without evidence is downgraded to *"attempted, unverified"* (test-locked), and a **fabricated-success
rate** column lands on the scoreboard — [north-star condition 3](README.md#north-star--the-falsifiable-worlds-best-claim),
a metric no rival publishes. 1–2 PRs. Absorbs the v1 AI-8B close-out.

## Why

Rivals report what the page says; tepegoz reports **what the wire did**. The mechanism is already
live-proven once: the recorder
([`cdp-driver-network.electron.ts`](../../apps/desktop/src/main/agent/cdp-driver-network.electron.ts) +
[`network-verify.ts`](../../packages/browser-tools/src/network-verify.ts) — landed on
`feat/ai-8b-network-verification`, merging ahead of this phase) captured a real **507** on a
Save click and the agent's summary named it — a code present nowhere in the page text. What remains is
turning a per-action `networkWarning` string into **evidence the completion authority reasons over**,
and measuring the moat: pages that *lie* about success ("Saved!" over a 5xx) must not fool the agent.

## Exit criteria (DoD)

- [ ] **Fake-success trap fixtures** (frozen first: page shows "Saved!", wire returned 5xx; a variant
      with no UI feedback at all) **majority-pass at pooled N**; **fabricated-success-rate ≈ 0** across
      the traps, surfaced as a scoreboard column
      ([`report.ts`](../../packages/agent-eval/src/report.ts)).
- [ ] The **evidence-or-unverified downgrade is test-locked:** a mutating-action completion claim with
      no supporting network/page evidence is reported as *attempted, unverified* — never as success.
- [ ] A harness transcript shows an honest *"the save returned 5xx — it did NOT save"* end-to-end
      report.
- [ ] Held-out pooled aggregate: no regression beyond the flaky band; the **save/verify prose steer
      deleted in the proving PR** (paired with/without sweep; [`PROSE-LEDGER.md`](PROSE-LEDGER.md)).
- [ ] Delta recorded in the eval-results ledger. **i18n:** internal; evidence text is model-facing
      English, wrapped as untrusted (AI-5 boundary) like every observation.

## Tasks

- [ ] **Per-form POST/status association:** correlate the acting submit with its request(s) in the
      recorder's ring (already same-origin, XHR/Fetch/Document-only, cred/query-stripped).
- [ ] **Typed evidence to the validator:** a zod evidence shape (action, method, status, url-path)
      carried in the C1 typed working-state's *pending verifications*;
      [`planner.ts`](../../packages/orchestrator/src/planner.ts) `validateCompletion` consumes it for
      mutating-action claims; silence is **never** reported as success (the recorder's existing
      contract, extended to the goal level).
- [ ] The downgrade rule + its lock-in test; trap fixtures + scenarios (ground truth = the honest
      failure report, so a cheerful "done!" scores FAIL).
- [ ] Exit sweep (single-change branch, serialized).

## Scope notes
- **Gate discipline:** this phase gates ONLY on what its mechanism uniquely moves — the traps, the
  downgrade lock, the fabricated-success metric. `silent_api_failure` k/N is owned by
  [C1](phase-ai-c1-structured-state-replan.md) (resolves the v1 exit-gate collision).
- [M2](phase-ai-m2-external-yardstick.md)'s *verified-completion* H2H scoring reuses this evidence
  machinery on tepegoz's side.
- The deterministic **success oracle** for model-free recipe replay stays
  [Phase 6](../phase-6-deterministic-automation.md); this phase is the *agent-loop* honesty layer.
