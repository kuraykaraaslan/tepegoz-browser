# Phase 6 — Deterministic Replayable Automation (RecipeCompiler)

**Status:** ⬜ Not started  ·  **Estimate:** ~3–4 months  ·  **Depends on:** Phase 1b (Effect Ledger, durable
handoff, SkillRuntime) + Phase 1a (perception/Journal/Loop Detector)
**Goal:** Fold a successful run — OR a human demonstration — into a parameterized, **model-free**, signed,
**replayable recipe** that re-runs with ZERO model calls and **re-passes the Policy Kernel on every run**.
This is the single biggest net-new surface and tepegöz's clearest differentiator: every competitor re-invokes
the LLM each run (slow, costly, injection-prone, abandonment-prone), uniquely enabled here by event-sourcing +
Effect Ledger + perception-observation events. Narrative: **"Demonstrate once, run forever, nearly free."**
**Branch examples:** `feat/recipe-compiler`, `feat/automation-watchers`, `feat/automation-scheduler`, `feat/palette-macros`

## Exit criteria (DoD)
- [ ] A successful agentic task is **distilled into a recipe** that re-runs end-to-end with **0 model calls**;
      on selector miss it self-heals (one scoped replan) and re-distills
- [ ] A **human-recorded demonstration** ("Record Automation") produces an equivalent deterministic recipe
- [ ] Re-running a recipe **re-passes the Policy Kernel** for every step (recipe carries NO escalated trust);
      state-changing/destructive/financial steps still force HITL; structural drift halts before any side-effect
- [ ] **Ambient Watcher** survives sleep/restart and fires a deterministic check on schedule with ~0 tokens
- [ ] **Scheduler** runs a recipe unattended under the sealed "restricted unattended trust profile"; any
      HITL-needing step pauses + notifies (never auto-approves); failed precondition = fail-closed skip
- [ ] **i18n:** en+tr keys added for new surfaces (My Automations panel, Record Automation, Watcher cards,
      Scheduler settings, palette macro authoring, replay-diff viewer)
- [ ] ADRs accepted: **ADR-0012** (RecipeCompiler & deterministic-replay trust model), **ADR-0013**
      (restricted unattended trust profile)
- [ ] Red-team: a stale/poisoned recipe cannot perform a side-effect without re-passing Policy Kernel + HITL
- [ ] Coverage gate (S80/B70/F80/L80) + self-review/code-review + UAT signoff + migration-safe DB

## Tasks

### L1/L4/L5 — RecipeCompiler (the core)
- [ ] Distill a `TaskSucceeded` event-chain (by `correlationId`) into an ordered recipe IR: tool calls + their
      `idempotencyKey`s + the **actual** DOM/a11y selectors from L4 observation events + page-stability waits +
      typed **variable slots** for values that varied; store as content-addressed `cas://` blobs referencing
      journal LSNs; zod schema for the recipe IR (trust boundary)
- [ ] Second front-end: passive **CDP "Record Automation"** captures a manual demonstration into the same IR;
      recorder runs Logger-grade redaction + respects sensitive-site lockout (no capture on bank/health/etc.)
- [ ] Re-run executor: deterministic CDP steps with **no model**; invoke the model ONLY on selector miss /
      assertion fail → one scoped replan → re-distill the fixed step
- [ ] **My Automations** panel (KUIreact): list/inspect/run/edit/delete recipes + replay-diff (what changed
      vs. the recorded golden trace); every run journaled as events
- [ ] *Risk mitigation (ADR-0012):* recipes carry NO escalated trust; every step re-passes Policy Kernel at run
      time; a11y-signature structural-drift check halts before any side-effect; captured tainted values forced
      to variables (never inlined as constants)

### L3/L4 — Self-correcting golden assertions (verified-done, not vibe-done)
- [ ] Recipes/plans carry **deterministic post-conditions** captured at distill time (expected a11y node, URL
      pattern, a `journal_*` effect, an extracted numeric)
- [ ] After each node, evaluate assertions **without a model**; on failure run the bounded ladder:
      re-stabilize + idempotent retry → re-perceive/re-bind selector → ONE scoped model replan → graceful stop
      to HITL showing the **exact failing predicate**
- [ ] Adds a **success oracle** on top of the existing Loop Detector (directly fixes competitors' universal
      "did it actually work?" / penultimate-step-abandonment failure)
- [ ] Assertions **tiered**: hard for side-effect steps, soft for cosmetic; failures journaled with the
      predicate so users can relax them

### L2/L3 — Ambient Watchers (condition-trigger automations)
- [ ] "Watch this" affordance on any page/element → save a deterministic **CHECK recipe** (selector +
      extraction + schedule) that re-runs locally on a timer and **diffs the value token-free**
- [ ] A model call fires only to summarize a meaningful change OR when the recipe breaks (then HITL to re-teach)
- [ ] The expensive **ACT recipe** fires only on condition-true under the restricted unattended profile, then
      re-arms; state persists as journal events → a Watcher survives sleep/restart for days (Phase 1b resume)
- [ ] Surfaces as **new-tab dashboard cards** + native notifications
- [ ] *Risk:* adaptive backoff + per-site min-interval; checks are read-class only; fail-closed if login/VPN
      precondition unmet; sensitive/financial sites force HITL each run

### L2/L8 — AutomationScheduler + "restricted unattended trust profile"
- [ ] Local cron-like scheduler (persisted as journal events; survives restart via existing resume machinery)
      fires recipes in a headless background context
- [ ] Scheduled runs execute a **sealed one-way narrowing** of the user's Policy IR: ONLY read + pre-approved
      idempotent state-changes whitelisted at authoring time may run unattended
- [ ] Any step needing HITL **PAUSES**, journals a `HitlRequested`, pushes a local notification, and resumes on
      next approval — **never auto-approves**; precondition failing (VPN down / not logged in) = fail-closed
      skip, never silent degrade
- [ ] *Risk (ADR-0013):* the unattended profile is always a strict subset of the interactive profile;
      per-run journaled audit the user reviews; this is the highest-agency surface — deny-by-default

### L5/L9 — Command-Palette Macros / Personal Web API
- [ ] "Save as command" extracts the deterministic tool-call skeleton, parameterizes variable inputs into a
      named palette command (e.g. `/expense-report {month}`), registers it in SkillRegistry
- [ ] The same artifact is auto-exposed through **tepegöz-as-MCP-server** as a typed local tool
      (`acme_export_invoice(month)`) — your personal web as your personal API; callable by any LLM/script/other
      tepegöz instance, every call re-passing the Policy Kernel
- [ ] Shareable as **signed Skills** (SKILL.md); redact captured values; force variables for tainted inputs

### Cross-cutting (as in every phase)
- [ ] i18n en+tr for all new surfaces; zod `safeParse` at every IPC/recipe-IR/MCP trust boundary; AppError
      contract; renderer-untrusted security; determinism-first; DoD coverage gate; **NO AI attribution trailer**
