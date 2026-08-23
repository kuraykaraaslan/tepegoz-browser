# Phase S7 — Speed (W3 Speed)

**Status:** 🟠 Measurement-owed (PR1–PR4 landed 2026-08-19; only the ⏸ funded PR5 sweep is open) · **Depends on:** [S1](phase-s1-foundation-native-loop.md) (native + streaming), [S2](phase-s2-perception-v2.md) (perception economy) · **Track:** [AI Agent Super](README.md)

**Goal:** Set explicit wall-clock/task and $/task targets for the agent — the first such targets in the repo — and hit them by cutting forced round-trips and per-step token burn, without trading away reliability. Speed is won by eliminating waste (redundant validation passes, invisible-tab realism delays, verbose decision encodings), not by dropping steps or corners. Every contributing change lands as its own single-change sweep so its speed win and its reliability cost are attributed independently, with completion-rate equivalence as the standing guardrail. This phase owns the `$`/wall-clock half of north-star condition 4.

## Why

**No wall-clock or `$`/task target exists anywhere in the repo today.** There is a cost accounting seam (`TEPEGOZ_EVAL_RATES`, [statistics.ts](../../packages/agent-eval/src/statistics.ts)) and the harness records per-trial `$` and wall-clock, but nothing pre-registers a _budget_ the agent must hit. [S0](phase-s0-truth-and-repair.md)'s full-registry baseline produces the first honest per-family `$`/trial and wall-clock/trial numbers; this phase turns those into pre-registered targets and closes the gap. Until S0's numbers land, this phase has no targets — PR1 is blocked on them by construction.

The known burn sources, each cited:

- **Forced periodic validation.** [reactor.ts](../../packages/orchestrator/src/reactor.ts) validates on a fixed `planningInterval = 3` modulo — the planner runs a full validation pass every third action regardless of whether page state changed. On a run of read-only or no-op-ish steps this spends planner tokens (and a round-trip) with nothing new to judge. The completion authority itself ([planner.ts](../../packages/orchestrator/src/planner.ts) `settleClaim`) is correct; the _cadence_ is naïve.
- **Full re-perception each step** — fixed by [S2](phase-s2-perception-v2.md) (diff/dedupe + compact serialization). S7 does not re-solve perception; it measures the token delta S2 delivers and folds it into the `$`/task target, and depends on S2 landing first.
- **Non-streaming latency** — every step _feels_ slow because messages only appear on step completion (no token streaming; [reactor-decision.ts](../../packages/orchestrator/src/reactor-decision.ts) is non-streaming, JSON-in-text). Fixed by [S1](phase-s1-foundation-native-loop.md). S7 depends on S1 for perceived latency and for native mode (a prerequisite of quick-mode encoding, below).
- **Human-realism delays.** The [human-input adapter](../../packages/human-input/src/adapter.ts) applies Catmull-Rom mouse motion, per-char typing (60±25ms) and inter-action idle (~600±150ms). It is documented as active-tab only — background tabs teleport — but this is **unaudited against every delay site**. Any realism delay that fires while the tab is not visible is pure wall-clock waste no human ever sees. S7 audits [adapter.ts](../../packages/human-input/src/adapter.ts) / [math.ts](../../packages/human-input/src/math.ts) so every delay is gated on visibility, mirroring the existing teleport for background tabs.

**Two external techniques, ported not adopted** (per [history.md](history.md)): Claude for Chrome's _quick mode_ emits compact single-letter commands the client parses, cutting latency and output tokens — only meaningful **after S1's native mode** (a per-provider decision encoding, paired sweep). browser-use's TSV traces cut prompt tokens ~40% by dropping JSON framing.

