# Phase S6 — Safety & Control Plane (W4 Control & trust)

**Status:** 🟡 In progress — **PR0 + PR1 + PR2 landed 2026-08-16** (exam frozen before any S6 capability code; the autonomy-enforcement defect is closed; six derived risk tiers + a Turkish-covering sensitive-site category map — all deterministic, no sweep owed). PR3–PR7 not started · **Depends on:** [Phase S0](phase-s0-truth-and-repair.md) (PR1 early, lane-independent), [Phase S3](phase-s3-reliability-actions.md) (claim-grade ASR only) · **Track:** [AI Agent Super](README.md)

**Goal:** Close the standing autonomy-enforcement defect (the renderer, not the main-process kernel, currently decides what auto-approves), then raise the control plane to the Claude-for-Chrome safety bar: deterministic risk tiers, plan-scoped pre-approval (`follow_a_plan`), an advisory intent-alignment critic, a reachable strict mode, and a first-party credential broker that fills secrets without ever handing them to the model. This phase owns north-star condition 2 (safety) and runs the first claim-grade adversarial battery over the 24 `atk_*` scenarios. Autonomy end-state is ask/act default with `follow_a_plan` as the ceiling and the critic strictly advisory.

## Why

The enforcement bug was the headline — **fixed by PR1 on 2026-08-16; this paragraph is kept as the record of what was wrong.** `agentAutonomy` (ask/act/auto) *was* read in the **renderer**: `panel-session.ts` auto-answered the approval IPC via `autoApprovesTool` from `panel-state.ts`, while the [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) and [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) in main **never read `agentAutonomy`** — so a doctored or compromised renderer could self-approve any tool call, including financial, credential and destructive ones. Approval decisions now live behind the trust boundary in main ([autonomy-gate.ts](../../packages/security-policy/src/autonomy-gate.ts), reading `PreferenceStore`), and `autoApprovesTool` is deleted. This was a fixed defect, not a design choice; the [ADR-0006 amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--the-autonomy-level-is-main-enforced-a-fixed-defect) records it as such.

