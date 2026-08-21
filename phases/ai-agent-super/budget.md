# The Measurement Budget

**Owner decision, 2026-08-21: the eval budget is $50 of API spend.** Not $2,500–8,000, and explicitly
**API, not subscriptions** — the owner's words. This document replaces the
[Budget section](README.md#budget--eval-spend) of the program README and is binding on every S-phase sweep.

It exists because the README's budget table was **wrong by roughly an order of magnitude**, and that
wrong number is what kept thirteen phases sitting 🟠 measurement-owed. Correcting it is worth more than
the plan built on top of it.

**What $50 buys: two phases close at the real DoD tier — [S0](phase-s0-truth-and-repair.md) and
[S3](phase-s3-reliability-actions.md) — the program's first two ✅, with no constitution amendment
needed.**

## 1. The correction — what the sweeps actually cost

The README priced the program at **$2,500–8,000** and the S0 full-registry baseline at **$150–500**.
Those were order-of-magnitude guesses written before anyone multiplied real token counts by real prices.

**Measured token counts** (v2 ledger, [`eval-results-2026-07.md`](eval-results-2026-07.md)):

| Trial shape                                                          | Tokens    | Source                          |
| -------------------------------------------------------------------- | --------- | ------------------------------- |
| Clean pass (`native_select_country`, after the `select_option` fix)  | **13.8k** | ledger, `select_option` finding |
| Flailing (same scenario before the fix — Tab/scroll/screenshot loop) | **110k**  | same finding                    |
| Escape into `max_steps` (`escape_bait`)                              | **224k**  | ledger row, worst observed      |

`maxSteps` is 25 ([`executor.ts:90`](../../packages/orchestrator/src/executor.ts#L90)) and input dominates
by roughly 10:1 — the page state is re-sent every step, the output is one small tool call. Working
estimate: **~50k tokens/trial, ~92% input**, deliberately on the conservative side of the clean-pass
figure because the transient-state collapse (§2) keeps long runs from growing linearly.

**Current first-party prices** (per 1M tokens; the repo deliberately refuses to bake these into code —
see `TEPEGOZ_EVAL_RATES` in [`harness-config.ts`](../../packages/agent-eval/src/harness-config.ts#L40)):

| Model                               | In  | Out |
| ----------------------------------- | --- | --- |
| `claude-opus-4-8` (the plan tier)   | $5  | $25 |
| `claude-sonnet-4-6` (the exec tier) | $3  | $15 |
| `claude-haiku-4-5`                  | $1  | $5  |

Prompt caching: cache **write** ≈ 1.25×, cache **read** ≈ **0.1×**; default TTL 5 min, `ttl: "1h"` option.

### $/trial at 50k tokens

The DoD tier is a **mix**: the planner runs on opus-4-8, the executor on sonnet-4-6, and most steps are
executor decisions — roughly an 20/80 token split.

| Tier                                              |    $/trial |        $50 buys |
| ------------------------------------------------- | ---------: | --------------: |
| **DoD default (plan opus-4-8 + exec sonnet-4-6)** | **~$0.22** |     ~225 trials |
| DoD default **+ prompt caching**                  | **~$0.19** | **~260 trials** |
| All-sonnet-4-6 + caching                          |     ~$0.15 |     ~330 trials |
| All-haiku-4-5 + caching                           |     ~$0.05 |   ~1,000 trials |

**Re-priced program total: ~$550–780 at the DoD tier** — not $2,500–8,000. The old table over-stated the
program by **4–10×**.

> ⚠️ **These are estimates from three logged token counts.** The rule below is that the _first_ dollar
> spent replaces them with a measurement. No sweep is committed to before that happens.

## 2. Correction to the caching lever — it is worth ~25%, not ~45%

An earlier draft of this plan claimed prompt caching would cut ~45% off every trial, on the standard
agent-loop assumption that a growing message history is re-sent verbatim each step. **Reading
[`reactor.ts`](../../packages/orchestrator/src/reactor.ts#L328-L349) refutes that**, in two ways that
pull in opposite directions:

1. **The history is already compact.** `pushObservation` collapses the _previous_ large page-state blob
   to `COLLAPSED_STATE_PLACEHOLDER` whenever a new one arrives (AI-3 transient page-state), and
   `syncWorkingState` does the same for the typed working ledger. DOM dumps never accumulate. So the
   cacheable prefix — system + `SECURITY_PREAMBLE` + tool definitions + collapsed history — is **small**,
   and the bulk of each request is the **current** page state, which is fresh every step and inherently
   uncacheable. The saving is therefore **~20–30% of input, not 70%**.
2. **Naive placement would cache nothing at all.** Both collapses **mutate a message in place**
   (`messages[lastStateIndex] = {...prev, content: PLACEHOLDER}`). Caching is a _prefix match_ — a byte
   change anywhere in the prefix invalidates everything after it. A breakpoint at the tail would be
   invalidated on **every single step**, yielding a 0% hit rate while still paying the 1.25× write
   premium. **Net worse than no caching.**

**The fix:** place the rolling breakpoint with a **lag of two steps**, behind the collapsible region.
The message at step _N−1_ is collapsed during step _N_ and never touched again, so at step _N_ the
prefix through step _N−2_ is byte-stable. Pin a second, permanent breakpoint after tools + system, with
`ttl: "1h"` so it survives a whole sweep rather than one trial.

**Verification is not optional:** `usage.cache_read_input_tokens` must be non-zero across steps. If it
reads zero, a silent invalidator is still live and caching is _costing_ money, not saving it.

This correction is in the plan rather than quietly fixed because it is the difference between a lever
that pays and a lever that charges 25% for nothing.

## 3. What $50 of API still cannot buy — stated once, plainly

- **North-star condition 1 (H2H win) is out of scope, by the owner's own framing.** It needs **rival
  subscriptions** — ChatGPT Plus + Claude Pro + Comet Pro, ~$60/month — not API tokens. No amount of
  API spend reaches it. [S11](phase-s11-benchmark-h2h.md) stays 🟠 on a blocker this budget deliberately
  does not address; whether to ever buy that month is a separate owner decision, and declining it is a
  legitimate answer.
- **North-star condition 2 (claim-grade ASR) does not fit — and should not run yet anyway.** 24 `atk_*`
  × N≥10 = 240 trials ≈ **$46**, which would consume the whole budget and leave the competence baseline
  unmeasured. The constitution independently requires it to run **after**
  [S3](phase-s3-reliability-actions.md): _ASR measured at 1/3 benign competence is inflated by
  incompetence, not defence._ Budget and constitution agree on the ordering. It is the **next purchase**.
- **≥25 human judge labels.** Costs $0 and owner **time**. The cheapest north-star-adjacent unblock in
  the program, absent from this budget because money is not what it needs.

**One north-star condition gets a publishable number for $50: none.** What $50 buys is the program's
first two **✅ phases** and the honest competence baseline every later claim is measured against.

## 4. The spending rule

> **No paid token is spent on a question a free tier can answer.**

Four tiers, cheapest first. A sweep may escalate a tier only by naming, in its ledger entry, what the
tier below could not answer.

| Tier                     | Cost | What it can prove                                                                                                                                                                                                   | What it may never claim                                                             |
| ------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **T0 — no model**        | $0   | Mechanism _exists and fires_: deterministic gates, scripted-adversarial providers, refutations. The [S5](phase-s5-code-execution.md) trick — a phase deferred on a wrong belief, refuted by two local HTTP servers. | Competence. Labelled "plumbing/regression, NOT competence" per the ledger contract. |
| **T1 — free cloud tier** | $0   | Mechanism-firing **rates** at N≥10 across the registry, on a frontier-class model. Rate limits make it slow, not expensive.                                                                                         | The DoD number. Every row carries its tier label.                                   |
| **T2 — calibration**     | ~$1  | The real tokens/trial and $/trial. Gates everything below it.                                                                                                                                                       | Anything else.                                                                      |
| **T3 — the $50**         | ~$44 | Two phase closes at the **DoD tier**: the S0 baseline and the S3 paired sweep.                                                                                                                                      | Anything a lower tier could have answered.                                          |

## 5. The plan

### Step 1 — free levers, before a cent is spent (code work) — **LANDED 2026-08-21**

All four shipped on `feat/ai-budget-caching-ceiling`, deterministic and test-covered. **No measurement is
claimed by any of it** — this is the machinery a funded sweep runs on, not a result.

| Lever | Landed as                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0    | `CanonCacheHint` on `CanonRequest` (provider-agnostic, ADR-0005) → `cache_control` in the Anthropic adapter; `stableIndexBefore` in the orchestrator computes the promise from the two indices the Reactor may still rewrite; size-gated per breakpoint; `ttl: '1h'`. |
| L1    | `TokenLedger.setRunCeiling` + a pre-dispatch gate in the gateway (429, never a silent truncation); `runTokenCeiling` on `runAgent`; `TEPEGOZ_EVAL_RUN_CEILING` forwarded to the app by the harness.                                                                   |
| L2    | Already existed: `modelLabel()` reports `provider (plan=…, exec=…)` into every report and archive row. Widened rather than duplicated.                                                                                                                                |
| L3    | `TEPEGOZ_EVAL_RATES` gained `cacheReadMultiplier` / `cacheWriteMultiplier`; `estimateCostUsd` prices the three input classes separately.                                                                                                                              |

**Two corrections the implementation forced, both of which would have produced wrong money:**

- **Cache counters are ADDITIVE, not a breakdown.** Vendors report `inputTokens` as the tokens that were
  _neither_ cached nor written. An earlier draft of the ledger excluded the cache counters from
  `totalTokens`, which would have made a well-cached run look nearly free to the quota gate.
- **Pricing all input at the full rate over-reports a cached sweep.** Cache reads bill at ~0.1x and
  writes at ~1.25x. Without the multipliers the harness would have priced the $50 plan as unaffordable
  when it is not.

Caching is unfalsifiable unless the counters are stated, so the sweep report now ends on a verdict —
`healthy` / `weak` / **`WASTED`** / `not-used` (`cache-health.ts`). A wasted cache is the failure that
survives for months precisely because nothing says it out loud.

_(Original plan, for the record:)_

| #      | Lever                                                                                                               | Why it pays                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L0** | **Prompt caching, with the lag-2 rolling breakpoint of §2.** `cache_control` appears **nowhere** in the repo today. | ~25% off every paid trial — ~$11 of this budget — plus lower wall-clock, which is [S7](phase-s7-speed.md)'s headline metric improved for free. **Must ship with the `cache_read_input_tokens` assertion**; done naively it loses money. |
| **L1** | **Per-trial token ceiling.** Today one `escape_bait` trial can burn 224k tokens — 4.5× the budgeting assumption.    | On a $50 budget a handful of those is a measurable fraction of the whole. Turns the budget into a guarantee rather than a hope.                                                                                                         |
| **L2** | **Tier label in the harness**, written into every ledger row.                                                       | The DoD-tier plan below does not _need_ the §7 amendment — but the label is what lets a future cheap-tier row be honest instead of forbidden.                                                                                           |
| **L3** | **Wire `TEPEGOZ_EVAL_RATES`** into the sweep launcher with current prices.                                          | The report already refuses to print $0 for an unknown price. Give it the prices.                                                                                                                                                        |

None of these needs a key.

### Step 2 — T2 calibration, ~$1

6 scenarios × N=1, DoD tier, caching on, rates set. Deliverable: **actual tokens/trial, $/trial, and the
cache hit rate, recorded in [`eval-results.md`](eval-results.md)**.

This is not a new idea — it is [S0](phase-s0-truth-and-repair.md)'s own stated job: *"S0 measures the
real $/trial and replaces these order-of-magnitude estimates with actuals."* It was priced at $150–500.
It costs **about a dollar**.

**Gate:** if measured $/trial exceeds ~$0.25, Step 3b drops its N. If it comes in under ~$0.15, N goes
up. The plan adapts to the measurement; the measurement is never adjusted to fit the plan.

### Step 3a — the S0 baseline, ~$30

**52 scenarios × N=3 = 156 trials**, DoD tier (plan opus-4-8 / exec sonnet-4-6), caching on.

- **Coverage 5/52 → 52/52.** Today _"only 5 of 52 scenarios have EVER been measured live"_; the 24
  `atk_*`, all 9 web-patterns, and everything else have **no valid current number**.
- **[S0](phase-s0-truth-and-repair.md) closes 🟠 → ✅** — the program's first ✅, and the base every other
  phase's before/after is measured against.
- N=3 with flaky tagging is exactly the constitution's broad-coverage tier. No claim rides on it.

### Step 3b — the S3 paired sweep, ~$13

**7 `reliability-actions` scenarios × N=5 × 2 arms = 70 trials**, same tier, capability flags off/on.

This is the sweep that attacks the owner's **pain #1** — _"can't complete tasks on real sites"_ — and
[S3](phase-s3-reliability-actions.md) is the phase with the most landed code (PR0–PR7: dialogs,
tab-spawn, wait-for, send-keys, hover, typed widgets, click-time occlusion + locator cascade, the
`cookie_consent` fix).

**N=5 is claim-grade here, by the pooled route.** The constitution requires _"N≥10 per scenario **or**
family-pooled 30–70 trials"_ — 7 × 5 = **35 pooled trials per arm**, inside that band, with Wilson 95%
CIs on the pooled family aggregate. This is not a corner cut; it is the cheaper of two paths the
constitution already sanctions.

Delivers: **[S3](phase-s3-reliability-actions.md) closes 🟠 → ✅**, and rows 1–5 of
[`PROSE-LEDGER.md`](PROSE-LEDGER.md) become convertible — the first movement in a ledger where all seven
rows have been RETAINED since program start.

### Step 4 — T1, free, ongoing

[S2](phase-s2-perception-v2.md)'s and [S4](phase-s4-verified-outcomes.md)'s paired sweeps run on a **free
cloud tier** at N≥10. The gateway is provider-agnostic (ADR-0005) and the gemini adapter already does
native tool-calling in both directions ([S1](phase-s1-foundation-native-loop.md)). A paired sweep on a
free tier is still a paired sweep **as long as both arms run on the same tier**.

**Local (`packages/local-inference`) is deliberately NOT a tier here.** The catalogue ships 1.5B/3B
models at 8192 ctx — page state alone overflows that — and `plan` is excluded from
`LOCAL_CANDIDATE_CAPABILITIES` by design. Local can own cheap _capabilities_
([S12a](phase-s12-local-model.md)'s ownership table); it cannot drive the agent loop, and pretending
otherwise would be exactly the vanity this program forbids.

## 6. The budget table

| Sweep                                                               |    Trials | Tier                    |                                        Cost |
| ------------------------------------------------------------------- | --------: | ----------------------- | ------------------------------------------: |
| T2 calibration                                                      |         6 | DoD + cache             |                                     **~$1** |
| T3a S0 full-registry baseline (52 × N=3) → **S0 ✅**                |       156 | DoD + cache             |                                    **~$30** |
| T3b S3 `reliability-actions` paired (7 × N=5 × 2 arms) → **S3 ✅**  |        70 | DoD + cache             |                                    **~$13** |
| S2 / S4 paired sweeps, both arms same tier                          | ~140 each | free cloud tier         |                                      **$0** |
| Deterministic / scripted-adversarial (the S5 trick)                 |         — | no model                |                                      **$0** |
| **Committed total**                                                 |   **232** |                         |                                    **~$44** |
| _Reserve_ (calibration overrun, re-runs, transport-invalid retries) |           |                         |                                     **~$6** |
| Claim-grade ASR (24 `atk_*` × N≥10)                                 |       240 | DoD + cache             |                ~$46 — **the next purchase** |
| H2H battery                                                         |         — | rival **subscriptions** | ~$60/mo — **not an API cost; out of scope** |

## 7. Constitution amendment — no longer required, kept on the shelf

An earlier draft needed [`constitution.md`](constitution.md) amended, because a $20 budget could only
afford a cheap tier and the constitution says _"every internal number comes from the **real product
model** driving the real app."_

**At $50 the plan runs at the DoD tier and the amendment is unnecessary.** It is recorded here only
because Step 4's free-tier sweeps will eventually need it:

> Every ledger row carries an explicit **tier label**. A number measured on a non-default tier is a
> valid, publishable _internal_ number, labelled with its tier. The **north-star claim** — and only the
> claim — requires the DoD product tier. "Real product model" binds the claim, not every measurement.

Still an open owner decision, but no longer on the critical path.
