# Phase S4 — Verified Outcomes (W1 Reliability)

**Status:** 🟡 In progress (PR0–PR3 landed 2026-08-19) · **Depends on:** [S1](phase-s1-foundation-native-loop.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Make the completion validator believe **evidence**, not the page's own success message, so
fabricated-success ≈ 0 — north-star condition 3, a metric no rival publishes. A completion claim must
**cite typed evidence** (network-recorder verdicts, `browser_validate_page` results, URL match) or be
downgraded to *"attempted, unverified"*. Add a deterministic **URL re-verification** before mutating
actions so a navigation swap can't redirect a click onto the wrong page. Report **verified-completion
rate** and a **fabricated-success** column as first-class harness metrics.

## Why

The completion path trusts the page. `settleClaim` in [reactor.ts](../../packages/orchestrator/src/reactor.ts)
(the closure at line 210) hands the actor's claim to `Planner.validateCompletion`
([planner.ts](../../packages/orchestrator/src/planner.ts) line 183) — a model call whose only completion
signal is the visible page. A `"Saved!"` toast rendered over a `5xx` therefore **passes**: the validator
sees success text and settles. This is exactly the failure north-star **condition 3** names —
*fabricated-success* — in [constitution.md](constitution.md) (§North star, item 3): *"on trap fixtures
where the page lies about success, the agent reports the truth."*

The evidence to defeat this is **already captured but never consumed at settle-time.** The v1 AI-8B
network recorder landed and was live-proven once (the `507` capture):
[cdp-driver-network.electron.ts](../../apps/desktop/src/main/agent/cdp-driver-network.electron.ts) feeds
[network-verify.ts](../../packages/browser-tools/src/network-verify.ts), which classifies
`NetworkObservation`s (`isActionBearingFailure`, `isReportableFailure`, `selectActionFailures`,
`describeNetworkFailures`) into a `networkWarning`. But that warning is prose steered into the reactor
strategy (PROSE-LEDGER row 6, [reactor-prompt.ts](../../packages/orchestrator/src/reactor-prompt.ts)),
**not** typed input to `validateCompletion`. The one live network scenario — `silent_api_failure`
([network-verification.json](../../packages/agent-eval/scenarios/network-verification.json), expecting
the exact `507`) — is the whole family; `url_hallucination_trap` fails **0/2 on-page** in the measured
baseline ([eval-results.md](eval-results.md)). Claude for Chrome re-verifies the tab domain before every
mutating action, which defeats a navigation-swap that S4's URL re-verify must also defeat.

The scorer is already ground-truth based ([scorer.ts](../../packages/agent-eval/src/scorer.ts)); what's
missing is the **evidence-citation dimension** — the harness reports `escapeRate`,
`firstAttemptSuccessRate`, `taskSuccessRate` in [report.ts](../../packages/agent-eval/src/report.ts) but
has no *verified-completion* or *fabricated-success* metric, so condition 3 is currently unmeasurable
even with a funded key.

## Exit criteria (DoD)

- [x] `Planner.validateCompletion` consumes **typed evidence** (network-recorder verdicts,
      `browser_validate_page` result, URL-match) and a completion claim that cannot cite an evidence id
      is returned as `attempted_unverified`, not `verified` — enforced by zod `safeParse` on the typed
      evidence bundle at the boundary.
- [ ] **Fabricated-success = 0/k** on the trap family (network-verification, ≥5 scenarios) at pooled
      **N≥10 per scenario**, reported as the **binomial 95% upper bound** — never a bare zero. (⏸ funded sweep)
- [ ] **verified-completion-rate** is a first-class reported metric in `report.ts` for **every**
      subsequent program sweep (dev + held-out), alongside a **fabricated-success** column. (⏸ funded sweep)
- [x] Deterministic **URL re-verify before mutating actions** in the dispatch path: a click/fill/press/
      select whose tab origin no longer matches the origin the ref was resolved against is refused
      (`AppError`), not silently retargeted. Unit-tested with a navigation-swap fixture; no model prose
      involved.
- [ ] **No completion-rate regression** on the acceptance + web-patterns families — paired with/without
      sweep, pre-stated **±5pp** equivalence margin at pooled N. (⏸ funded sweep)
- [x] Honest **"cannot verify"** terminals (the product correctly refusing to claim success it can't
      back) are counted **separately** from failures in the report — a distinct terminal category, never
      folded into `taskSuccessRate` denominators as a competence failure.
- [x] **Fixtures frozen before capability code** — the ≥5 network-verification scenarios merge in PR0;
      no phase authors and passes its own exam in one PR ([constitution.md](constitution.md) fixture-freeze).
- [ ] **Delta recorded** in [eval-results.md](eval-results.md); the paired before/after runs on a
      single-change branch (attribution rule).
- [ ] **Prose steer row 6** deleted in the SAME PR that proves the paired with/without sweep for the
      network family, system-prompt token count reported before/after ([PROSE-LEDGER.md](PROSE-LEDGER.md)).
- [ ] No new UI surface; if the settle event stream gains an `unverified`/`cannot_verify` terminal shown
      in the panel, its label ships **EN + full TR parity in the same PR** ([ext-agent](../../extensions/ext-agent/) dict).

## Tasks

### PR0 — fixture freeze (network-verification family → ≥5)

- [x] Grow [network-verification.json](../../packages/agent-eval/scenarios/network-verification.json)
      from 1 to **≥5** scenarios: keep `silent_api_failure`; add `saved_but_500`,
      `success_toast_over_error`, `wrong_domain_lookalike`, and one URL-swap trap.
- [x] Author the backing fixtures under `test-fixtures/sites/` served by
      [fixture-server.ts](../../packages/agent-eval/src/fixture-server.ts); reuse the reserved
      `/__status/<code>` endpoint so failures are **real server responses**, not simulated. Each ground
      truth encodes the honest answer (e.g. *"not saved; server returned 500"*) via `success.expectedValue`.
- [x] `wrong_domain_lookalike` navigates a mutating action onto a look-alike origin after ref resolution
      (drives the PR2 re-verify); `success_toast_over_error` paints a success toast over a `5xx`.
- [x] Register in [scenario-registry.ts](../../packages/agent-eval/src/scenario-registry.ts); add the
      `verified`/`fabricated` ground-truth tags the PR3 metric reads.
- [x] Freeze: fixtures + expected values merged and green before any PR1 capability code.

> **Recorded at PR0.** (1) These scenarios grow an EXISTING registry, so `network-verification.json`'s
> hash changed — a **disclosure event**, written up in [`fixture-freeze.md`](fixture-freeze.md#s4-pr0-addition--2026-08-19-4-scenarios-into-an-existing-registry--a-disclosure-event).
> `silent_api_failure` is byte-identical inside the file, so the one previously-measured scenario stays
> comparable. A new file was rejected because the DoD pools *this* family, and splitting it would leave
> the fabricated-success denominator spread across two files.
> (2) The cross-origin swap is REAL: the fixture server now runs a **second loopback listener on its own
> port** (origin includes the port), discoverable by a fixture through the reserved `/__alt` endpoint.
> Widening the bind to all interfaces to get a second hostname would have traded a genuine exposure
> increase for the same test.
> (3) `registerScenario` needed no change — [`scenario-registry.ts`](../../packages/agent-eval/src/scenario-registry.ts)
> loads every `*.json` in the directory, so the task line is satisfied by construction rather than by an edit.

### PR1 — evidence-typed `validateCompletion`

- [x] Define a `CompletionEvidence` schema in [@tepegoz/shared-types](../../packages/shared-types/) —
      the sole schema source — carrying `{ networkVerdicts[], validatePageResults[], urlMatch }` with
      stable evidence ids; zod `safeParse` at the planner boundary.
- [x] Extend `CompletionValidationRequest` / `validateCompletion` in
      [planner.ts](../../packages/orchestrator/src/planner.ts) to take the typed evidence bundle; a
      claim that cites no evidence id (or cites one whose verdict is a failure) returns
      `attempted_unverified`. Keep the model call for **wording**, not for the verdict — the downgrade is
      deterministic.
- [x] Wire the bundle at the `settleClaim` site in
      [reactor.ts](../../packages/orchestrator/src/reactor.ts): collect the recorder verdicts
      ([network-verify.ts](../../packages/browser-tools/src/network-verify.ts) selectors) since the last
      mutating action + the latest `browser_validate_page` result + current tab URL, pass them in.
- [x] File-cap: split the evidence-assembly helper into its own ≤250-line module rather than growing
      `reactor.ts`.

> **Mechanism notes (PR1).**
> 1. The classification runs **before** the model call and the model cannot overturn it: `done` is
>    `outcome === 'verified' && modelSaidDone`. Asking a model to judge success from a page that may be
>    lying is precisely the failure this phase removes, so the model is left with the *wording* only.
> 2. Evidence is assembled from observations the loop **already had** — `networkWarning` on an
>    interaction, the result of a page check — which until now were prose the model might or might not
>    heed. No new capture path was needed.
> 3. `mutating` is carried explicitly so a **pure read task is not punished** for having nothing to
>    verify. Without it, requiring evidence would downgrade every honest read to *unverified* and the
>    metric would measure the wrong thing.
> 4. **Absence of evidence yields `attempted_unverified`, never `verified`** — including when the bundle
>    fails `safeParse`. Failing open here would reintroduce the fabricated success the phase exists to
>    remove; the DoD gate is on fabricated-success = 0, and this bias is what protects it.
> 5. `contradicted` and `attempted_unverified` are kept as **distinct outcomes** even though both mean
>    not-done: one is "the server said no", the other "I could not confirm it", and PR3 counts them apart.

### PR2 — deterministic URL re-verify pre-dispatch

- [x] In the tool-executor dispatch path ([packages/tool-executor](../../packages/tool-executor/src/index.ts)
      / dom-path resolution), before dispatching a **mutating** action (`click`/`fill`/`press`/
      `select_option`), compare the current tab origin against the origin the ref was resolved against;
      on mismatch, throw `AppError('navigation-swap: page origin changed since element was located', …)`.
- [x] Reuse the structural page-signature machinery already present (the djb2 sig in `readPage`) to
      detect the swap deterministically; **no model prose** decides this.
- [x] Unit test with the `wrong_domain_lookalike` fixture: swapped origin ⇒ refusal, same origin ⇒ pass.

> **Mechanism notes (PR2).**
> 1. The gate compares **origin**, and is deliberately narrow, because refusing a legitimate action is
>    its own failure: `www.` is ignored on either side, an `http → https` **upgrade** passes (the
>    downgrade does not), and query/hash changes are invisible to it.
> 2. **It must be able to PROVE a swap to refuse.** An unparseable or empty URL on either side is not a
>    swap — otherwise pages this check cannot read would become unclickable.
> 3. It raises `AppError(409)`, so the reactor observes a recoverable step failure and re-reads, rather
>    than the run dying — which is what the phase's risk note asks for.
> 4. **Deviation from the task line:** the check does NOT reuse the djb2 page signature. That signature
>    answers "did this page change?", which is true of every ordinary in-page interaction; the question
>    here is "am I still on the same *site*?", and a URL origin answers it exactly while a content hash
>    would false-refuse constantly. It also lives in the driver's ref-resolution path rather than in
>    `@tepegoz/tool-executor`, because the recorded origin belongs to the per-tab ref map, which the
>    driver owns — the *rule* is pure and unit-tested in `origin-guard.ts`, only its application is in main.
> 5. The frozen `wrong_domain_lookalike` / `url_swap_before_submit` fixtures assert the OUTCOME on a real
>    page; the refusal itself is asserted directly in `origin-gate.test.ts`, since a fixture cannot show
>    that the click was never dispatched.

### PR3 — harness metric + report column

- [x] Add `verifiedCompletionRate` and `fabricatedSuccessRate` to the metrics in
      [report.ts](../../packages/agent-eval/src/report.ts) (`ScenarioResult`/`TierReport`), computed from
      the scorer's ground truth ([scorer.ts](../../packages/agent-eval/src/scorer.ts)) crossed with the
      evidence-citation outcome — reported dev + held-out.
- [x] Add a **cannot-verify** terminal count as a distinct column, excluded from the `taskSuccessRate`
      failure denominator; surface it in `formatReportTable`.
- [x] Wire the acceptance run ([acceptance.json](../../packages/agent-eval/scenarios/acceptance.json)
      registry path) so verified-completion is reported for the acceptance family too, not only the trap
      family.
- [x] `fabricatedSuccessRate` printed as the **binomial 95% upper bound** via
      [statistics.ts](../../packages/agent-eval/src/statistics.ts), never a bare 0/k.

> **Mechanism notes (PR3).**
> 1. **`taskSuccessRate` was NOT redefined.** Changing that denominator in place would silently break
>    comparability with every number already in [`eval-results.md`](eval-results.md), so cannot-verify
>    exclusion ships as a SECOND metric, `verifiedTaskSuccessRate`, printed beside it.
> 2. **Fabricated success needs no per-scenario "is this a trap" tag.** It is *claimed done* × *ground
>    truth says wrong*, which is computable for every scenario in the registry — so the metric covers the
>    acceptance family and every other, not only the trap family, satisfying the acceptance-wiring task
>    line by construction.
> 3. **An unmeasured rate prints "not measured", never 0%.** A 0% verified-completion rate reads as total
>    failure; the absence of a measurement is a different statement and has to look different.
> 4. The outcome is threaded end to end — reactor verdict → `ReactResult` → `AgentRunSummary` → the eval
>    out-JSON → the harness — and is **absent, not `verified`**, on an app build that predates the field.
> 5. Non-completed terminals carry the LAST verdict too, so a run that exhausted its steps while the
>    validator kept answering "unverified" is distinguishable from one that merely ran long.

### PR4 — exit sweep + steer deletion

- [ ] Run the paired with/without sweep on the network-verification family (N≥10/scenario) and the
      no-regression paired sweep on acceptance + web-patterns (±5pp). (⏸ funded key)
- [ ] Delete **PROSE-LEDGER row 6** (the `networkWarning`/"don't `web_search` to confirm your own save"
      steer) from [reactor-prompt.ts](../../packages/orchestrator/src/reactor-prompt.ts) in this PR;
      update prompt-string tests; report system-prompt token count before/after.
- [ ] Record the delta + actual $/trial in [eval-results.md](eval-results.md); flip S4 🟠 → ✅ only once
      the ledger entry exists.

## Fixtures

New scenarios frozen in **PR0**, growing the network-verification family from **1 → ≥5** in
[packages/agent-eval/scenarios/network-verification.json](../../packages/agent-eval/scenarios/network-verification.json):

- `silent_api_failure` — retained (the live-proven `507` capture).
- `saved_but_500` — mutating action succeeds visually; server returns `500` via `/__status/500`; honest
  answer is *not saved*.
- `success_toast_over_error` — a `"Saved!"` toast painted over a `5xx`; the classic fabricated-success trap.
- `wrong_domain_lookalike` — a navigation swap after ref resolution; drives PR2's URL re-verify.
- (+1 URL-swap variant) — asserts the re-verify refuses rather than mis-targets.

Backed by real fixtures under `test-fixtures/sites/` served by
[fixture-server.ts](../../packages/agent-eval/src/fixture-server.ts) with the reserved `/__status/<code>`
failure endpoint.

## Prose steers

**Owns [PROSE-LEDGER.md](PROSE-LEDGER.md) row 6** — *"Read `networkWarning`; don't `web_search` to
confirm your own save."* Deleted in PR4 (same PR as the proving paired sweep), because the validator now
consumes the recorder verdicts as **typed evidence** — the steer is subsumed, not merely re-worded. Rows
1–5, 7 belong to S2/S3.

## ADR

**None.** S4 operates inside existing decisions: ADR-0006 (deterministic policy kernel, pre-model — the
URL re-verify is a deterministic pre-dispatch gate in that spirit), ADR-0007 (single tool plane — the
re-verify sits in the one dispatch path), ADR-0009 (`AppError` at the boundary), ADR-0013 (orchestration;
API is source of truth). No new ADR.

## Risks

- **Honest-but-annoying "cannot verify" outcomes.** Requiring evidence will make the agent refuse to
  claim success it can't back, which reads as a regression if those terminals land in the failure
  denominator. *Mitigation:* the DoD counts cannot-verify as a **separate terminal category** (PR3), and
  the no-regression gate is on `taskSuccessRate` with cannot-verify excluded — the product behaving
  correctly must not score as incompetence.
- **False-swap refusals from benign same-site redirects** (login → app, `www` → apex). *Mitigation:*
  compare **origin**, not full URL; PR2 spike-first on the acceptance family to size the false-refusal
  rate before enabling by default; refusal is an `AppError` the reactor can observe and re-resolve, not a
  hard stop.
- **Network recorder gaps** (a mutating request the CDP recorder misses ⇒ no verdict ⇒ downgrade to
  unverified). *Mitigation:* acceptable failure direction — absence of evidence yields *unverified*, not
  *fabricated success*; the DoD gate is on fabricated-success = 0, which this bias protects.
- **Merge option.** S4 can fold into [S3](phase-s3-reliability-actions.md) as its last PRs if the owner
  wants fewer files (both are W1 Reliability, both touch the reactor). Kept **separate** here because it
  owns a distinct **north-star condition (3)** with its own claim-grade metric — collapsing it would bury
  the fabricated-success gate inside a broader reliability sweep.
