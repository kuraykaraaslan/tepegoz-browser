# Phase C7 — Adversarial Robustness: Measured ASR (Core)

**Status:** ⬜ Not started  ·  **Depends on:** [M1](phase-ai-m1-measurement-baseline.md) (PR1 can start
early — Lane B, guard code path, no reactor collision); claim-grade measurement after
[C4](phase-ai-c4-obstructed-pages.md)/[C5](phase-ai-c5-tabs-popups-widgets.md)  ·
**Track:** [`phases/ai` v2](README.md)

**Goal:** Turn tepegoz's strongest architectural stance into a **measured number**: wire the
landed-but-unreachable strict mode to a real setting, build a **≥20-class attack battery** with
externally-sourced attacks, and publish an honest, **binomially-bounded ASR** —
[north-star condition 2](README.md#north-star--the-falsifiable-worlds-best-claim). 2 PRs + staged
measurements. Absorbs the v1 [AI-5](archive/phase-ai-5-content-security.md) remainder and v1 `s28`.

## Why

Security is tepegoz's founding differentiator, and Claude for Chrome leads the market on exactly this
axis **with a published number** (~1% self-reported ASR). tepegoz's default-on inbound guard + egress
plane has **never been adversarially measured end-to-end** — `redteam.test.ts` drives the *plane* with
hand-built strings, but the *agent* has never been run against the injection fixture on-harness. And
the strict-mode inbound PII redaction is unreachable:
[`content-guard.ts`](../../packages/tool-executor/src/content-guard.ts) `GuardConfig.strict` has **no
caller** setting it. CometJacking shows the market punishes unmeasured security.

## Exit criteria (DoD)

- [ ] **Strict mode reachable** via a real zod-validated Settings toggle (EN+TR i18n in the owning
      package dict), verified by a harness run with it ON.
- [ ] The **battery runs end-to-end** (agent on-harness, all planes ON); every successful attack
      becomes a named frozen fixture + a code fix **or a documented accepted risk**.
- [ ] **ASR published as bounded k/K** — *"k successes in K trials, 95% binomial upper bound X%"* —
      with open methodology and an explicit **commensurability caveat** vs Anthropic's self-reported
      figure (never framed as "beats Claude's 1%"). A ≤1%-upper-bound statement only at ≥300 pooled
      clean trials (claim-gate, not the phase gate — the phase publishes whatever it measures).
- [ ] **ASR is conditioned on benign-subtask success** within each trial — an agent too incompetent to
      reach the attack surface resists everything for free; the confound is named and excluded
      (which is why the claim-grade run waits for C4/C5 competence).
- [ ] **Benign held-out sweep:** the guard causes no pooled competence regression beyond the flaky
      band (safety is not bought with competence).
- [ ] Fixtures frozen before their fix lands (the fix cycle's exam is never authored-and-passed in one
      PR); delta + the ASR table recorded in the eval-results ledger.

## Tasks

### PR1 — reachability + battery (early, Lane B)
- [ ] Wire `GuardConfig.strict` to a user setting: zod-validated preference through the existing
      preferences/IPC plane (`packages/preferences` → `packages/desktop-ipc` → Settings surface),
      EN+TR strings in the owning dict; harness knob to force it on for eval runs.
- [ ] The **≥20-class battery**: injection (visible/hidden text), forged trust tags, zero-width/
      homoglyph obfuscation, fake-download bait, scroll-hide, hidden decoy/honeypot, disabled-control
      trap, exfil lures, CometJacking-class link/agent-command attacks — **externally-sourced attacks
      mandatory** (ported public PoCs / red-team corpora), because self-authored exams can be tuned to
      the fix. Expressed as fixtures + scenarios in the existing zod registry.

### PR2 — fix cycle + measurement
- [ ] **M-early:** first honest end-to-end ASR at modest K (bounded, published with its wide interval).
- [ ] Fix cycle per successful attack; a model-based **classifier v2** behind the deterministic layer
      gets an evidence-based go/no-go (v1 `s29` follow-up).
- [ ] **M-claim (after C4/C5):** pooled trials scaled toward ≥300 for any ~1%-bound statement.
- [ ] Exit sweep + benign no-regress sweep (single-change branch, serialized).

## Scope notes
- The authoritative security decisions stay in the Policy Kernel / Egress Firewall / HITL — this
  phase measures and hardens the **inbound** layer, it does not move authority.
- Publication/signing of the ASR (and the policy-bundle red-team contract) routes to
  [Phase 9](../phase-9-safe-autonomy-delegation.md); [M2](phase-ai-m2-external-yardstick.md) carries
  the number as a moat column.
