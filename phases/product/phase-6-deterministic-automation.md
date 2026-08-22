# Phase 6 — Deterministic Replayable Automation (RecipeCompiler)

**Status:** 🟡 In progress (Recipe IR + success oracle + unattended-profile decision layer landed 2026-08-20) · **Estimate:** ~3–4 months · **Depends on:** Phase 1b (Effect Ledger, durable
handoff, SkillRuntime) + Phase 1a (perception/Journal/Loop Detector)
**Goal:** Fold a successful run — OR a human demonstration — into a parameterized, **model-free**, signed,
**replayable recipe** that re-runs with ZERO model calls and **re-passes the Policy Kernel on every run**.
This is the single biggest net-new surface and tepegöz's clearest differentiator: every competitor re-invokes
the LLM each run (slow, costly, injection-prone, abandonment-prone), uniquely enabled here by event-sourcing +
Effect Ledger + perception-observation events. Narrative: **"Demonstrate once, run forever, nearly free."**
**Branch examples:** `feat/recipe-compiler`, `feat/automation-watchers`, `feat/automation-scheduler`, `feat/palette-macros`

> **Down-payment shipped (`feat/ext-macros`, ADR-0021).** A deterministic, no-code macro extension
> (`@tepegoz/ext-macros`) already realizes the human-recorded **Record → Replay** slice of this phase
> **model-free**: a `@tepegoz/macro-engine` interpreter (control flow, unlimited variables/arrays, CSV
> `forEachRow` with restart, a safe sandboxed expression language, located errors) driven over a CDP
> **robust multi-selector engine** with auto-wait (`macro-cdp.ts`), a CDP recorder (`macro-recorder.ts`),
> `MacroStore` (migration v5), and streamed run progress. It also lands the **agent-controllable
> extension standard** ([ADR-0021](../../docs/adr/0021-agent-controllable-extensions.md)): the macro tools
> (`macros_*`) + meta `extension_*` tools register into the single CapabilityRegistry behind the
> ToolGateway PEP. Remaining for this phase proper: run→recipe **distillation** from a `TaskSucceeded`
> chain, self-healing selectors (one scoped model replan), Watchers, the Scheduler, and the restricted
> unattended trust profile.

## Exit criteria (DoD)

- [ ] A successful agentic task is **distilled into a recipe** that re-runs end-to-end with **0 model calls**;
      on selector miss it self-heals (one scoped replan) and re-distills — not started (the IR the distiller would emit into is landed; the distiller itself is not)
- [ ] A **human-recorded demonstration** ("Record Automation") produces an equivalent deterministic recipe
- [x] Re-running a recipe **re-passes the Policy Kernel** for every step (recipe carries NO escalated trust);
      state-changing/destructive/financial steps still force HITL; structural drift halts before any side-effect
      _(the DESIGN requirement is asserted in [ADR-0031](../../docs/adr/0031-recipe-compiler-trust-model.md) and enforced by the existing kernel; not re-verified against a live recipe executor, because none exists yet. structural drift halting is the assertion-evaluator + assertion-gate: [assertion-evaluator.ts](../../packages/recipe-compiler/src/assertion-evaluator.ts) + [assertion-gate.ts](../../packages/recipe-compiler/src/assertion-gate.ts), 16 tests.)_
- [ ] **Ambient Watcher** survives sleep/restart and fires a deterministic check on schedule with ~0 tokens
- [ ] **Scheduler** runs a recipe unattended under the sealed "restricted unattended trust profile"; any
      HITL-needing step pauses + notifies (never auto-approves); failed precondition = fail-closed skip
- [ ] **i18n:** en+tr keys added for new surfaces (My Automations panel, Record Automation, Watcher cards,
      Scheduler settings, palette macro authoring, replay-diff viewer)
