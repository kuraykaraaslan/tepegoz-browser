# Eval Results Ledger — AI Agent Super

The dated results ledger for this program. It **continues** the v2 ledger
[`../ai/eval-results-2026-07.md`](eval-results-2026-07.md) (6 entries, 2026-07-10 → 2026-07-25);
[S0](phase-s0-truth-and-repair.md) moves that file's history under this folder. Every phase exit records
its before/after here — **a phase is incomplete until its delta is in this ledger** (anti-debt rule).

> **Recording contract (anti-vanity):** numbers, caveats, and what's-still-owed **together**. Every entry
> names the model tier, N, the exclusion accounting (transport-invalid / dead-key / UNMEASURED), Wilson
> CIs on pooled family aggregates, and $/trial + wall-clock/trial. Scripted-only runs are labelled
> "plumbing/regression, NOT competence." No north-star condition is declared met from an unfunded or
> scripted run.

## Current measured state (carried from the v2 ledger — the baseline this program starts from)

The single source of truth until [S0](phase-s0-truth-and-repair.md)'s full-registry baseline replaces it.

- **Coverage:** only **5 of 52** scenarios have EVER been measured live (the escape family). The 24
  `atk_*` adversarial scenarios, all 9 web-patterns, and everything else have **no valid current
  number**.
- **gpt-4o, N=3** (not the product default): pooled dev per-trial ≈ **33%**; **escape rate 50–75%**. All
  three C1 levers (typed state, no-progress replan, PR3 guards) **fire correctly and none stops gpt-4o
  escaping**.
- **Anthropic product default** (plan `claude-opus-4-8` / exec `claude-sonnet-4-6`), N=3 thinned to
  effective n=1–3 by transport + billing exclusions: `form_validation_required` **3/3**;
  `url_hallucination_trap` **0/2** (fails **on-page**, does not escape); `silent_api_failure` and
  `sitemap_only_route` **UNMEASURED** (all trials billing-invalid). **Escape rate: 0%.**
- **The deciding finding** (v2 ledger, 2026-07-25): *on the DoD model, escape is essentially NOT the
  failure mode — 0% escape vs gpt-4o's 50–75%. The product-default model respects the on-page steers, so
  the policy-level escape gate is very likely UNNECESSARY. Anthropic still FAILS the hard nav scenarios,
  but ON-PAGE (wrong/incomplete answer) — a different competence gap.*
- **Known artifact — resolved 2026-08-16.** The root `agent-eval-report.json` carried the
  **pre-correction** numbers (`sitemap_only_route 0/3`, `silent_api_failure 0/3`, pooled dev 3/10) —
  knowingly wrong; the corrected reading is **3/7**. [S0](phase-s0-truth-and-repair.md) PR3 deleted it.
  It turned out never to have been *committed* (only present on disk, already git-ignored), so the fix
  was local deletion plus a documented regenerate path
  ([runbook](eval-loop-runbook.md#regenerating-the-report-never-commit-it)) rather than a `git rm`.
  **This ledger, not the JSON, is the record.**
- **Judge calibration:** 1 human label of the required 25 → judge claim-barred.
- **North-star scorecard:** 0 of 4 conditions have a publishable number.

## Program entries

_(none yet — [S0](phase-s0-truth-and-repair.md)'s full-registry baseline is the first, ⏸ awaiting a
funded key. Each S-phase appends its dated before/after entry below as it exits.)_

### Template for a phase-exit entry

```
### <date> — <phase id> <PR> — <tier>, N=<n> (<funded|local|scripted>)
- How run: model tier, key source, TEPEGOZ_EVAL_* knobs, fixture family, per-scenario N.
- Exclusions: transport-invalid k, dead-key k (UNMEASURED scenarios named), abandoned-retry tokens.
- Result: per-scenario k/N + pooled family pass + escape (Wilson 95% CIs). Paired with/without if a
  prose steer was deleted (equivalence margin stated).
- Cost: $/trial, wall-clock p50/trial (actuals — updates the README budget table).
- Verdict vs DoD: met / not met / partial; what's still owed.
- Prose: PROSE-LEDGER rows moved DELETED/RETAINED with the proving sweep linked.
```
