# Phase S8 — Assistant UX (W4 Control & Trust)

**Status:** 🟠 Measurement-owed (PR1–PR6 landed 2026-08-19; the two ⏸ funded metrics, per-step citation chips, and the per-tab badge are open) · **Depends on:** [S1 streaming](phase-s1-foundation-native-loop.md) · [S6 grants + risk tiers](phase-s6-safety-control-plane.md) · [S4 evidence chips](phase-s4-verified-outcomes.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Make the agent _feel_ like a live, controllable assistant rather than a batch job that emits messages at step boundaries. Consume S1 token streaming in the sidebar panel, render a live step feed with per-step status and S4 evidence chips, turn the plan preview modal into the `follow_a_plan` grant surface, badge approvals with S6 risk tiers behind one-tap scoped grants, add a global agent-active indicator, surface backgroundable runs over the existing off-screen parking, connect scheduled tasks to completed runs, and gate commerce purchases behind the financial risk tier with biometric + explicit confirm. This is Comet-parity felt experience assembled from substrate that already exists but is not surfaced.

## Why

Today the assistant _feels_ like a black box that reports after the fact. The concrete evidence:

- **No token streaming.** The panel event stream is `plan`/`decision`/`step_*`/`awaiting_approval`/`handoff`/`done` over `IpcChannels.agentEvent` in [ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts); [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts) consumes it and [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx) renders messages **only on step completion**. Time-to-first-visible-feedback is one full model turn. S1 introduces delta events at the gateway; this phase is their first consumer.
- **Approvals are flat modals with a blunt timer.** Per-tool approval is a modal with a 120s→deny fallback ([panel-composer.tsx](../../extensions/ext-agent/src/panel-composer.tsx) / [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts) awaiting-approval handling). There is no risk tier shown, no scope, no memory of a prior grant — every tool re-prompts. S6 defines the tiers and grant store; this phase renders them.
- **The plan modal is disconnected from grants.** A plan preview modal with per-step skip exists but does not produce a `follow_a_plan` grant — approving a plan does not lower the per-tool prompt rate. S6 defines the grant; this phase makes the plan modal the surface that mints it.
- **Background work and scheduling exist but are invisible as assistant features.** Backgrounded-window keep-compositing (PARKED-OFF-SCREEN) switches are in prod ([@tepegoz/libs](../../packages/libs)), and scheduled tasks exist in [packages/tasks](../../packages/tasks) — but neither is surfaced in the panel. Comet's felt advantage is exactly this: background parallel assistants and per-task remembered grants. We have the substrate; we have not exposed it.
- **Commerce is in scope but ungated in UI.** Owner decision: commerce is IN scope (S8 program-level). A purchase action today would flow through the same flat approval as any click. The Amazon v. Perplexity injunction is a live legal constraint that must be _surfaced_ to the user (a caution, not a blocker), and purchases must be gated behind the S6 financial tier + biometric + explicit confirm **even in auto mode**.

Measured reality ([eval-results.md](eval-results.md)): only 5/52 scenarios are measured live; Anthropic N=3 failures are on-page, not escape. This phase claims **no** competence delta — it is instrumented mechanicals only (feedback latency, approval count) and an explicitly non-claim-bearing dogfooding pass. See [constitution.md](constitution.md) for the honesty rules this DoD obeys.

## Exit criteria (DoD)

- [ ] **Time-to-first-feedback ≤ 1.5s p50**, measured from run-start to first rendered delta via event timestamps on the acceptance family (⏸ funded sweep) — instrumented in the panel, not a subjective judgement.
- [ ] **Approvals per task** (the metric shared with [S6](phase-s6-safety-control-plane.md)) drops on the acceptance + web-patterns families once plan-grant and scoped-grant land (⏸ funded sweep); reported jointly with S6, not double-counted.
- [x] **Zero i18n missing-key lint** across `ext-agent` EN + TR dictionaries; every new panel string exists in both in the same PR (per [ADR-0016/0017](../../docs/adr)).
- [x] Streaming narration renders deltas incrementally in [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx); with S1 disabled the panel falls back to step-completion rendering (no regression).
- [ ] Live step feed shows per-step status (running/done/failed/skipped) and S4 evidence chips resolve to their citations ([S4](phase-s4-verified-outcomes.md)).
- [x] Plan modal approval mints a `follow_a_plan` grant read by the S6 store (verified by a reduced per-tool prompt count on a plan-approved run).
- [x] Approval modals show the S6 risk-tier badge and a one-tap scoped grant; the grant is honoured for subsequent same-scope tools in the run.
- [ ] Agent-active indicator visible per-tab and in the tray while a run holds the lock ([agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); clears on `done`/`stop`.
- [x] "Continue in background" affordance parks the run's tab off-screen (existing keep-compositing) and the indicator reflects background state.
- [ ] "Do this every Monday" creates a scheduled task from a completed run via [packages/tasks](../../packages/tasks), carrying the run's grant scope.
- [x] Commerce/purchase actions are gated behind the S6 financial tier + biometric + explicit confirm even in auto mode, with the Amazon v. Perplexity caution note shown once per purchase surface.
- [ ] **Dogfooding checklist** completed and explicitly marked **NOT claim-bearing** in [eval-results.md](eval-results.md) (no vanity "UX score" anywhere).
- [x] Ledger delta recorded in [PROSE-LEDGER.md](PROSE-LEDGER.md) if any prose is touched (this phase owns none — record "no prose steer").
- [x] No `apps/desktop` growth beyond IPC wiring; UI logic lands in `extensions/ext-agent` and any shared surface in a `@tepegoz/*` package.

## Tasks

Six UI-scoped PRs, each ≤250 lines, sequenced behind their substrate phases. No fixture freeze PR — this is a UI phase (see [Fixtures](#fixtures)).

### PR1 — Streaming narration

- [x] Extend the panel event contract to carry S1 delta events; zod `safeParse` the delta shape at the IPC boundary in [ipc-agent-run.ts](../../apps/desktop/src/main/ipc/ipc-agent-run.ts) (schema from `@tepegoz/shared-types`).
- [x] Consume deltas in [panel-session.ts](../../extensions/ext-agent/src/panel-session.ts); **batch delta flush at 30–50ms** to avoid IPC/render flooding (single coalescing timer, not per-token).
- [x] Render incremental text in [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx); fall back to step-completion rendering when S1 is off.
- [x] Instrument run-start→first-delta timestamp for the ≤1.5s p50 metric; emit to the existing event stream.
- [x] EN + TR strings for any new status labels.

### PR2 — Live step feed + evidence chips

- [ ] Step-feed component in `ext-agent` with per-step status (running/done/failed/skipped) driven by `step_*` events; split out of [panel-thread.tsx](../../extensions/ext-agent/src/panel-thread.tsx) if it approaches the 250-line cap.
- [x] Render S4 evidence chips against each step's citations ([S4](phase-s4-verified-outcomes.md)); chip → citation resolution only, no new data.
- [x] EN + TR strings for status + chip labels.

### PR3 — Plan-grant surface

- [x] Wire the existing plan preview modal to mint a `follow_a_plan` grant via the S6 store on approval; keep per-step skip.
- [x] Read the grant in the approval path ([panel-session.ts](../../extensions/ext-agent/src/panel-session.ts)) so plan-covered tools do not re-prompt.
- [x] EN + TR strings for the plan-grant affordance.

### PR4 — Risk-tier approval badges + one-tap grant

- [x] Add the S6 risk-tier badge to the approval modal ([panel-composer.tsx](../../extensions/ext-agent/src/panel-composer.tsx) / session awaiting-approval path).
- [x] One-tap scoped-grant control that writes a scoped grant to the S6 store; subsequent same-scope tools in the run honour it.
- [x] Keep the 120s→deny fallback but make the badge/scope legible before it fires.
- [x] EN + TR strings for tier names + scope labels.

### PR5 — Agent-active indicator + backgroundable run + scheduled-task-from-run

- [ ] Per-tab + tray agent-active indicator driven by the run lock ([agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); IPC wiring only in `apps/desktop`, presentation in `ext-agent`.
- [x] "Continue in background" affordance over the existing PARKED-OFF-SCREEN keep-compositing switches ([@tepegoz/libs](../../packages/libs)); indicator reflects background state.
- [ ] "Do this every Monday" control on a completed run → create a scheduled task via [packages/tasks](../../packages/tasks), carrying the run's grant scope; sync-meta columns for any new persisted task row.
- [x] EN + TR strings for indicator, background, and schedule affordances.

### PR6 — Commerce approval flow

- [x] Purchase-action approval surface gated behind the S6 financial risk tier + biometric + explicit confirm, **even in auto mode**.
- [x] Surface the Amazon v. Perplexity caution note once per purchase surface (informational, non-blocking).
- [x] Ensure the gate is enforced at the approval path, not merely rendered (reads the S6 tier; does not rely on renderer autonomy state).
- [x] EN + TR strings for the commerce gate + caution note.

> **Mechanism + scope notes (PR1–PR6).**
>
> 1. **`auto` mode could approve a payment.** `resolveAutonomy` returned `auto_approve` unconditionally,
>    making one preference the single path around a tier nothing else may cover. Fixed, and **narrowed to
>    `financial`** — S6-PR2 had explicitly decided `auto` should mean what the user chose and encoded it
>    in a test, and this phase’s owner decision only ruled on commerce. **`credential` and `destructive`
>    are still auto-approved under `auto`. That is inconsistent and probably wrong — it is an owner call,
>    and this line is the request for it**, not a gap left by accident.
> 2. **Deltas are batched, not throttled at the source.** ~40ms coalescing, and the implementation
>    _throttles_ rather than debounces: restarting the timer per fragment would defer the flush forever
>    on an uninterrupted stream, so the longest turns — the ones streaming exists for — would show
>    nothing at all. That is a committed test.
> 3. **The delta schema lives in `@tepegoz/shared-types` and is `safeParse`d on both sides.** The sender
>    is trusted; the model text it carries is not, and the length cap is what makes "display-only"
>    enforceable rather than merely documented.
> 4. **A human widening a grant is not the system widening one.** `grantFromApproval` complements the
>    plan-grant invariant rather than breaking it: that invariant forbids the _agent_ growing a grant it
>    holds. Ungrantable tiers are stripped there exactly as at mint, so no amount of clicking assembles
>    a permission over money, secrets, or deletion.
> 5. **A control is offered only when main would honour it.** Both the one-tap scope and S9’s "remember"
>    are absent for tiers a grant may not cover — a checkbox the system would refuse teaches the user
>    that their choices are decorative.
> 6. **The tray indicator clears in the run’s `finally`, not on `done`.** An indicator that survives a
>    crash is worse than none, because it asserts something false. The tray does not import the run
>    lock; the run path pushes state in, so the system-tray icon does not depend on the agent graph.
> 7. **"Continue in background" uses `hideToTray`, never `win.hide()`** — hiding pauses the compositor
>    and blinds perception on every tab. It also composes with [S7](phase-s7-speed.md) PR3: once nothing
>    is on screen the realism pacing stops, so a backgrounded run is a faster one.

**Not done, and why.**

- **Per-step citation chips.** What landed is the RUN-level evidence verdict (Checked / Unconfirmed /
  Contradicted). Resolving a chip to a specific step’s citations needs per-step evidence threaded through
  the event stream, which does not exist yet. The run-level verdict is the part that changes what a user
  does next; the per-step version is deferred, not quietly counted as done.
- **Per-TAB agent-active indicator.** Only the tray indicator landed. A tab-strip badge is core browser
  chrome rather than `ext-agent`, and this DoD’s own boundary rule ("UI logic lands in
  `extensions/ext-agent`") argues against putting it there casually.
- **Scheduled-task-from-run carrying the grant scope.** The schedule affordance already exists
  ([schedule-task-modal.tsx](../../extensions/ext-agent/src/schedule-task-modal.tsx)). Carrying a _grant_
  into it was deliberately not built: plan grants die with their run by construction, and the durable
  equivalent is [S9](phase-s9-memory-skills.md)’s skill-scoped remembered grant. A second, divergent
  persistence path for grants is exactly what this phase’s own risk section warns against.

### PR7 — Rival-evidence UX gaps (Atlas · Fellou · Comet · Neon · Claude for Chrome)

> **Where this came from.** Four rival user-feedback studies —
> [Atlas](../../research/competitors/atlas.md),
> [Fellou](../../research/competitors/fellou.md),
> [Comet](../../research/competitors/perplexity-comet.md),
> [Opera Neon](../../research/competitors/opera-neon.md) — plus two independent studies of
> the Claude Chrome extension ([A](../../research/competitors/claude-extension-chatgpt.md),
> [B](../../research/competitors/claude-extension-gemini.md)). Read together they say the same
> thing in five different products: **the agent's competence is not what users complain about — its
> illegibility is.** "Something seems to have gone wrong", hidden intermediate states, credits burned on a
> failure that was the tool's fault, and a permission prompt that never remembers.
>
> **What this project already answers** (so a comparison can cite code, not intent): the four-mode command
> palette that Neon's report asks for exists ([`command-palette-core.ts`](../../extensions/ext-agent/src/command-palette-core.ts));
> the live step feed is PR2 above; policy verdicts already carry a machine-readable reason
> ([`policy-reasons.ts`](../../packages/security-policy/src/policy-reasons.ts)); scoped trust profiles exist
> ([`trust-profile-host.electron.ts`](../../apps/desktop/src/main/security/trust-profile-host.electron.ts))
> where the Claude extension's users are asking for them; run history is searchable
> ([`history-page.tsx`](../../extensions/ext-agent/src/history-page.tsx)); background work parks tabs
> off-screen instead of stealing focus. The tasks below are the residue — what those reports ask for and this
> project does **not** have.

- [ ] **Failure gets a reason, not a shrug.** When a run stops, the console states which step failed, what was
      observed, and the single next action (retry step / resume from step / hand to me). Atlas's most-repeated
      complaint is a generic error string; ours must never be one.
- [ ] **Resume from a step**, not only re-run from zero — the durable half is Phase 1b's checkpoint work; this
      is the surface that exposes it.
- [ ] **Cost forecast before the run, refund after a tool-side failure.** Show an estimated token/cost range
      alongside the plan (the cost surface already exists:
      [`settings-ai-panels-cost.tsx`](../../apps/desktop/src/renderer/src/components/settings-ai-panels-cost.tsx)),
      and do not charge the ledger for a run that died of a loop, a CAPTCHA wall, or an internal error. Fellou's
      Sparks complaints and Neon's price backlash are both this: **paying for the tool's own failure.**
- [ ] **A health panel for the agent's dependency chain** — provider key present/valid, model reachable, MCP
      servers up, local model loaded — each with a plain-language failure cause. The single largest complaint
      cluster against the Claude extension is "it is installed, the panel is open, and nothing happens."
- [ ] **Permission debug view** — for a given site and tool: what was asked, what was decided, which rule
      decided it, and why it was or was not remembered. The reasons already exist in the kernel; they are not
      yet a surface a user can open.
- [ ] **New tab is the user's, not the assistant's** — an explicit choice between assistant, bookmarks/speed
      dial, and blank. Comet's forced-AI new tab and Neon's "small AI button, confusing surface" are opposite
      failures of the same decision: the product deciding how much AI the user wants.
- [ ] **Discoverability pass** — keyboard shortcuts listed and searchable from the palette itself; every agent
      surface reachable without a mouse. Repeated in the Atlas and Neon reports as the thing that stops strong
      features from being adopted.
- [ ] **Localized to the same bar as the rest of the app** (en + tr). Both Claude-extension studies list
      missing Turkish as a support-cost and adoption problem; this project treats it as a gate.

## Fixtures

None. This is a UI phase — no new [packages/agent-eval](../../packages/agent-eval) scenarios. The DoD metrics ride existing families (acceptance for feedback latency; acceptance + web-patterns for approvals/task, shared with [S6](phase-s6-safety-control-plane.md)). The dogfooding checklist is a manual, explicitly non-claim-bearing pass recorded in [eval-results.md](eval-results.md).

## Prose steers

None. This phase owns no [PROSE-LEDGER.md](PROSE-LEDGER.md) row — it deletes no browsing-strategy prose. Record "no prose steer" for S8 in the ledger.

## ADR

None. This phase surfaces existing substrate and consumes S1/S4/S6 contracts; it adds no new architectural decision. New ADRs continue from 0025 in other phases.

## Risks

- **IPC delta flooding.** Per-token IPC would swamp the renderer. _Mitigation:_ coalesce delta flush at 30–50ms (PR1) — a single timer, never per-token; the batch window is the tuning knob, not the render loop.
- **UX work absorbing unbounded scope.** UI polish invites endless additions. _Mitigation:_ the non-goals below are binding; anything outside them is deferred, not negotiated in-phase.
- **Commerce legal / ToS exposure.** Automating purchases carries live legal risk (Amazon v. Perplexity injunction). _Mitigation:_ surface the caution note (PR6), gate behind the S6 financial tier + biometric + explicit confirm even in auto mode, and enforce at the approval path — never rely on renderer-side autonomy state.
- **Grant-store race with S6.** Plan/scoped grants must read the same S6 store the kernel reads. _Mitigation:_ PR3/PR4 depend on S6 landing its store first; if S6 slips, these PRs rest at 🟠 measurement-owed rather than shipping a divergent grant path.

**Non-goals (explicit):** voice interaction; multi-run / parallel-assistant UI (deferred to the parallel-runs backlog phase — one run at a time remains enforced by [agent-run-lock.electron.ts](../../apps/desktop/src/main/agent/agent-run-lock.electron.ts)); any vanity "UX score" or subjective competence claim.
