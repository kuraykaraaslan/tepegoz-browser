# Phase S8 — Assistant UX (W4 Control & Trust)

**Status:** ⬜ Not started · **Depends on:** [S1 streaming](phase-s1-foundation-native-loop.md) · [S6 grants + risk tiers](phase-s6-safety-control-plane.md) · [S4 evidence chips](phase-s4-verified-outcomes.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Make the agent *feel* like a live, controllable assistant rather than a batch job that emits messages at step boundaries. Consume S1 token streaming in the sidebar panel, render a live step feed with per-step status and S4 evidence chips, turn the plan preview modal into the `follow_a_plan` grant surface, badge approvals with S6 risk tiers behind one-tap scoped grants, add a global agent-active indicator, surface backgroundable runs over the existing off-screen parking, connect scheduled tasks to completed runs, and gate commerce purchases behind the financial risk tier with biometric + explicit confirm. This is Comet-parity felt experience assembled from substrate that already exists but is not surfaced.

## Why

Today the assistant *feels* like a black box that reports after the fact. The concrete evidence:

- **No token streaming.** The panel event stream is `plan`/`decision`/`step_*`/`awaiting_approval`/`handoff`/`done` over `IpcChannels.agentEvent` in [ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts); [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts) consumes it and [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx) renders messages **only on step completion**. Time-to-first-visible-feedback is one full model turn. S1 introduces delta events at the gateway; this phase is their first consumer.
- **Approvals are flat modals with a blunt timer.** Per-tool approval is a modal with a 120s→deny fallback ([panel-composer.tsx](../../extensions/ext-agent/src/panel-composer.tsx) / [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts) awaiting-approval handling). There is no risk tier shown, no scope, no memory of a prior grant — every tool re-prompts. S6 defines the tiers and grant store; this phase renders them.
- **The plan modal is disconnected from grants.** A plan preview modal with per-step skip exists but does not produce a `follow_a_plan` grant — approving a plan does not lower the per-tool prompt rate. S6 defines the grant; this phase makes the plan modal the surface that mints it.
- **Background work and scheduling exist but are invisible as assistant features.** Backgrounded-window keep-compositing (PARKED-OFF-SCREEN) switches are in prod ([@tepegoz/libs](../../packages/libs)), and scheduled tasks exist in [packages/tasks](../../packages/tasks) — but neither is surfaced in the panel. Comet's felt advantage is exactly this: background parallel assistants and per-task remembered grants. We have the substrate; we have not exposed it.
- **Commerce is in scope but ungated in UI.** Owner decision: commerce is IN scope (S8 program-level). A purchase action today would flow through the same flat approval as any click. The Amazon v. Perplexity injunction is a live legal constraint that must be *surfaced* to the user (a caution, not a blocker), and purchases must be gated behind the S6 financial tier + biometric + explicit confirm **even in auto mode**.

Measured reality ([eval-results.md](eval-results.md)): only 5/52 scenarios are measured live; Anthropic N=3 failures are on-page, not escape. This phase claims **no** competence delta — it is instrumented mechanicals only (feedback latency, approval count) and an explicitly non-claim-bearing dogfooding pass. See [constitution.md](constitution.md) for the honesty rules this DoD obeys.

## Exit criteria (DoD)

- [ ] **Time-to-first-feedback ≤ 1.5s p50**, measured from run-start to first rendered delta via event timestamps on the acceptance family (⏸ funded sweep) — instrumented in the panel, not a subjective judgement.
- [ ] **Approvals per task** (the metric shared with [S6](phase-s6-safety-control-plane.md)) drops on the acceptance + web-patterns families once plan-grant and scoped-grant land (⏸ funded sweep); reported jointly with S6, not double-counted.
- [ ] **Zero i18n missing-key lint** across `ext-agent` EN + TR dictionaries; every new panel string exists in both in the same PR (per [ADR-0016/0017](../../docs/adr)).
- [ ] Streaming narration renders deltas incrementally in [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx); with S1 disabled the panel falls back to step-completion rendering (no regression).
- [ ] Live step feed shows per-step status (running/done/failed/skipped) and S4 evidence chips resolve to their citations ([S4](phase-s4-verified-outcomes.md)).
- [ ] Plan modal approval mints a `follow_a_plan` grant read by the S6 store (verified by a reduced per-tool prompt count on a plan-approved run).
- [ ] Approval modals show the S6 risk-tier badge and a one-tap scoped grant; the grant is honoured for subsequent same-scope tools in the run.
- [ ] Agent-active indicator visible per-tab and in the tray while a run holds the lock ([agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); clears on `done`/`stop`.
- [ ] "Continue in background" affordance parks the run's tab off-screen (existing keep-compositing) and the indicator reflects background state.
- [ ] "Do this every Monday" creates a scheduled task from a completed run via [packages/tasks](../../packages/tasks), carrying the run's grant scope.
- [ ] Commerce/purchase actions are gated behind the S6 financial tier + biometric + explicit confirm even in auto mode, with the Amazon v. Perplexity caution note shown once per purchase surface.
- [ ] **Dogfooding checklist** completed and explicitly marked **NOT claim-bearing** in [eval-results.md](eval-results.md) (no vanity "UX score" anywhere).
- [ ] Ledger delta recorded in [PROSE-LEDGER.md](PROSE-LEDGER.md) if any prose is touched (this phase owns none — record "no prose steer").
- [ ] No `apps/desktop` growth beyond IPC wiring; UI logic lands in `extensions/ext-agent` and any shared surface in a `@tepegoz/*` package.

## Tasks

Six UI-scoped PRs, each ≤250 lines, sequenced behind their substrate phases. No fixture freeze PR — this is a UI phase (see [Fixtures](#fixtures)).

### PR1 — Streaming narration
- [ ] Extend the panel event contract to carry S1 delta events; zod `safeParse` the delta shape at the IPC boundary in [ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts) (schema from `@tepegoz/shared-types`).
- [ ] Consume deltas in [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts); **batch delta flush at 30–50ms** to avoid IPC/render flooding (single coalescing timer, not per-token).
- [ ] Render incremental text in [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx); fall back to step-completion rendering when S1 is off.
- [ ] Instrument run-start→first-delta timestamp for the ≤1.5s p50 metric; emit to the existing event stream.
- [ ] EN + TR strings for any new status labels.

### PR2 — Live step feed + evidence chips
- [ ] Step-feed component in `ext-agent` with per-step status (running/done/failed/skipped) driven by `step_*` events; split out of [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx) if it approaches the 250-line cap.
- [ ] Render S4 evidence chips against each step's citations ([S4](phase-s4-verified-outcomes.md)); chip → citation resolution only, no new data.
- [ ] EN + TR strings for status + chip labels.

### PR3 — Plan-grant surface
- [ ] Wire the existing plan preview modal to mint a `follow_a_plan` grant via the S6 store on approval; keep per-step skip.
- [ ] Read the grant in the approval path ([panel-session.ts](../../extensions/ext-agent/src/panel-session.ts)) so plan-covered tools do not re-prompt.
- [ ] EN + TR strings for the plan-grant affordance.

### PR4 — Risk-tier approval badges + one-tap grant
- [ ] Add the S6 risk-tier badge to the approval modal ([panel-composer.tsx](../../extensions/ext-agent/src/panel-composer.tsx) / session awaiting-approval path).
- [ ] One-tap scoped-grant control that writes a scoped grant to the S6 store; subsequent same-scope tools in the run honour it.
- [ ] Keep the 120s→deny fallback but make the badge/scope legible before it fires.
- [ ] EN + TR strings for tier names + scope labels.

### PR5 — Agent-active indicator + backgroundable run + scheduled-task-from-run
- [ ] Per-tab + tray agent-active indicator driven by the run lock ([agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); IPC wiring only in `apps/desktop`, presentation in `ext-agent`.
- [ ] "Continue in background" affordance over the existing PARKED-OFF-SCREEN keep-compositing switches ([@tepegoz/libs](../../packages/libs)); indicator reflects background state.
- [ ] "Do this every Monday" control on a completed run → create a scheduled task via [packages/tasks](../../packages/tasks), carrying the run's grant scope; sync-meta columns for any new persisted task row.
- [ ] EN + TR strings for indicator, background, and schedule affordances.

### PR6 — Commerce approval flow
- [ ] Purchase-action approval surface gated behind the S6 financial risk tier + biometric + explicit confirm, **even in auto mode**.
- [ ] Surface the Amazon v. Perplexity caution note once per purchase surface (informational, non-blocking).
- [ ] Ensure the gate is enforced at the approval path, not merely rendered (reads the S6 tier; does not rely on renderer autonomy state).
- [ ] EN + TR strings for the commerce gate + caution note.

## Fixtures

None. This is a UI phase — no new [packages/agent-eval](../../packages/agent-eval) scenarios. The DoD metrics ride existing families (acceptance for feedback latency; acceptance + web-patterns for approvals/task, shared with [S6](phase-s6-safety-control-plane.md)). The dogfooding checklist is a manual, explicitly non-claim-bearing pass recorded in [eval-results.md](eval-results.md).

## Prose steers

None. This phase owns no [PROSE-LEDGER.md](PROSE-LEDGER.md) row — it deletes no browsing-strategy prose. Record "no prose steer" for S8 in the ledger.

## ADR

None. This phase surfaces existing substrate and consumes S1/S4/S6 contracts; it adds no new architectural decision. New ADRs continue from 0025 in other phases.

## Risks

- **IPC delta flooding.** Per-token IPC would swamp the renderer. *Mitigation:* coalesce delta flush at 30–50ms (PR1) — a single timer, never per-token; the batch window is the tuning knob, not the render loop.
- **UX work absorbing unbounded scope.** UI polish invites endless additions. *Mitigation:* the non-goals below are binding; anything outside them is deferred, not negotiated in-phase.
- **Commerce legal / ToS exposure.** Automating purchases carries live legal risk (Amazon v. Perplexity injunction). *Mitigation:* surface the caution note (PR6), gate behind the S6 financial tier + biometric + explicit confirm even in auto mode, and enforce at the approval path — never rely on renderer-side autonomy state.
- **Grant-store race with S6.** Plan/scoped grants must read the same S6 store the kernel reads. *Mitigation:* PR3/PR4 depend on S6 landing its store first; if S6 slips, these PRs rest at 🟠 measurement-owed rather than shipping a divergent grant path.

**Non-goals (explicit):** voice interaction; multi-run / parallel-assistant UI (deferred to the parallel-runs backlog phase — one run at a time remains enforced by [agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); any vanity "UX score" or subjective competence claim.
