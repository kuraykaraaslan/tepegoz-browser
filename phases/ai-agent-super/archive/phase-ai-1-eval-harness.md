# Phase AI-1 — Real-Result Eval Loop

**Status:** 🟡 In progress (PR1 backbone + PR2 live-tier/judge/nightly-CI code landed; **e2e `pnpm eval` now
runs green on-harness** — scripted tier PASS against the real app after fixing two launch blockers, commit
`e9f7fee`; the live-tier competence numbers are the remaining owed measurement) ·  **Depends on:** Phase 1a
·  **Track:** [`phases/ai`](README.md)

> **PR1 backbone:** `@tepegoz/agent-eval` (data-driven zod registry loader, local fixture server,
> ground-truth scorer, honest metrics report), the `runAgent` provider-injection seam, the
> `ScriptedProvider`, `test-fixtures/sites/*` hard-case fixtures, the env-gated app batch-eval runner, and
> the `_electron` Playwright driver + `pnpm eval` wiring.
> **PR2:** the real-cloud-model **live tier** (`TEPEGOZ_EVAL_MODE=live`, provider from an env key), the
> **LLM-judge** (`judge.ts`) + **calibration** (`calibration.ts` + `human-labels.json`), and the
> **nightly non-blocking CI** (`.github/workflows/eval-nightly.yml`). Every unit-testable part is green;
> the end-to-end `pnpm eval` run happens in the Electron-ABI env (like `pnpm e2e`), not the Node-ABI test
> session.
> **PR3 (on-harness green, commit `e9f7fee`):** the e2e `pnpm eval` now drives the real app to completion.
> Two launch blockers had kept it from ever running — the real reason the e2e run stayed "pending": (1) the
> harness inherited `ELECTRON_RUN_AS_NODE` (agent/CI shells set it), so Playwright started electron.exe as
> plain Node — no `app` object, `require('electron')` a path string — and the app threw at startup
> (Playwright surfaced only "Process failed to launch"); the harness now strips it from the launch env like
> `pnpm dev` does. (2) it launched the built entry file `out/main/index.js`, so `app.getAppPath()` resolved
> to `out/main/` and every `getAppPath()`-relative resource read (the extension catalog) missed → "Failed to
> read extension catalog"; the harness now launches the `apps/desktop` **directory** so Electron resolves
> the entry via `package.json "main"` and `getAppPath()` stays `apps/desktop`. Scripted tier passes green
> (`blog_behind_menu`, task-success 100%) against the real BrowserHost + ToolGateway/Policy plane + scorer.
> **Owed:** the live-tier competence run (real product model over the full **23-scenario** registry —
> `real-failures`(3) + `perception`(5) + `acceptance`(6) + `web-patterns`(9)) — the environment is proven;
> it needs a provider API key.
**Goal:** A repeatable, **honest** way to measure the agent's real competence, so every later change is
justified by a pass-rate delta on the **real product model** against **real / representative pages** — not
by a green offline test. This is the measurement backbone the rest of the track is scored against.

## Why (the anti-vanity contract)

Today the only agent evals are the offline `acceptance-eval.ts` scenarios driven by a `ScriptedProvider`:
useful for **loop plumbing / regression**, but the "pass" is tautological because we script the model's
decisions. That is **not** evidence the agent can do a task. This phase adds the missing tier: a real model
driving real pages with ground-truth scoring, plus a **held-out** set so fixes can't be overfit to the eval.