**The mechanism, grounded in what already exists:** replace the fixed modulo with **adaptive validation cadence** in [reactor.ts](../../packages/orchestrator/src/reactor.ts) — validate on the existing structural page-signature change (the djb2 sig computed in [browser-host.electron.ts](../../apps/desktop/src/main/agent/browser-host.electron.ts) `readPage`) and at explicit claim points, rather than every third action. Route micro-decisions through the **existing** [model-router.ts](../../packages/model-gateway/src/model-router.ts) (`SIMPLE_CAPABILITIES` → classify tier, already local-offload eligible) rather than plan tier. No new orchestration substrate.

**Reliability is the constraint, not a nice-to-have.** The measured DoD-model reality ([eval-results.md](eval-results.md)) is that failures are **on-page** (wrong/incomplete answer), not escape — so speed cuts must not remove a validation pass that was catching an on-page error. The guardrail is a completion-rate **equivalence** margin on the pooled family, not "didn't obviously break."

## Exit criteria (DoD)

Targets are **derived from S0's baseline** and **pre-registered in PR1 before any capability code** (constitution: fixture/target freeze before capability code). All measurement items await a funded key.

- [x] **Targets pre-registered.** PR1 commits explicit numeric p50 wall-clock/task and `$`/task targets for the **acceptance family**, derived from S0's baseline, _before_ PR2 code lands. The target-setting PR carries the baseline numbers it derives from (no floating targets).
- [ ] **Wall-clock:** p50 wall-clock/task on the acceptance family reduced **≥40%** vs the S0 baseline (⏸ funded sweep) — this is program gate **G7**.
- [ ] **Cost:** `$`/task on the acceptance family reduced **≥30%** vs the S0 baseline (⏸ funded sweep).
- [ ] **Reliability guardrail:** verified-completion rate stays **equivalent** — within **±5pp** on the pooled family, **N≥10** family-pooled paired sweep with Wilson 95% CIs and a pre-stated equivalence margin (not CI-overlap eyeballing) (⏸ funded sweep).
- [x] **Attribution rule honoured:** each contributing change (adaptive cadence; visibility-gated realism; quick-mode encoding) lands its **own single-change branch and sweep**, so its speed win and its reliability delta are attributed independently — never one blended before/after (constitution: attribution).
- [ ] **Quick-mode is per-provider and reversible:** the compact encoding is behind a per-provider flag defaulting off for any provider where its paired sweep does not show equivalence; the weaker-provider guard is a committed test, not a prose note (⏸ funded sweep per provider enabled).
- [ ] **Ledger:** every delta above recorded in [eval-results.md](eval-results.md) with tier, N, exclusion accounting (transport-invalid / dead-key / UNMEASURED per [constitution.md](constitution.md)), `$`/trial and wall-clock/trial actuals.
- [x] **No reliability substrate touched blindly:** the adaptive-cadence change preserves every claim-point validation ([planner.ts](../../packages/orchestrator/src/planner.ts) `settleClaim` still fires on completion claims); the sweep proves no on-page error class regressed.
- [x] **i18n:** any user-visible speed/cost surface (e.g. a per-run `$`/wall-clock readout) ships EN + full TR parity in the same PR. If no UI surface is added, this line is explicitly N/A in the PR.

## Tasks

### PR1 — target-setting doc PR (no capability code)

- [x] Read S0's acceptance-family baseline from [eval-results.md](eval-results.md); record the p50 wall-clock/trial and `$`/trial actuals this phase derives from.
- [x] Pre-register the numeric targets (≥40% wall-clock, ≥30% `$`, ±5pp equivalence) as a frozen block in this doc's DoD and in [eval-results.md](eval-results.md) as the phase's stated detectable effect.
- [x] Blocked-on note: PR2+ may not merge until this block is filled from real S0 numbers (guards against floating targets).
- [x] No code, no fixtures — pure pre-registration.

### PR2 — adaptive validation cadence (Lane A, reactor)

