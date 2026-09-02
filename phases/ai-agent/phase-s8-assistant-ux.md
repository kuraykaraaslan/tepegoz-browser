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
  - _Note (2026-09-02): the row above is closer than it looks — this is **re-wiring a surface, not building a
    capability**. The `scheduleTask.*` keys (`presetContinuous`, `presetInterval`, `presetPageChange`,
    `autonomyNotify`, `autonomySameOrigin`) are already shipped in `ext-agent`'s dictionary, and
    [`@tepegoz/tasks`](../../packages/tasks) already supports the interval and page-change triggers they name;
    what happened is that the panel affordance was **removed** pending a Tasks product rework. HARPA AI's
    single most-used capability — price / competitor watching — is exactly what this row unlocks, which is a
    reason to rank it above its apparent size._
    _[`../../docs/research-harpa-ai.md`](../../docs/research/research-harpa-ai.md)._

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
> [Atlas](../../docs/research/research-atlas.md),
> [Fellou](../../docs/research/research-fellou.md),
> [Comet](../../docs/research/research-perplexity-comet.md),
> [Opera Neon](../../docs/research/research-opera-neon.md) — plus two independent studies of
> the Claude Chrome extension ([A](../../docs/research/research-claude-for-chrome.md),
> [B](../../docs/research/research-claude-for-chrome.md)). Read together they say the same
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

> **Second wave (2026-09-01 studies).** Six items from a later sweep —
> [Fellou](../../docs/research/research-fellou.md), [Opera Neon](../../docs/research/research-opera-neon.md),
> [Comet](../../docs/research/research-perplexity-comet.md), [Claude for Chrome](../../docs/research/research-claude-for-chrome.md)
> and [Dia](../../docs/research/research-dia-browser.md). Unlike the list above (which is about _illegibility_), these
> are capability-shaped: each is a surface a rival ships that this project has the plumbing for and has not
> wired.

- [ ] **Editable plan steps, with the grant scope re-derived from the edit.** The plan card today lets a user
      **remove** a step (`skipStepIds`); it does not let them **change** one, so "do step 3 on this site, not
      that one" means skipping and re-prompting. Fellou markets exactly this as its differentiator. ⚠️ **The
      security condition is not optional:** `plan-grant-scope`'s host derivation must be **recomputed from the
      edited text**, or a user edits the plan and silently widens their own grant. This is the same trap
      WebBrain names in its own docs ("edited plans with stale hidden metadata cannot authorize a send") — an
      independently verified failure mode, not a hypothetical.
- [ ] **Mode-suggestion chip — a suggestion, never an automatic switch.** Neon's Intelligent Mode (Feb 2026)
      infers intent and _recommends_ an agent; the win is removing the "which mode am I in" load. Two
      constraints make it safe here: mode is a **capability** choice (Do = action, Chat = read-only), so a
      model may never move the user into Do — the suggestion is a chip the user clicks; and the classifier runs
      on the cheap `classify` tier, never the plan/exec model. Best first real use of
      [S12](phase-s12-local-model.md)'s cheap-capability thesis: intent → `{chat|do|make|tasks}` as a single
      GBNF-constrained token on the local model.
- [ ] **Research as a named, source-cited, budgeted variant.** Neon split deep research into its own agent, at
      two speeds. Research here is implicit inside Do (`web_search` + `web_get_page`). Making it explicit costs
      **no new capability surface** — research is read-only, so it runs on Chat's permissions. What changes is
      the shape: long-running, multi-source, citation-bearing output, and a different stop condition.
      `CompletionEvidence` + the evidence chips in PR2 are exactly what makes this land better here than in a
      product that has to assert its sources. The "1-minute" variant is a user-visible budget matching
      [S7](phase-s7-speed.md)'s wall-clock target.
- [ ] **Ask across all open tabs (Chat mode, read-only).** Comet's headline context model is "every open tab is
      context." Reachable here with **no new permission** — `tab_list_items` + `browser_get_page`. ⚠️ Boundary:
      each tab's content is wrapped as untrusted **separately**, so one poisoned tab cannot speak for the
      others. Keep it Chat-only; Do already binds to a working tab on purpose.
- [ ] **A visible "the run changed site" event in the transcript.** Grants are already eTLD+1-scoped
      (`plan-grant-scope` / `remembered-grant-scope`), but a domain transition is not _shown_. Claude for
      Chrome surfaces it; it is cheap and it is honesty — the user can see the moment the run left the site
      they authorized. Pairs with the periodic domain reminder in [S1](phase-s1-foundation-native-loop.md)/[S7](phase-s7-speed.md).
- [ ] **Name the "prepared, you pay" pattern.** Comet deliberately stops at the cart and asks the user to
      authorize payment. The same line exists here as a **kernel rule** rather than a product decision
      (`financial` danger class + biometric gate + the commerce double-confirm in PR6, unbypassable at any
      autonomy level). The gap is presentational: say it as a pattern in the UI — "I got it this far; the
      payment is yours" — so users read the stop as designed rather than as a failure.