## Exit criteria (DoD)
- [x] `pnpm eval` runs the **full agent** (`runAgent`) with the **real product model** against a scenario set and emits an `AcceptanceMetrics`-shaped report (task-success-rate, per-scenario pass/fail, tokens, N, threshold) plus a machine-readable JSON artifact. _(Live tier: `TEPEGOZ_EVAL_MODE=live` injects the real provider from an env key over the full registry; scripted tier for no-key runs. Report + JSON artifact via `buildReport`/`writeReport`. End-to-end run happens in the Electron-ABI env.)_
- [x] Scenarios are a **data-driven, zod-validated registry** (not a hard-coded tuple); a new scenario is one JSON entry. _(`EvalScenarioSchema` in `@tepegoz/shared-types`; `loadScenarios` safeParses `packages/agent-eval/scenarios/*.json`.)_
- [x] Two target types work: **local HTML fixtures** (deterministic regression) and **real-site** scenarios (honest competence), each tagged; a **held-out** subset is reported separately and never used during development. _(Both `target` shapes in the schema; `test-fixtures/sites/*`; live driver navigates `realUrl` targets; `heldOut` split reported separately in `buildReport`.)_
- [x] Scoring is **ground-truth first** (DOM/value assertion) with an **optional LLM-judge** for open-ended tasks; the judge is calibrated against a small human-labelled sample and its agreement rate is recorded. _(`scoreScenario` (ground-truth) → `judgeScenario` (secondary); `agreementRate` over `calibration/human-labels.json`, recorded in the report.)_
- [x] CI: offline/scripted tier stays in `turbo run test` (blocking regression); the live tier runs **out-of-band** (nightly / manual `pnpm eval`), budget-bounded, with pass-rate **trend** surfaced (a drop warns, does not silently pass). _(`.github/workflows/eval-nightly.yml`: schedule + dispatch, `continue-on-error`, uploads the JSON artifact, `::warning::` on a below-threshold pass rate.)_
- [x] **i18n:** no new user-facing strings expected; if any, en+tr in the owning package dict. _(None added — harness is dev-only; the app runner logs are not UI strings.)_
- [ ] Coverage + self-review + migration-safe (no DB schema change expected). _(No DB change; unit tiers green. Coverage gate + self-review PR pending.)_

## Tasks

### Scenario model (data-driven)
- [x] `EvalScenario` zod schema: `{ id, task, target: { fixture: string } | { realUrl: string }, success: { domAssertion?, expectedValue?, judgeRubric? }, heldOut: boolean, tags: string[] }`; loaded + `safeParse`d at run time. Reuse `@tepegoz/shared-types` where a shape already exists. _(`packages/shared-types/src/eval-scenario.ts`.)_
- [x] Seed the registry with the real failures observed to date (view-less-newtab navigation, blog-behind-a-menu, blog-not-linked-from-landing) plus the existing 5 acceptance scenarios re-expressed in the new shape. _(`packages/agent-eval/scenarios/{real-failures,acceptance}.json`; the recovery/handoff acceptance behaviors stay in the offline `acceptance-eval` tier — they test agent internals, not page competence.)_
- [x] Evolve `ACCEPTANCE_SCENARIO_IDS` (hard-coded tuple in `packages/orchestrator/src/acceptance-eval.ts`) into the loaded registry (keep `recordFromOutcomes` / `summarizeAcceptanceRuns` / `AcceptanceMetrics`). _(Widened `scenarioId` to `string`; helpers + metrics contract unchanged; registry now drives the id set.)_

### Local fixture server (deterministic real pages)
- [x] `test-fixtures/sites/` static HTML pages that reproduce the hard cases: hamburger/drawer nav, blog-behind-nav, infinite-scroll list, native `<select>`, occluding modal, multi-tab flow.
- [x] A tiny static server (`http.createServer`) the harness points the agent at; no cloud dependency for the page. _(`packages/agent-eval/src/fixture-server.ts`.)_