- [x] In [reactor.ts](../../packages/orchestrator/src/reactor.ts), replace the fixed `planningInterval = 3` modulo trigger with a signal-driven trigger: validate when the structural page signature (djb2 from [browser-host.electron.ts](../../apps/desktop/src/main/agent/browser-host.electron.ts) `readPage`) changes since the last validation, **or** at an explicit completion-claim point (preserve `settleClaim` in [planner.ts](../../packages/orchestrator/src/planner.ts)).
- [x] Keep an upper bound so validation still fires at least every N actions even under a stuck signature (safety net against a hung validator cadence); reuse existing `noProgressThreshold`/`maxReplans` semantics, do not add new budgets.
- [x] Deterministic: no model call decides the cadence — it is a signal comparison. Unit test the trigger table (sig-unchanged read-only run → fewer validations; sig-change → validate; claim → validate).
- [x] File-cap aware: extract the cadence decision into a small pure helper (e.g. `should-validate.ts` in orchestrator) if [reactor.ts](../../packages/orchestrator/src/reactor.ts) approaches 250 lines; keep it side-effect free for testability.

### PR3 — visibility-gated realism audit (Lane A/C, human-input)

- [x] Audit every delay/motion site in [adapter.ts](../../packages/human-input/src/adapter.ts) and [math.ts](../../packages/human-input/src/math.ts): mouse-path duration, per-char typing idle, inter-action idle.
- [x] Ensure each is **skipped** (zero-delay / teleport) when the acting tab is not visible, mirroring the existing background-tab teleport. Route the visibility signal from the same source the adapter already uses for the active/background distinction — do not add a new IPC.
- [x] Regression test: a scripted invisible-tab run incurs no realism idle; a visible-tab run is unchanged (motion + idle preserved for the human-input DoD from the memory rule).
- [x] No behaviour change on the visible path — this is strictly waste elimination on the invisible path.

### PR4 — quick-mode compact decision encoding (Lane A, post-S1)

- [x] Behind a **per-provider flag** (extend the provider capability map in [models.ts](../../packages/model-gateway/src/models.ts) / router config in [model-router.ts](../../packages/model-gateway/src/model-router.ts)), add a compact decision encoding for native mode (S1) — a TSV/single-token command form parsed back into the canonical decision shape, cutting output tokens.
- [x] Decode at the reactor boundary into the existing decision type (reuse [reactor-decision.ts](../../packages/orchestrator/src/reactor-decision.ts) coercion + zod `safeParse`; the compact form is a wire encoding, the internal type is unchanged — shared-types stays the sole schema source).
- [ ] **NOT DONE, deliberately.** Route eligible micro-decisions to the classify tier via `SIMPLE_CAPABILITIES` in [model-router.ts](../../packages/model-gateway/src/model-router.ts) (already local-offload eligible) — no new routing concept.
      **Why not:** the reactor makes exactly one model call per turn, and it is _the_ decision. There is no
      second, genuinely micro call to reroute, so the only way to satisfy this line would be a heuristic that
      guesses which decisions are simple enough for a weaker model. A step misjudged as simple is a wrong
      action, which is this phase's goal statement inverted ("speed is won by eliminating waste, not by
      dropping steps or corners"). Left open rather than satisfied cheaply.
- [x] Flag defaults **off**; a provider is enabled only after its own paired sweep shows equivalence (weaker-provider guard). Committed test asserts the flag gates the encoding per provider.