- [ ] **Split HITL into `approval` and `takeover`** — Nova Act's naming, from
      [`../../docs/research-computer-use-agents.md`](../../docs/research/research-computer-use-agents.md). _Approval_ is
      asynchronous, screenshot-bearing, multiple-choice; _takeover_ hands live control to the human and then
      returns to the agent. Handoff here today is only "stop and give it back." The durable half — resuming the
      same run once the human clears the wall — is already recorded in
      [Phase 1b](../product/phase-1b-agentic-deepening.md) L2 from a second, independent source
      ([`../tracks/browserskill-agent-parity.md`](../../docs/parities/browserskill-agent-parity.md) P2); this row is the
      surface for it.

### PR8 — Agent Console readability (LibreChat UI extraction)

> **Where this came from.** [`../../docs/others/librechat-agent-ui-learnings.md`](../../docs/versus/librechat-agent-ui-learnings.md)
> — a read of LibreChat v0.8.8-rc1's chat/agent **interface** only, not a competitive analysis. It earns its
> place for a specific reason: LibreChat is not a browser agent, so it has nothing to teach about the engine —
> but almost the whole of its v0.8.8 changelog is about the one thing this project is weakest at, **the
> readability and controllability of a long autonomous run**, solved over years and many users.
>
> The panel already has the base this builds on (plan preview, graduated autonomy + risk banner, effort
> presets, evidence chips, replay timeline, in-run `steer`, pause/resume, background continuation,
> per-tab-group session, history + search, composer attachments, commerce double-confirm, scope grants,
> Human Handoff). The rows below are **on top of that**, ordered cheapest-first exactly as that document
> ranks them. All of it lands in `extensions/ext-agent` (B1 also touches `@tepegoz/shared-types` /
> `@tepegoz/orchestrator`); none of it grows `apps/desktop`. Every new user-visible string ships EN + full TR
> in the same PR (ADR-0016).

- [ ] **A4 — Message-level actions: copy / quote / edit.** Only code blocks are copyable today; there is no
      full-message copy, no quoting a prior answer into a new turn, no editing your own message and resending.
      Pure renderer, touches no trust boundary — **the cheapest item here.** The quote chip is a natural fit:
      the composer already has a selected-text attachment path (`panel-attachments.ts`) and a quote is a
      variant of it.
- [ ] **A2 — A context-fullness gauge, distinct from the token counter.** The counter and the 80% quota
      warning measure **cost**; how full the _context window_ is is invisible. That is the real breaking point
      of a long run. The data already exists on the `cache-window` / `TokenLedger` side. Showing it answers
      "why did it suddenly summarize?" _before_ it happens — pair it with the visible compaction marker in
      [Phase 1b](../product/phase-1b-agentic-deepening.md) / `webbrain` P9-a.
- [ ] **A3 — Activity-phase grouping + a live tool-intent label.** A 40-step run is a flat
      `step_start`/`step_ok`/`step_error` list today. **Tepegöz can do this more cheaply and more honestly
      than LibreChat does:** LibreChat has the _model_ generate group headers, but the plan here is already a
      DAG — so the phase header is **derived deterministically from the plan step**, no model call,
      determinism-first intact. The live intent label ("Reading the price…" instead of `browser_get_page`)
      comes from the tool descriptor's own `description`.
- [ ] **A1 — Steer queue: pending chips + a receipt when applied.** `steer` today is one-shot — you send it,
      it joins the run, and there is no visible queue, no undo. Queue them, show pending steers as chips the
      user can **withdraw, edit or escalate**, and show a receipt once one is actually applied. This is a
      safety improvement as much as a UX one: a steer that has not reached the next model call is a steer the
      user can still take back. ⚠️ Trust boundary: steer text is **trusted user input** and a queued steer can
      never be derived from page content — the same rule `clarify` answers hold. Keep the queue in panel state
      and hand it to IPC only at the moment it applies.
- [ ] **B4 — Pin provider / model / autonomy at the top of each turn.** Today it lives in the composer's gear
      popover (which is the better control surface — keep it), but reading a run back later cannot answer
      "which model and which autonomy level was this?". The journal knows; the panel does not show it. Make it
      a persistent transcript line, not a second control.
- [ ] **B3 — Drop approval history into the transcript as a permanent card.** LibreChat renders tool approval
      inline instead of as a modal. **Do not copy that part** — the modal here is deliberately blocking, and
      the risk-class naming plus the commerce double-confirm are built on it; removing it would be a
      regression. What is missing is the _record_: once approved, the modal closes and the only trace is in
      the journal. Leave a card saying "at this step you allowed X." Shares plumbing with the pending-argument
      edit in [`../tracks/librechat-agent-parity.md`](../../docs/parities/librechat-agent-parity.md) P5.