- [x] ADRs accepted: **ADR-0012** (RecipeCompiler & deterministic-replay trust model), **ADR-0013**
      (restricted unattended trust profile)
      _(land as [ADR-0031](../../docs/adr/0031-recipe-compiler-trust-model.md) and [ADR-0032](../../docs/adr/0032-restricted-unattended-trust-profile.md) — both numbers were already claimed before this phase document was written; see each ADR's numbering note.)_
- [ ] Red-team: a stale/poisoned recipe cannot perform a side-effect without re-passing Policy Kernel + HITL
- [ ] Coverage gate (S80/B85/F86/L80) + self-review/code-review + UAT signoff + migration-safe DB

> **What actually runs today (2026-08-20).** The Recipe IR schema, the referential-integrity checks over
> it, the model-free assertion evaluator, the hard/soft gate, and the unattended-profile narrowing
> function are all real and tested (37 tests across `@tepegoz/shared-types` and
> `@tepegoz/recipe-compiler`). **Nothing produces or consumes a real recipe.** There is no distiller (no
> code reads a `TaskSucceeded` chain and emits a `Recipe`), no CDP recording front-end, no re-run
> executor, no scheduler, and no UI. A `Recipe` value exists only in this session's test fixtures.

## Tasks

### L1/L4/L5 — RecipeCompiler (the core)

- [~] Distill a `TaskSucceeded` event-chain (by `correlationId`) into an ordered recipe IR: tool calls + their
  `idempotencyKey`s + the **actual** DOM/a11y selectors from L4 observation events + page-stability waits +
  typed **variable slots** for values that varied; store as content-addressed `cas://` blobs referencing
  journal LSNs; zod schema for the recipe IR (trust boundary)
  _(landed: the zod IR schema — [recipe-ir.ts](../../packages/shared-types/src/recipe-ir.ts) — plus
  `variableRefsIn`/`undeclaredVariableRefs`/`unusedVariables`, the referential-integrity checks over it,
  11 tests. **Not started:** the distiller that actually reads a `TaskSucceeded` chain and emits an IR
  instance — nothing produces a real `Recipe` from a real run yet.)_
- [ ] Second front-end: passive **CDP "Record Automation"** captures a manual demonstration into the same IR;
      recorder runs Logger-grade redaction + respects sensitive-site lockout (no capture on bank/health/etc.)
- [ ] Re-run executor: deterministic CDP steps with **no model**; invoke the model ONLY on selector miss /
      assertion fail → one scoped replan → re-distill the fixed step — not started
- [ ] **My Automations** panel (KUIreact): list/inspect/run/edit/delete recipes + replay-diff (what changed
      vs. the recorded golden trace); every run journaled as events
- [ ] _Risk mitigation (ADR-0012):_ recipes carry NO escalated trust; every step re-passes Policy Kernel at run
      time; a11y-signature structural-drift check halts before any side-effect; captured tainted values forced
      to variables (never inlined as constants)

### L3/L4 — Self-correcting golden assertions (verified-done, not vibe-done)

- [x] Foundation primitive shipped: `browser_validate_page` can wait for target-tab load, read URL/title/page text,
      and check expected text after navigation/page actions. Full recipe assertions below still remain Phase 6 work.
- [x] Recipes/plans carry **deterministic post-conditions** captured at distill time (expected a11y node, URL
      pattern, a `journal_*` effect, an extracted numeric)
      _(landed as `RecipeAssertionSchema`'s four kinds in [recipe-ir.ts](../../packages/shared-types/src/recipe-ir.ts): `url_pattern`, `text_present`, `effect_journaled`, `numeric_extracted`.)_
- [~] After each node, evaluate assertions **without a model**; on failure run the bounded ladder:
  re-stabilize + idempotent retry → re-perceive/re-bind selector → ONE scoped model replan → graceful stop
  to HITL showing the **exact failing predicate**
  _(landed: `evaluateAssertion` — the model-free evaluation itself, exhaustive over the four kinds, 12
  tests. **Owed:** every rung of the bounded ladder except the last — `shouldHaltOnFailure` halts
  immediately on a hard-tier failure today (a strict subset of the intended behaviour, stated as such
  in [ADR-0031](../../docs/adr/0031-recipe-compiler-trust-model.md), never a wider one) rather than
  re-stabilizing, re-binding, or attempting the one scoped replan first.)_
- [ ] Adds a **success oracle** on top of the existing Loop Detector (directly fixes competitors' universal
      "did it actually work?" / penultimate-step-abandonment failure)
- [x] Assertions **tiered**: hard for side-effect steps, soft for cosmetic; failures journaled with the
      predicate so users can relax them
      _(landed: `AssertionTierSchema` (`hard`/`soft`) + `shouldHaltOnFailure`, 4 tests, defaulting an unmarked assertion to `hard`. **Not done:** journaling the predicate — no journal call exists here yet.)_

### L2/L3 — Ambient Watchers (condition-trigger automations)

- [ ] "Watch this" affordance on any page/element → save a deterministic **CHECK recipe** (selector +
      extraction + schedule) that re-runs locally on a timer and **diffs the value token-free**
- [ ] A model call fires only to summarize a meaningful change OR when the recipe breaks (then HITL to re-teach)
- [ ] The expensive **ACT recipe** fires only on condition-true under the restricted unattended profile, then
      re-arms; state persists as journal events → a Watcher survives sleep/restart for days (Phase 1b resume)
- [ ] Surfaces as **new-tab dashboard cards** + native notifications
- [ ] _Risk:_ adaptive backoff + per-site min-interval; checks are read-class only; fail-closed if login/VPN
      precondition unmet; sensitive/financial sites force HITL each run

### L2/L8 — AutomationScheduler + "restricted unattended trust profile"

- [ ] Local cron-like scheduler (persisted as journal events; survives restart via existing resume machinery)
      fires recipes in a headless background context — not started
- [x] Scheduled runs execute a **sealed one-way narrowing** of the user's Policy IR: ONLY read + pre-approved
      idempotent state-changes whitelisted at authoring time may run unattended
      _(landed: `mayRunUnattended` + `narrowToUnattended` — [unattended-profile.ts](../../packages/recipe-compiler/src/unattended-profile.ts), 10 tests, including a direct assertion that the narrowed set is always a subset of the interactive ceiling.)_
- [ ] Any step needing HITL **PAUSES**, journals a `HitlRequested`, pushes a local notification, and resumes on
      next approval — **never auto-approves**; precondition failing (VPN down / not logged in) = fail-closed
      skip, never silent degrade — not started; `mayRunUnattended` supplies the yes/no this depends on, nothing acts on a `false` verdict yet
- [ ] _Risk (ADR-0013):_ the unattended profile is always a strict subset of the interactive profile;
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