> **Mechanism + deviation notes (PR1–PR4).**
>
> 1. **The missing baseline is a mechanical guard, not a note.** PR1 could not be completed as written —
>    it derives its numbers from S0’s sweep, which needs a funded key. Rather than leave the "PR2+ may
>    not merge until this block is filled" sentence as the only protection, `speed-targets.ts` makes it
>    impossible to obtain a verdict without a real baseline: `speedVerdict` requires one, every branch
>    lacking it returns `unmeasured`, and `meetsSpeedGate` treats `unmeasured` as a non-pass. A partial
>    baseline does not half-pass. **The ordering rule is still deviated from** — PR2–PR4 landed with the
>    baseline empty — and that is stated here rather than implied by the ticked boxes.
> 2. **The cadence can only ever validate LESS often than the old modulo.** The floor is pinned to the
>    old fixed interval, so the churn case the Risks section wanted measured on a fixture is impossible
>    by construction instead: worst case is today’s behaviour, best case is the ceiling. That is a
>    stronger guarantee than the spike would have produced, and it is a committed test.
> 3. **Claim-point validation is untouched.** `settleClaim` never went through the periodic path; the
>    planner remains the sole terminator. The ceiling still forces a pass on a frozen page.
> 4. **Visibility gating drops the sleep, never an event.** Every delay serves either the human (pacing)
>    or the page (a detection surface). Off-screen only the first is absent, so the event stream is
>    byte-for-byte identical — asserted, not intended. The honest cost: inter-event _timing_ is itself a
>    weak detection signal, so an invisible run is marginally more machine-like than a visible one (still
>    far more human-like than the existing background-tab teleport).
> 5. **Quick mode ships off for every provider.** The enable list is data (`TEPEGOZ_QUICK_MODE`), not a
>    code edit, and a provider with it off sees a **byte-identical** system prompt to today’s — so the
>    "system-prompt token count unchanged by this phase" line in Prose steers holds as shipped.
> 6. **Placement:** the parked-window registry moved to `apps/desktop/src/main/window-parked.ts`.
>    `window.ts` reads Electron’s `app` at import time, so importing it for one boolean pulled the whole
>    main graph into an unrelated unit test. `isParkedToTray` is re-exported; no caller changed.

### PR5 — exit sweep (⏸ funded)

- [ ] Run each of PR2 / PR3 / PR4 as a **separate single-change** paired before/after on the acceptance family, N≥10 pooled, Wilson CIs, with the `$` + wall-clock columns.
- [ ] Confirm ≥40% wall-clock, ≥30% `$`, ±5pp completion equivalence; record per-change attribution in [eval-results.md](eval-results.md).
- [ ] Update the [README](README.md) budget table with the measured `$`/trial actuals; flip S7 🟠 → ✅ only when the ledger entry lands.

### PR6 — Rival-evidence cost + resource work (Comet · Claude for Chrome · Fellou · Atlas)

> **Where this came from.** [Comet](../../research/competitors/perplexity-comet.md)
> (high CPU, battery drain, crash/freeze loops, "agentic sluggishness" — a task the user could have done
> faster by hand), the Claude-extension studies
> ([A](../../research/competitors/claude-extension-chatgpt.md),
> [B](../../research/competitors/claude-extension-gemini.md)) — where **Base64 screenshots
> accumulating in context** are named as the mechanism behind token blow-up and slowdown —
> [Fellou](../../research/competitors/fellou.md) (linear step-by-step execution;
> dependency-aware parallelism as the fix), and [Atlas](../../research/competitors/atlas.md)
> (white screens and high RAM on dynamic sites).
>
> Two of these this phase's existing PRs already target (decision encoding, validation cadence). The rest is
> below, and one of them is a **decision this project has not made**: which work is allowed to leave the device
> at all.

- [ ] **Context eviction policy, written down and enforced.** Keep the last one or two observations at full
      fidelity and replace older ones with a short placeholder, so a long run's prompt does not grow
      monotonically. Screenshots are the acute case, but the rule is general and belongs in the runtime, not in
      [S10](phase-s10-vision-escalation.md) — vision only makes the existing defect expensive.
- [ ] **Hybrid routing decision (needs an ADR).** Which classes of work run on the **local** model by default —
      summarize, classify, redact, extract — with the cloud reserved for planning and hard inference. The
      local-inference package already exists; what does not exist is a routing policy, and Comet's report is a
      full account of what happens when every keystroke of work goes to a server: latency, battery, and a
      privacy surface nobody asked for. **Local-first is this project's claim; routing is where it is either
      true or marketing.**