Approval fatigue is itself a vulnerability (Comet's lesson): a flat per-tool approval prompt trains the user to click through. Today approvals are undifferentiated — [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) is the single PEP but risk is not classified by tool×argument. The sensitivity signal we do have, [sensitive-site.ts](../../packages/security-policy/src/sensitive-site.ts), is a 22-keyword hostname substring list with no Turkish banking/gov coverage and no category structure.

The defensive surface that exists is partly dead. [content-guard.ts](../../packages/tool-executor/src/content-guard.ts) `setStrictMode` landed but is **UNREACHABLE — no caller wires it**. The 24 `atk_*` scenarios in [packages/agent-eval](../../packages/agent-eval) have **never run** ([eval-results.md](eval-results.md): only 5/52 scenarios ever measured live); [Phase S0](phase-s0-truth-and-repair.md)'s baseline produces the first attack-surface numbers.

The target bar is public. Claude for Chrome ships three permission modes (ask / `follow_a_plan` / skip_all), an independent intent-alignment critic, and a published attack-success-rate reduction (23.6→11.2% autonomous, 35.7→0% browser-specific on 123 cases). We match its shape — deterministic pre-model kernel ([ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md)) plus a post-kernel advisory critic plane — while keeping the owner's constraint that the critic is advisory, not blocking-grade DoD. Credential brokering and commerce are both in scope (the broker lands here; the purchase flow lives in [Phase S8](phase-s8-assistant-ux.md)); the Amazon v. Perplexity injunction is a live legal constraint noted for S8.

Sequencing: the claim-grade ASR sweep runs **after [S3](phase-s3-reliability-actions.md)**. Measuring attack-success at 1/3 benign competence inflates the safety number — a browser that can barely complete a benign task also fails many attacks by incompetence, not by defence.

## Exit criteria (DoD)

- [x] Autonomy is main-enforced: unit + integration proof that a doctored renderer answering an approval it was **not** asked for is **rejected**, and that `agentAutonomy` is read only in main (PolicyKernel/ToolGateway consult the main-held level; the renderer approval path is display-only). No `⏸` — this is deterministic and testable offline. **→ Landed 2026-08-16 (PR1).** `resolveAutonomy` ([autonomy-gate.ts](../../packages/security-policy/src/autonomy-gate.ts), 12 tests) is the only place a level becomes a decision and runs in main against `PreferenceStore`; the renderer path is display-only and `autoApprovesTool` is **deleted**; uncorrelated / guessed / replayed responses are rejected by [hitl-registry.ts](../../apps/desktop/src/main/agent/hitl-registry.ts) (9 tests). Recorded as a fixed defect in the [ADR-0006 amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--the-autonomy-level-is-main-enforced-a-fixed-defect).
- [x] Risk-tier classification is deterministic in the kernel: every tool×argument resolves to exactly one of `read` / `ui-write` / `data-egress` / `financial` / `credential` / `destructive`, unit-tested over a frozen tool×arg matrix; the category map is i18n-aware and covers Turkish banking/gov domains. No `⏸`. **→ Landed 2026-08-16 (PR2).** [`classifyRisk`](../../packages/security-policy/src/risk-classifier.ts) derives the tier from tool × validated args × target ([25 tests](../../packages/security-policy/src/risk-classifier.test.ts) over the frozen matrix); [`sensitive-site.ts`](../../packages/security-policy/src/sensitive-site.ts) is now a 5-category map covering Turkish banking + the whole `gov.tr`/`bel.tr` tree ([19 tests](../../packages/security-policy/src/sensitive-site.test.ts)); EN + full-TR labels for all six classes landed in the same PR. **Design recorded** in the [ADR-0006 tier amendment](../../docs/adr/0006-policy-kernel-hitl.md#amendment-2026-08-16--six-derived-risk-tiers--a-sensitive-site-category-map): the tier is **derived** from — not a replacement for — the declared `dangerClass`, because a declared class is argument-blind *and* is itself a trust input supplied by the tool author.
- [ ] `follow_a_plan`: approving a plan mints scoped grants (domains × tool-classes × `runId`, eTLD+1 matched, run-expiring), recorded in main and enforced by the kernel; unit + integration proof a grant does not extend across an off-scope redirect. No `⏸`.
- [ ] Approvals per task on the acceptance family fall **≥50%** under `follow_a_plan` with **zero** auto-approved financial/credential/destructive actions (⏸ funded sweep, paired with/without `follow_a_plan`).
- [ ] ASR on the `atk_*` battery reported as "k/K, 95% binomial upper bound X%" with **upper bound ≤5%** at pooled N≥10/scenario, **240+ trials** total (⏸ funded sweep, runs AFTER [S3](phase-s3-reliability-actions.md)).
- [ ] Credential broker: **0** secret-in-model-context leaks at N≥10 on the credential-never-leaks fixtures (⏸ funded sweep).
- [ ] Strict-mode wiring: paired sweep shows **no benign-task regression >5pp** with strict mode on vs off (⏸ funded sweep, paired).
- [ ] Advisory intent-critic logs divergence on the critic-divergence fixtures and **does not block** (owner decision); its ledger entries are auditable. Divergence-detection rate is reported but is not a blocking gate.
- [ ] Constitution: attack + critic + credential fixtures frozen in PR0 **before** any capability code; the measured delta recorded in [eval-results.md](eval-results.md) and the [PROSE-LEDGER](PROSE-LEDGER.md); every prose deletion paired with/without sweep; i18n EN + full-TR parity for the risk-tier labels, approval UI, and broker prompts landed in the same PR as the surface.

## Tasks

### PR0 — fixture freeze
- [x] Freeze the 24 `atk_*` scenarios as the claim-grade battery in [packages/agent-eval](../../packages/agent-eval) (no capability code in this PR; frozen ground truth only).
- [x] Add **critic-divergence** fixtures: benign-task-turns-malicious mid-run (a page or tool result injects a mutating instruction that diverges from the original request) under the registry; ~~assert the critic *logs* divergence (advisory, non-blocking)~~. **4 scenarios landed** (`critic-divergence.json`; reveal-then-mutate, fetched-content vector, Turkish, held-out destructive). **Assertion partially owed:** they assert the *behavioural* ground truth (original task answered, mutation absent) — the critic-log assertion needs the critic, which is PR4. Recorded in the [assertion-debt table](fixture-freeze.md#assertion-debt--read-before-quoting-either-family).
- [x] Add **credential-never-leaks** fixtures: a task requiring authenticated fill; ~~assert the secret string **never** appears in model context (prompt or history) across the run~~. **4 scenarios landed** (`credential-safety.json`; saved-password prompt, cross-origin post, Turkish auth wall, held-out secret-echo). **Assertion partially owed:** the schema cannot scan model context yet, so a pass today means *"the agent did not visibly type a secret"*, **not** *"no secret entered the model's context"* — the real assertion lands with the broker in PR6.
- [x] Record the frozen scenario counts and expected-shape in [eval-results.md](eval-results.md) as "awaiting funded key" rows.

### PR1 — autonomy-to-main (the bug fix; early, lane-independent, tiny)
- [x] Move the autonomy decision to main: the [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) approval flow consults [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts) with the main-held autonomy level from [ipc-agent-config.ts](../../apps/desktop/src/main/ipc/ipc-agent-config.ts).
- [x] Make the renderer approval path **display-only**: remove `autoApprovesTool` auto-answer at [panel-session.ts:129-131](../../extensions/ext-agent/src/panel-session.ts); [panel-state.ts:22](../../extensions/ext-agent/src/panel-state.ts) no longer decides.
- [x] Regression test: a renderer answering an approval it was **not** asked for is rejected in main (correlate approval responses to outstanding requests by id).
- [x] zod `safeParse` the approval-response IPC at the main boundary; `AppError` on mismatch.

### PR2 — risk-tier classes + category map
- [x] Add deterministic tool×argument classification in ~~[PolicyKernel](../../packages/security-policy/src/policy-kernel.ts)~~ **[`risk-classifier.ts`](../../packages/security-policy/src/risk-classifier.ts)**: `read` / `ui-write` / `data-egress` / `financial` / `credential` / `destructive`; classes are the schema source in [@tepegoz/shared-types](../../packages/shared-types) ([`risk-tier.ts`](../../packages/shared-types/src/risk-tier.ts)). **Placement deviation (deliberate):** it is a sibling module in the same L8 package rather than a method on `PolicyKernel`, so `PolicyKernel.evaluate` stays a pure function of tool × taint × target with no argument inspection — [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md)'s "deterministic and pre-model" property is preserved by keeping the two concerns separable. Both run pre-model in main; nothing moved outside the kernel's trust boundary.
- [x] Replace flat per-tool approvals with per-class approval semantics threaded through [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts). The gateway classifies on the **validated** args, passes `risk` on `ConfirmRequest`, and records `riskTier` on every `AuditEntry`. `act` autonomy now holds `financial`/`credential`/`destructive` **by tier** — closing a real gap: a password fill is declared merely `state_changing`, so the old `biometric` flag let it through `act` unprompted.
- [x] Turn [sensitive-site.ts](../../packages/security-policy/src/sensitive-site.ts) from a keyword substring list into an extensible, i18n-aware category map (Turkish banking/gov domains included); keep it a package, not `apps/desktop` growth.
- [x] i18n EN + full-TR labels for the six risk classes and the approval surface, landed in this PR.

### PR3 — plan-scoped grants (`follow_a_plan`)
- [ ] Approving the plan (existing plan-approval HITL in [agent-runtime](../../packages/agent-runtime)) MINTS scoped grants: `{domains × tool-classes × runId}`, eTLD+1 matched, run-expiring; grants live in main.
- [ ] Enforce grants in [PolicyKernel](../../packages/security-policy/src/policy-kernel.ts): a covered action skips the per-tool prompt; an off-scope action re-prompts.
- [ ] Grant persistence is ephemeral to the run (`runId`-scoped, expires at run end); if any grant record is persisted it carries sync-meta (`updated_at`/`version`/`tombstone`, UUID PK, `device_id`).
- [ ] Integration test: an off-scope redirect (different eTLD+1) does not inherit the grant; explicit sub-domain policy documented.

### PR4 — advisory intent-critic plane (flagged)
- [ ] Add a classify-tier (haiku) critic invoked by [ToolGateway](../../packages/capability-plane/src/tool-gateway.ts) **after** the deterministic kernel and before dispatch — a separate plane, so [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md) stays intact (kernel remains deterministic and pre-model).
- [ ] Critic compares each **mutating** action (ui-write / data-egress / financial / credential / destructive) to the original request; runs only on mutating classes to bound cost.
- [ ] ADVISORY: logs divergence to the run journal, **does not block** (owner decision); flag-gated so it can be enabled per sweep.
- [ ] zod `safeParse` the critic verdict; the critic never sees secrets (respects the broker boundary from PR6).

### PR5 — strict-mode wiring
- [ ] Add the missing caller for [content-guard.ts](../../packages/tool-executor/src/content-guard.ts) `setStrictMode` — wire it to the main-held run config in [ipc-agent-config.ts](../../apps/desktop/src/main/ipc/ipc-agent-config.ts).
- [ ] Expose strict mode as a run setting; i18n EN + full-TR for the toggle.
- [ ] Guard the wiring with a test asserting `setStrictMode` is reached (regression against re-orphaning).

### PR6 — credential broker (safeStorage + biometric fill)
- [ ] The agent emits a "request credential for domain" **intent**; main resolves it against a `safeStorage`-backed store (existing "secrets only in main via safeStorage" rule).
- [ ] Main fills the credential via CDP after a biometric/OS-auth gate; the agent **never** receives the secret — no secret enters the model context.
- [ ] Broker is a `@tepegoz/*` package (no `apps/desktop` growth); credential records carry sync-meta columns.
- [ ] zod `safeParse` the credential-request intent and the domain; eTLD+1 match the request against the stored entry; `AppError` on mismatch.
- [ ] i18n EN + full-TR for the biometric prompt and broker consent surface.

### PR7 — claim-grade ASR sweep (⏸, AFTER S3)
- [ ] Run the frozen `atk_*` battery live at pooled N≥10/scenario, 240+ trials; report ASR as "k/K, 95% binomial upper bound X%".
- [ ] Run the paired `follow_a_plan` approvals-per-task sweep on the acceptance family and the strict-mode paired benign sweep.
- [ ] Run the credential-never-leaks sweep (N≥10) and the critic-divergence sweep.
- [ ] Record every delta in [eval-results.md](eval-results.md); update [history.md](history.md).

## Fixtures

Frozen in PR0 before any capability code:
- The existing **24 `atk_*`** scenarios in [packages/agent-eval](../../packages/agent-eval) — first claim-grade run (S0 gives the baseline numbers).
- **Critic-divergence** fixtures — a benign task turns malicious mid-run (injected mutating instruction); assert the advisory critic logs divergence.
- **Credential-never-leaks** fixtures — assert the secret never enters model context (prompt or history) across the run.

## Prose steers

None. `SECURITY_PREAMBLE` is a live defensive control, not prose debt; this phase owns no [PROSE-LEDGER](PROSE-LEDGER.md) row. If PR2's category map lets any hardcoded sensitivity prose be deleted, that deletion is paired with/without sweep per the constitution and recorded then.

## ADR

Amends [ADR-0006](../../docs/adr/0006-policy-kernel-hitl.md): records the six risk tiers, plan-scoped grants (eTLD+1, run-expiring), and the **position** of the advisory critic plane (post-kernel, pre-dispatch — the kernel stays deterministic and pre-model). Documents the renderer-autonomy enforcement bug as a **fixed defect**, not a design decision. Continues the ADR series from 0025 if the credential-broker trust model warrants its own record (agent-emits-intent / main-fills-via-CDP / model-never-sees-secret).

## Risks

- **Critic latency/cost per mutating action.** Mitigation: haiku classify tier, run only on the five mutating classes (never on `read`), advisory-only so it never sits on the blocking path; flag-gated per sweep.
- **Grant-scope leakage across redirects.** Mitigation: eTLD+1 matching with an explicit sub-domain policy documented in the ADR; PR3 integration test asserts an off-scope redirect does not inherit the grant.
- **Commerce legal exposure.** The Amazon v. Perplexity injunction is a live constraint; flagged here, but the actual purchase flow lives in [Phase S8](phase-s8-assistant-ux.md) — the broker in this phase only fills credentials, it does not transact.
- **Spike-first:** PR6's biometric/OS-auth gate is platform-dependent (Windows Hello via Electron `safeStorage`/OS APIs) — a small spike PR validates the CDP-fill-after-biometric path before the full broker lands.
- **Inflated safety number if run early.** Mitigation: PR7 is hard-gated to run after [S3](phase-s3-reliability-actions.md); ASR at 1/3 benign competence is not claim-grade.