- [ ] **B2 — Skill pills in the transcript (visibility only).** Which skill produced an answer is not shown.
      A pill makes "this reply was generated with that instruction pack" visible — the same honesty logic as
      the evidence chips. **Only the display half is in scope:** LibreChat's `automatic` / `always-on` skill
      modes are a new authority surface (they let the model decide what enters the prompt) and belong to
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P5 and
      [S9](phase-s9-memory-skills.md), not here. S9's rule — a skill can never start a run — is untouched.
- [ ] **B1 — Multi-question `clarify` (the most expensive and the most careful).** `clarify` asks one question
      per turn; allowing up to four related questions with 2–4 options each turns four round-trips into one.
      Requires a schema change (`@tepegoz/shared-types`) and its own security pass: questions are
      **model-generated**, so the question text must go through `sanitizeText` and stay outside the
      `wrapUntrustedContent` boundary — page content must never be able to ride into a question. Answers
      remain trusted user input. Narrower schema is strictly better here.

> **Deliberately not taken from LibreChat, so they are not reopened as "obvious" panel features.** Code
> Interpreter and Artifacts (model-authored code executing in the renderer — ADR-0026 measured-refuted,
> ADR-0029 DevTools user-only, and it would pierce the renderer-untrusted model); **Subagents** (isolated
> child runs with their own contexts — one run at a time is ADR-0013, and parallelism is
> [Phase 1b](../product/phase-1b-agentic-deepening.md)'s DAG; opening a second concurrency surface here would
> need a decision that supersedes ADR-0013); **Agent Plugins** (bundles that auto-load skills and MCP servers
> at startup = a pre-model authority expansion, against S9's "a skill can never start a run" and the one-PEP
> discipline); Agent Marketplace (Phase 12 + ADR-0037 SupplyChainGate, not a chat-panel feature); conversation
> sharing via stable URLs (needs cloud/account — Phase 3; local `/export` already ships); image generation
> (out of product scope); and **Langfuse observability** (third-party telemetry — the event journal here is
> local by thesis; shipping traces outward contradicts it).

### PR9 — Console affordances from the parity tracks

- [ ] **Wire interactive Ask streaming the last mile.** `ModelGateway.generateStream` / `onDelta` and the
      ADR-0025 streaming boundary already exist; what is missing is the **interactive Ask path in `ext-agent`
      actually using them end to end**, so an Ask still arrives as one block. Adopt WebBrain's own scoping
      rule as-is: stream **only** for interactive Ask — not Act/Dev, not scheduled or Continue runs — because
      buffering tool calls while streaming text is exactly the edge case that breaks. Engine-side detail in
      [S1](phase-s1-foundation-native-loop.md) PR5.
      [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P7-c.
- [ ] **Slash commands — a typed command registry, not decoration.** `/compact`, `/export`, `/schedule`,
      `/watch` are capability shortcuts that avoid a round-trip through the model just to say "compact the
      context now". Structured metadata per command (canonical signature, flags, `/help`, autocomplete), so
      the palette and the composer share one source. Complements the four-mode palette rather than replacing
      it. [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P7-a.
- [ ] **Selection quick-actions (Summarize / Explain / Quiz).** Mostly already buildable: Translate ships as
      `ext-translate`, proofreading overlaps `ext-typo`, and the selected-text attachment path
      (`panel-attachments.ts`) already exists — so this is three short prompts through an existing channel,
      not a new menu system. [`../tracks/webbrain-agent-parity.md`](../../docs/parities/webbrain-agent-parity.md) P7-b.
- [ ] **Per-step actor + rationale narration.** The live feed shows _what_ each step did, not _why_ the model
      chose it. A one-line reason per step (and which tier/actor produced it) is nanobrowser's one genuinely
      useful UX detail, and it makes the replay timeline readable after the fact.
      [`../tracks/nanobrowser-agent-parity.md`](../../docs/parities/nanobrowser-agent-parity.md) P2.
- [ ] **Let the agent ask one clarifying question instead of guessing.** When the task is ambiguous, the
      current options are guess or fail; 20 steps of confidently wrong work is the expensive outcome.
      Narrow schema on purpose (a single question, fixed intent), and the answer is trusted user input — the
      multi-question form is [PR8](#pr8--agent-console-readability-librechat-ui-extraction)'s B1, which is the
      same primitive widened. [`../tracks/notte-agent-parity.md`](../../docs/parities/notte-agent-parity.md) P3.
- [ ] **A visible, adjustable step budget.** The Reactor hard-caps a run at `maxSteps` (default 25) but the
      number is invisible and unchangeable, so a run that hits the cap looks like an unexplained stop. Surface
      it as a setting with a live "N steps left" affordance.
      [`../tracks/ui-tars-desktop-agent-parity.md`](../../docs/parities/ui-tars-desktop-agent-parity.md) P2-a.
- [ ] **Per-tool-call timing on the replay timeline.** The audit journal already timestamps every call; the
      timeline shows steps and evidence badges but no latency. One column, no new data path — and it is what
      turns "the agent felt slow" into a specific slow call.
      [`../tracks/ui-tars-desktop-agent-parity.md`](../../docs/parities/ui-tars-desktop-agent-parity.md) P2-b.

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