- [ ] **Idle cost is zero.** No polling, no held sockets, no CDP attachment, no wake-ups while no run is
      active — measured as CPU% and wake-ups per minute on an idle window, not asserted.
- [ ] **Resource accounting per run** — peak RSS and CPU-seconds attributed to an agent run and visible next to
      its token cost, so "the agent made my browser slow" becomes a number instead of an argument.
- [ ] **Dependency-aware parallelism** stays owned by [Phase 1b](../product/phase-1b-agentic-deepening.md)
      (parallel DAG) — recorded here only so the speed phase does not claim a win that another phase must
      deliver.
- [ ] **The honest comparison metric.** Comet's sharpest complaint is not latency but the **time paradox**:
      the agent finishing slower than a human doing it manually. Add a manual-baseline column to the acceptance
      family — wall-clock for a human on the same scenario — and report agent time against it. A speed number
      with no human baseline cannot answer the only question a user is actually asking.

## Fixtures

**None new.** S7 is measured on the **existing** families with the cost + wall-clock columns already emitted by the harness — chiefly the **acceptance** family (the headline metric's home), plus the pooled families used by the equivalence guardrail. No fixture freeze PR of its own beyond PR1's target pre-registration (which plays the fixture-freeze role: the exam numbers are frozen before capability code). If S0's baseline re-cuts family membership, S7 inherits that cut — it does not define its own scenarios.

## Prose steers

**None owned.** S7 deletes no [PROSE-LEDGER](PROSE-LEDGER.md) row. Row 4 (the escape "last resort" steer) is co-listed to S7 in the ledger, but its deletion is gated on an **on-page competence** sweep owned by [S3](phase-s3-reliability-actions.md), not on a speed sweep — S7 does not touch it. S7's changes are mechanism (cadence, delay gating, wire encoding), not strategy prose, so the system-prompt token count is unchanged by this phase (report it before/after in PR5 to confirm no drift).

## ADR

**None.** S7 works entirely within existing substrates — adaptive cadence stays inside [reactor.ts](../../packages/orchestrator/src/reactor.ts) (ADR-0013 orchestration unchanged; serialized execution unchanged), micro-routing reuses the existing router (ADR-0005 provider-agnostic gateway), and quick-mode is a per-provider wire encoding under S1's native mode (no new tool plane, ADR-0007 intact). No policy-kernel change (ADR-0006 untouched). If PR4's compact encoding turns out to need a documented per-provider capability contract beyond a flag, that is an amendment to S1's ADR-0025, not a new ADR here.

## Risks

- **Speed-vs-reliability tradeoff (primary).** Cutting a validation pass could let an on-page error through — exactly the measured failure mode. _Mitigation:_ the ±5pp pooled-family equivalence margin is a **blocking** guardrail, not advisory; claim-point validation (`settleClaim`) is preserved unconditionally; the adaptive trigger keeps an upper-bound floor so validation cannot be starved.
- **Attribution blur.** Landing cadence + realism + quick-mode together would make a speed win un-attributable to a reliability cost. _Mitigation:_ the attribution rule is a DoD line — three separate single-change sweeps.
- **Quick-mode degrades weaker providers.** A compact encoding a strong model parses cleanly may confuse a weaker or local model, silently lowering completion. _Mitigation:_ per-provider flag defaulting off; each provider enabled only behind its own equivalence sweep; committed gate test.
- **Adaptive cadence spikes cost on churny pages.** A page whose signature changes every step (animations, live tickers) could trigger validation _more_ often than the fixed modulo. _Spike-first:_ PR2 begins with a short measurement spike on a churn fixture to confirm the trigger + upper-bound floor nets a reduction, not a regression, before the full change lands.
- **Visibility signal wrong.** If the visibility source the adapter reads is stale, a delay could be skipped on a genuinely visible tab (breaking human-realism) or kept on an invisible one (no speed win). _Mitigation:_ PR3 reuses the exact signal that already drives the background-tab teleport — no new source — and tests both paths.
