# Phase S11 — Benchmark & Head-to-Head (Claim)

**Status:** 🟠 Measurement-owed (PR0 + PR4 + the publish gate landed 2026-08-19; the ⏸ funded runs and the 25 human labels are open) · **Depends on:** [S3 bridge probe](phase-s3-reliability-actions.md), [S6 credential broker (ASR)](phase-s6-safety-control-plane.md), [S4 fabricated-success](phase-s4-verified-outcomes.md), [S9 repeat speedup](phase-s9-memory-skills.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Produce the dated, external, falsifiable evidence that turns the four north-star conditions of the [constitution](constitution.md) into published numbers — win or lose. Build an Online-Mind2Web-style live-web bridge (a frozen `realUrl` stratum) and run a pre-registered head-to-head against the shipping rivals. Nothing here is a scripted-fixture score: every deliverable is a live-web run scored on verified-completion (S4's metric) with a Wilson CI, plus a claim template that is withdrawn the instant it fails to reproduce.

## Why

**Zero of the four claim conditions has a number.** [eval-results.md](eval-results.md) records only 5/52 scenarios ever measured live; the Anthropic DoD sweep is N=3. The owner's explicit demand ([real-results, no vanity](../../CLAUDE.md)) is that offline scripted evals do not prove competence — a scripted-fixture pass is a regression fence, not a claim. Today `grep realUrl` over [packages/agent-eval](../../packages/agent-eval) returns **0** scenarios: there is no live-web stratum at all, so no claim can even be phrased.

**Online-Mind2Web is the live benchmark that matters.** It is the harness the field reads. The reference points: **≥84%** verified-completion is bare-model parity with Opus 4.8 (i.e. tepegoz must beat "just call the model"); **≥90%** is leaderboard-credible. But **judge variance dominates leaderboards** — the headline `bu-max` 97% and `GPT-5.4` 93% numbers were **not scored by the same judge**, so cross-report deltas are noise. This is why the claim protocol below insists on one blind judge over identity-stripped artifacts, and why the [Never-list](constitution.md) forbids vendor-self-report anchoring and auto-judge headlines.

**Our judge is not yet claim-grade.** [judge.ts](../../packages/agent-eval/src/judge.ts) is claim-barred by [calibration.ts](../../packages/agent-eval/src/calibration.ts) at **1/25** human labels — judge↔human agreement is computed against `calibration/human-labels.json`, and one label cannot establish agreement. A published benchmark number scored by an uncalibrated judge would be exactly the auto-judge headline the Never-list bans. So calibration to ≥25 labels is a hard precondition of any run, not a nicety.

**v2's escape-gate priority was wrong.** The Anthropic N=3 sweep showed escape rate **0%** — the failures are on-page (wrong or incomplete answers), not the agent wandering off task. So the bridge stratum is scored on verified-completion, and `realUrl` tasks are **excluded from the escape denominator** ([escape-metric.ts](../../packages/agent-eval/src/escape-metric.ts)) — escape is not the axis this phase measures.

**The rivals ship now.** Claude for Chrome, Comet, and ChatGPT agentic browsing are moving targets. The only defence against "they improved after you measured" is the dated-artifact + freshness-date discipline: **Version 1 is published even if tepegoz loses**, and it is stamped with the week it ran and the rival build strings.

## Exit criteria (DoD)

- [x] A `realUrl` bridge stratum of **~30 live-web tasks** (Online-Mind2Web style), **≥10 Turkish-web**, is authored, rubric'd, and **frozen in PR0 before any capability or run code** (constitution: fixtures frozen first). (⏸ funded sweep to _score_ it; authoring itself is not funding-blocked.)
- [ ] Bridge **verified-completion with a Wilson CI is PUBLISHED** in [eval-results.md](eval-results.md). Honest first-run target: **CI lower bound ≥60%** — _the number itself is the deliverable, not a threshold to defend._ (⏸ funded sweep)
- [ ] The judge reaches **≥25 human labels** in `calibration/human-labels.json` and the **judge↔human agreement rate is reported** alongside every bridge/H2H number. Below 25, no run is publishable. (precondition; label authoring not funding-blocked)
- [ ] **All four north-star conditions have a dated number** in [eval-results.md](eval-results.md), win or lose (⏸ funded sweep + rival subscriptions):
  - live-web verified-completion (this phase's bridge run);
  - ASR / credential-broker success ([S6](phase-s6-safety-control-plane.md));
  - fabricated-success rate ([S4](phase-s4-verified-outcomes.md));
  - repeat-task speedup ([S9](phase-s9-memory-skills.md)).
- [x] A **pre-registered H2H protocol artifact** exists (task list + rubric + scoring plan) committed **before** any H2H run, with a **ToS-considerations section** for driving rival products.
- [ ] An H2H run executes **same-week** on tepegoz + Claude for Chrome + Comet + ChatGPT agentic browsing at **N≥3 each**, **blind-scored from identity-stripped artifacts** on verified-completion, and lands as a **dated artifact** in [eval-results.md](eval-results.md) stamped with rival build strings. (⏸ funded sweep + subscriptions)
- [x] The **4-condition claim template with the withdrawal clause** is committed (the claim is withdrawn the moment it fails to reproduce).
- [ ] **PROSE-LEDGER final audit line:** every row in [PROSE-LEDGER.md](PROSE-LEDGER.md) is either DELETED or justified-RETAINED, each paired with/without-sweep per the constitution rule for prose deletion.
- [x] Bridge/H2H run harness reuses the existing [Wilson CI + family pooling](../../packages/agent-eval/src/statistics.ts) and cost accounting ([TEPEGOZ_EVAL_RATES](../../packages/agent-eval)); no new stats path. Any UI surface added is EN+full-TR parity in the same PR.

## Tasks

### PR0 — fixture freeze (bridge subset + rubrics)

- [x] Add a `realUrl` scenario kind to the agent-eval registry schema in [packages/agent-eval](../../packages/agent-eval) via [@tepegoz/shared-types](../../packages/shared-types) — zod `safeParse` at load; `realUrl: string`, `rubric`, `turkishWeb: boolean`, `stratum: "bridge"`. No inline duplicate types.
- [x] Author **~30 tasks** in an `online-mind2web-bridge` registry file (Online-Mind2Web style: multi-step, real sites, answer-or-action outcomes), **≥10 Turkish-web** (e.g. e-devlet-style public info, Turkish retail, TR news). Each carries a **verified-completion rubric** (S4 metric), not a scripted assertion.
- [x] Wire the stratum into [escape-metric.ts](../../packages/agent-eval/src/escape-metric.ts) as **excluded from the escape denominator**; into [statistics.ts](../../packages/agent-eval/src/statistics.ts) family pooling as its own family `bridge`.
- [x] Freeze: record the fixture hash + count in [PROSE-LEDGER.md](PROSE-LEDGER.md) / [history.md](history.md) as the pre-run baseline. Split registry file(s) to stay under the 250-line cap.
- [x] **No run in PR0** — authoring + freeze only, so the numbers can never be reverse-fit to the fixtures.

### PR1 — bridge harness plumbing

- [ ] Extend the real-app driver [agent-eval-runner.electron.ts](../../packages/agent-eval) to accept `realUrl` scenarios: navigate via the readiness barrier (`navigateWhenReady`), honour `TEPEGOZ_EVAL=1`, and route outcome through [scorer.ts](../../packages/agent-eval/src/scorer.ts) → [judge.ts](../../packages/agent-eval/src/judge.ts) on verified-completion.
- [ ] Ensure `isTransportInvalid` / `isDeadKeyError` / UNMEASURED classification (just landed on branch) applies to bridge trials so a dead key aborts the sweep rather than scoring 0.
- [ ] Emit per-task cost via `TEPEGOZ_EVAL_RATES`; respect `TEPEGOZ_EVAL_STRICT`.

### PR2 — judge calibration to ≥25 labels

- [ ] Grow `calibration/human-labels.json` to **≥25 human labels** spanning the bridge stratum (incl. Turkish-web tasks) — hand-labelled verified-completion truth.
- [x] [calibration.ts](../../packages/agent-eval/src/calibration.ts): report judge↔human **agreement rate** and keep the claim-bar gate; a run below 25 labels stays claim-barred.
- [ ] Record the agreement rate in [eval-results.md](eval-results.md) as a standing field printed next to every bridge/H2H number.

### PR3 — bridge run + ledger entry (⏸ funded)

- [ ] Run the frozen `realUrl` stratum on the DoD (Anthropic) tier with a funded key; N per task per the [statistics.ts](../../packages/agent-eval/src/statistics.ts) flaky/Wilson policy.
- [ ] Publish **verified-completion + Wilson CI** (whole stratum and Turkish-web sub-stratum separately) into [eval-results.md](eval-results.md), dated, with the judge agreement rate.
- [ ] Ledger the delta in [history.md](history.md); mark this DoD line ✅ only once the funded sweep is in. Until then this PR rests at 🟠 measurement-owed.

### PR4 — H2H protocol (pre-registered artifact)

- [x] Write `phases/ai-agent/h2h-protocol.md`: the **pre-registered task list** (a named subset of the frozen bridge tasks), rivals (Claude for Chrome, Comet, ChatGPT agentic browsing), **N≥3 each**, **same-week** execution window, blind identity-stripped artifact capture, verified-completion scoring by the calibrated judge.
- [x] Include the **4-condition claim template** with the **withdrawal clause** ("the claim is withdrawn the moment it fails to reproduce") and the **freshness-date** requirement (stamp the week + rival build strings).
- [x] Include a **ToS-considerations section** for driving rival products (automation/account-terms flags; the Amazon v. Perplexity injunction noted as a live legal constraint on agentic commerce driving).
- [x] Commit the protocol **before** any H2H run so scoring cannot be reverse-fit.

### PR5 — H2H execution + dated artifact (⏸ funded + subscriptions)

- [ ] Execute the pre-registered protocol same-week across all four agents (funded tepegoz key + rival subscriptions).
- [ ] Capture identity-stripped artifacts (screenshots/transcripts with product identity removed); blind-score verified-completion via the calibrated judge.
- [ ] Publish the **dated H2H artifact** into [eval-results.md](eval-results.md) — **Version 1 ships win or lose**, stamped with the week and rival build strings.
- [ ] Fill the remaining north-star numbers (pull ASR from [S6](phase-s6-safety-control-plane.md), fabricated-success from [S4](phase-s4-verified-outcomes.md), speedup from [S9](phase-s9-memory-skills.md)) into the single 4-condition line.
- [ ] **Final PROSE-LEDGER audit**: walk every row in [PROSE-LEDGER.md](PROSE-LEDGER.md), DELETE or justify-RETAIN each with paired with/without-sweep evidence.

> **Mechanism notes (PR0, PR2-gate, PR4).**
>
> 1. **The escape-denominator exclusion already existed.** `FamilyRow.escapeEligible` in
>    [statistics.ts](../../packages/agent-eval/src/statistics.ts) is false for a `realUrl` target, and
>    family pooling is tag-based, so `bridge` is a family without a code change. Nothing was added
>    where something already worked — the PR0 line is satisfied by the existing shape, not by new code.
> 2. **The publish gate is code, not a rule.** `bridgeClaim` returns `publishable: false` with stated
>    blockers below 25 human labels, or when agreement was never computed for the run, or on an empty
>    stratum. A calibration file can exist and overlap a run in zero scenarios — that is not
>    calibration either, and it is a separate blocker for that reason.
> 3. **The first-run target is judged on the Wilson lower bound**, and missing it does **not** block
>    publication. Version 1 ships win or lose; that commitment is what removes the incentive to tune
>    fixtures toward a headline, and there is a test asserting a bad number still publishes.
> 4. **`stratum` is a typed field, not another tag.** A scripted-fixture pass is a regression fence and
>    a bridge pass is evidence; conflating them is how a repo talks itself into an unearned claim.
> 5. **The Turkish-web advantage is declared in advance.** Four of the twelve H2H tasks are Turkish-web
>    — the stratum rivals are least likely to have tuned for. Stating that in the pre-registered
>    protocol is the difference between a disclosed choice and a rigged one.

**Not done, and why.**

- **The 25 human calibration labels are not authored.** They are, by definition, _human_ judgements of
  real run artifacts — and there are no run artifacts, because scoring the stratum needs a funded key.
  Manufacturing labels for runs that never happened would be the exact fabrication this phase exists to
  prevent. The gate that blocks publication below 25 is built and tested; the labels are owed.
- **PR1 harness plumbing is partially pre-existing and partially owed.** `realUrl` was already in the
  target union and the runner already navigates; what is not verified is the end-to-end path on a live
  URL, because verifying it means running it.
- **No run of any kind.** PR3 and PR5 are ⏸ funded, and PR5 additionally needs rival subscriptions.

### PR6 — Failure-mode stratum from documented rival complaints (fixture work; freeze with PR0)

> **Where this came from.** Six rival user-feedback studies —
> [Atlas](../../docs/research/imported/competitors/atlas.md),
> [Fellou](../../docs/research/imported/competitors/fellou.md),
> [Comet](../../docs/research/imported/competitors/perplexity-comet.md),
> [Opera Neon](../../docs/research/imported/competitors/opera-neon.md), and the two Claude-extension
> studies ([A](../../docs/research/imported/competitors/claude-extension-chatgpt.md),
> [B](../../docs/research/imported/competitors/claude-extension-gemini.md)).
>
> **Why this belongs in the benchmark and not in a marketing page.** The H2H currently samples general web
> tasks, which measures the average case. What every one of these reports supplies is the **specific case each
> rival is documented to fail** — and a comparison built out of those is both more informative and more
> defensible than a generic task list, because the failure was reported by that product's own users, not
> chosen by us. It also cuts the other way, which is the point: if Tepegöz fails the same task, the artifact
> says so.
>
> **Scope discipline.** These become a **named, pre-registered stratum reported separately** — never folded
> into the headline verified-completion number, because a set selected for rival weakness is not a fair
> estimate of general competence. Pre-register the stratum in [h2h-protocol.md](h2h-protocol.md) **before**
> any run, under the same withdrawal clause as the main claim.

- [ ] **Author the `rival-failure-mode` stratum** (~10 tasks, frozen with PR0), each task tracing to the report
      and the complaint that motivated it: - **Dynamic-SPA execution loop** — a page whose DOM rewrites under the agent (Fellou's execution loops,
      Atlas's white screens, iMacros' rigid positioning). Verifies stale-reference recovery. - **CAPTCHA / human-verification wall** — the run must hand off cleanly and resume, not stall silently
      (Fellou's CAPTCHA deadlock; never auto-solve). - **Long multi-step task with a mid-run interruption** — sleep/restart, then resume (Neon's top complaint;
      Atlas's "Thinking" hang). - **Repeated-action loop bait** — a page that invites the same click forever (Comet's looping). - **Wrong-account / wrong-profile trap** — two logged-in identities present, only one correct (the
      Claude extension's most-reported operational failure). - **Focus-and-tab hygiene** — background work must not steal focus and must clean up the tabs it opened. - **Time-paradox task** — one a human finishes in under a minute, timed against the manual baseline from
      [S7](phase-s7-speed.md) (Comet's agentic sluggishness). - **Turkish-web task inside this stratum** — non-English keyboard/IME plus a Turkish-language flow
      (Atlas rates non-English input a P0 blocker; this project ships a Turkish IME matrix).
- [ ] **Score it separately and publish it whole** — per-task pass/fail per agent, in the dated artifact,
      **including the tasks Tepegöz fails**. A stratum published only when it flatters us is worth nothing.
- [ ] **Cite the complaint, not the conclusion.** Each row links the underlying report so a reader can check
      that the task encodes a documented user complaint rather than a strawman built to lose.
- [ ] **Add a scenario type where the target state is derived from the prompt, not hand-written.** OpenAI's
      own computer-use sample validates against a _goal state_ computed from the request — e.g. "reprioritize
      this sprint" checked against the resulting board, a drawing checked against canvas state, a booking
      checked against a local confirmation record — rather than against a fixed expected string. Fixtures here
      are mostly assertion-shaped; a goal-state type raises the bar on stateful, multi-step tasks where the
      correct end state depends on the input. Sits on the existing `scorer.ts` ground-truth path and S4's
      `CompletionEvidence`, not a new harness.
- [ ] **Run one scenario down two execution paths against one validation pipeline.** The same sample runs each
      lab in a `native` mode (the model drives actions directly) and a `code` mode (the model scripts the
      browser), scored identically — which turns "did the model do it" and "was the task possible" into two
      separately-readable answers. The `code` half is **not** transferable (`execute_js` was measured and
      refuted — ADR-0026; DevTools stays user-only — ADR-0029), but the _shape_ maps onto a split this harness
      already has: **scripted tier vs live tier**. Scoring both through one pipeline makes a live-tier failure
      attributable — model error, or an impossible fixture.
      [`../../docs/research-computer-use-agents.md`](../../docs/research/research-computer-use-agents.md).

### PR7 — Harness additions from the parity tracks

- [ ] **A deterministic, model-free tool-conformance smoke corpus.** Every registered tool called with valid
      and with deliberately invalid arguments, asserting the schema rejects what it should and the error
      envelope is the typed one — **no model, no network, runs in CI on every PR**. This is the cheap gate
      that catches a tool whose schema drifted from its handler, which no model-driven eval will reliably
      surface. Adopts BrowserSkill's "unverified is never silently passed" discipline in the one place it is
      free. [`../tracks/browserskill-agent-parity.md`](../../docs/parities/browserskill-agent-parity.md) P5.
- [ ] **Structured, multi-field ground-truth assertions.** Scenario expectations are largely single-value
      today; letting one scenario assert several named fields at once (each pass/fail reported separately)
      turns "the task failed" into "three of four fields were right and the price was stale", which is the
      difference between a score and a diagnosis.
      [`../tracks/openai-cua-sample-agent-parity.md`](../../docs/parities/openai-cua-sample-agent-parity.md) P2.

## Fixtures

New, all frozen in **PR0**, added to [packages/agent-eval](../../packages/agent-eval) as the `bridge` family / `realUrl` stratum:

- `online-mind2web-bridge` registry — **~30 live-web tasks**, Online-Mind2Web style, each with a verified-completion rubric.
- **≥10 Turkish-web** tasks within that set, scored as a named sub-stratum.
- The pre-registered **H2H subset** is a named selection of these same frozen tasks (no new tasks authored for the H2H — reuse guarantees the comparison and the bridge measure the same thing).
- ≥25 human calibration labels in `calibration/human-labels.json` (PR2) covering the stratum.
- `realUrl` tasks are excluded from the escape denominator; they form their own Wilson/family-pooling family.

## Prose steers

- Owns the **final [PROSE-LEDGER.md](PROSE-LEDGER.md) audit** (DoD): the program-closing pass where every remaining row is DELETED or justified-RETAINED, each with paired with/without-sweep evidence.
- No new speculative prose is introduced by this phase; the H2H protocol and claim template are pre-registered artifacts, not steers.

## ADR

None. This phase adds no architectural decision — it consumes the existing eval, judge, and stats substrate and produces external evidence. (New ADRs, if any arose from sibling phases, continue from 0025; this one claims none.)

## Risks

- **Rivals drift under us.** Mitigation: dated-artifact + freshness-date discipline (PR4/PR5) — every artifact stamps its week and the rival build strings, and **Version 1 is published even if tepegoz loses**. The claim template's withdrawal clause makes staleness self-correcting.
- **Judge variance dominates the number.** Mitigation: single calibrated judge over identity-stripped artifacts (≥25 labels, agreement rate reported); the Never-list ban on auto-judge headlines and vendor-self-report anchoring is enforced by refusing to publish below the calibration bar.
- **ToS / legal exposure from driving rival products.** Mitigation: the protocol's ToS-considerations section flags account/automation terms per rival; the Amazon v. Perplexity injunction is recorded as a live legal constraint on any commerce-driving H2H task. Spike-first: a manual ToS read of each rival precedes PR5.
- **Funding gate.** Bridge scoring (PR3), H2H execution (PR5), and rival subscriptions are all ⏸ awaiting a funded key + subscriptions. Code + frozen fixtures + protocol land regardless; the phase rests at 🟠 measurement-owed until the funded sweeps run and the deltas are in [eval-results.md](eval-results.md).
- **Reverse-fitting the number.** Mitigation: PR0 freezes fixtures and PR4 pre-registers the H2H before any run; the honest first-run bridge target (CI lower bound ≥60%) is stated as a deliverable, not a threshold to defend, so there is no incentive to tune fixtures toward a headline.