### Full-loop harness
- [x] **Provider-injection seam on `runAgent`** (`packages/agent-runtime/src/agent-runtime.ts`): today it self-resolves the provider from vault/prefs and calls `ModelGateway.register` internally. Add an optional `deps.provider` so the harness can inject the real cloud model, a `LocalProvider` (GGUF) for cheap smoke, or a scripted provider — without going through the vault. _(`deps.provider?: { id, instance }`; `registerRunProvider` bypasses the vault when present. `ScriptedProvider` added to `@tepegoz/model-gateway`.)_
- [x] Register a real `BrowserHost` (or a headless CDP host over the fixture pages) via `registerBrowserTools({ host })`; reuse the `fakeHost` pattern only for offline plumbing tests. _(Chose max fidelity: the `_electron` driver launches the REAL app; the env-gated `agent-eval-runner.electron.ts` drives the run over the real `browserHost` + Policy plane.)_
- [x] Per scenario: run to completion (bounded steps + token budget), then score: DOM/value assertion primary; LLM-judge secondary; record an `AcceptanceRunRecord`; aggregate to `AcceptanceMetrics`. _(Driver + `scoreScenario` (ground-truth) + `recordFromOutcomes` + `buildReport`. LLM-judge secondary = PR2.)_
- [x] Honest reporting: emit the full pass/fail list, the held-out metric separately, the model id + N + threshold; **no cherry-picking**. A scenario the agent gets wrong MUST show as a fail (the eval's job is to be able to fail). _(`buildReport` / `formatReportTable` / `writeReport`; scorer returns a fail for a missing assertion and defers judge-only scenarios as a fail.)_

### CI / cadence
- [x] Offline scripted acceptance stays in `turbo run test` (blocking). _(Unchanged — `acceptance-eval.test.ts` + all new unit tiers stay in `turbo run test`.)_
- [x] `pnpm eval` script + a nightly workflow (non-blocking) that stores the metrics artifact and warns on a pass-rate regression trend. _(`pnpm eval` + `playwright.eval.config.ts` + `_electron` driver; `.github/workflows/eval-nightly.yml` uploads the artifact + `::warning::` on regression.)_

## Non-goals / scope notes
- No agent-behaviour change lands in this phase — it only measures. (AI-2/AI-3/AI-4 are scored *by* it.)
- The live tier is deliberately **out of the blocking gate** (cost + real-web flakiness); its signal is the
  trend + the before/after delta on a change, not a hard CI pass.
- Prefer the real product model for the headline metric; a weak local model "passing" is a false signal.

## Audited gaps (external review, 2026-07) — eval rigor

The 2026-07 suggestion audit found the backbone real and wired, but the **measurement is thin**: a single
run per scenario, point estimates only, no wall-clock, and two metrics defined-but-dead in the live path.
These make a "pass" less trustworthy than the anti-vanity contract demands. Each is a checkbox here; none
changes agent behaviour (still measurement-only). The **first live run**
([`eval-results-2026-07.md`](../eval-results-2026-07.md)) already showed why these matter — N=1 sampling noise
flipped several scenarios PASS↔FAIL (its finding #3, corroborating `s02`).

- [x] **`s02` — repeated trials (≥3× per scenario) — LANDED** (`ac53932`). `TEPEGOZ_EVAL_REPEAT=N` (clamped
      [1,10], default 1 for fast regression) runs each scenario N times and folds the trials into one result:
      **majority verdict** for pass/fail, a per-scenario **k/N pass-frequency** table, **mean per-trial
      pass-rate** (dev + held-out), tokens summed for honest cost. A one-off pass is no longer accepted as
      the headline. **Remaining:** aggregate **step-count** across trials, and **wall-clock duration** —
      still unmeasured (see `s26`); and actually *run* it at N≥3 for the defensible headline the live-run doc
      still owes.
- [ ] **`s26` — the missing metrics.** Of the eight the audit implies: task-success + token-count are
      done+live; `toolErrorRate`/`navigationValidationFailureRate` are real-but-proxy "wrong-click" signals;
      **absent entirely:** wall-clock **duration** (nothing measures it — not `AgentRunSummary`,
      `StepOutcome`, nor `AcceptanceRunRecord`), **first-attempt success** (needs `s02`), **average action
      count** (`toolCalls` is recorded but only as the denominator of `toolErrorRate`), and **dollar cost**
      ("cost" today is token counts, no price-per-token). **Defined-but-dead in the live path:**
      `recoverySuccessRate` (the 23-scenario registry triggers no `requiresRecovery`, so it's vacuously 1)
      and the **human-intervention rate** (the eval auto-approves every HITL gate, so `approvalCount`=0).
      Add a duration field end-to-end; wire recovery/intervention counts from real runs; report avg-actions,
      first-attempt, and a currency estimate.
- [ ] **`s27` — flaky detection + confidence intervals.** The `s02` repeat feature now surfaces a
      per-scenario **k/N pass-frequency** — a real flaky *signal* (a `2/3` is visibly flaky) and the
      prerequisite this needed. Still missing: a **confidence interval** beside the headline rate, and a
      **cause classifier** (site-induced vs agent-induced variance). (The only `confidence` in code is the
      LLM-judge's per-verdict self-report, not a statistical interval.) Real-web flakiness is still only
      *acknowledged* as the reason the live tier is non-blocking, not quantified.
- [ ] **`s03` — fixture coverage holes.** The set is genuinely broad (22 fixtures: form/login/cookie/modal/
      pagination/table/iframe/shadow-dom/accordion/dynamic/two-dropdown-designs), but a **file-download**
      fixture is entirely missing and there is **no deliberately malformed / broken-HTML / conflicting-selector**
      stress fixture (every page is well-formed). Add both.
- [ ] **`s28` — a real adversarial set** (see [AI-5](phase-ai-5-content-security.md)): today only the
      `prompt-injection` fixture + `link-href` (same-name controls) are genuine traps. Missing: fake
      "Download" ad/bait, a scroll-hide menu, a hidden decoy/honeypot, and an *asserted* disabled-control
      trap. The security **plane** is well tested by `redteam.test.ts`, but with hand-built strings — the
      **agent** has not been run against the injection fixture on-harness.
