# Head-to-head protocol (pre-registered)

**Status:** Pre-registered 2026-08-19 · **Not yet executed** · **Owner phase:**
[S11](phase-s11-benchmark-h2h.md)

This document is committed **before any head-to-head run**. That ordering is the whole point: a scoring
plan written after seeing the results is not a scoring plan, and a task list chosen after the fact is a
highlight reel. Everything below is fixed now so it cannot be adjusted later to flatter us.

If any part of this protocol turns out to be wrong, the correction is an **amendment with a date**, not a
silent edit — and an amendment made after a run has started invalidates that run.

## 1. What is being measured

**Verified-completion rate** — [S4](phase-s4-verified-outcomes.md)'s metric: did the agent's own evidence
support the outcome it claimed? Not "did it finish", and not "did it look busy".

Nothing else is a headline. Step counts, wall-clock and cost are recorded because they are cheap to
record, and they are reported as context, never as the claim.

## 2. Tasks

A named subset of the **already-frozen** bridge stratum in
[`online-mind2web-bridge.json`](../../packages/agent-eval/scenarios/online-mind2web-bridge.json)
(30 tasks, hash recorded in [fixture-freeze.md](fixture-freeze.md)). No new tasks are authored for the
H2H: reusing the frozen set is what guarantees the comparison and the bridge number measure the same
thing.

**The H2H subset (12 tasks), fixed here:**

| #   | Task id                                | Why it is in the subset                                         |
| --- | -------------------------------------- | --------------------------------------------------------------- |
| 1   | `bridge_wikipedia_navigate_and_read`   | Multi-hop navigation, unambiguous ground truth                  |
| 2   | `bridge_mdn_compare_two_pages`         | Reading a compatibility table, not prose                        |
| 3   | `bridge_github_open_issue_count`       | Live count — cannot be answered from training                   |
| 4   | `bridge_github_search_within_repo`     | In-site search plus a file read                                 |
| 5   | `bridge_hackernews_comment_navigation` | Navigating into a thread and summarising the right thing        |
| 6   | `bridge_npm_latest_version`            | Freshness probe with two required facts                         |
| 7   | `bridge_caniuse_feature_support`       | Structured table with a version answer                          |
| 8   | `bridge_cookie_banner_persist`         | A consent banner in the way — dismissing it is part of the task |
| 9   | `bridge_tr_resmi_gazete_tarih`         | Turkish government site, freshness                              |
| 10  | `bridge_tr_meteoroloji_hava`           | Turkish site requiring a form interaction                       |
| 11  | `bridge_tr_ptt_posta_kodu`             | Turkish multi-step lookup                                       |
| 12  | `bridge_tr_universite_bolum`           | Turkish multi-hop navigation                                    |

Four of twelve are Turkish-web, deliberately: it is the stratum our rivals are least likely to have
tuned for, and it is the one our users actually live in. That advantage is **declared here in advance**
rather than discovered in the results — a comparison whose task mix quietly favours the author is not a
comparison.

## 3. Rivals and the execution window

- tepegoz (this build — commit hash recorded at run time)
- Claude for Chrome
- Comet
- ChatGPT agentic browsing

**N ≥ 3 per task per agent. Same week for all four**, with the week stamped on the artifact. Rivals ship
continuously; a comparison spread over a month measures the calendar.

Every artifact records the **rival build strings** as observed at run time. Where a product does not
expose a version, that is recorded as "not exposed" — never guessed.

## 4. Scoring

1. Each run produces an artifact: the final answer, plus a transcript or screenshots sufficient to judge
   it.
2. Artifacts are **identity-stripped** before scoring — product names, UI chrome, and any watermark
   removed. The scorer must not be able to tell which agent produced which artifact.
3. A **single calibrated judge** scores all artifacts on verified-completion, using each task's rubric
   from the frozen registry.
4. The judge's **↔human agreement rate is reported next to every number it produced**. Below
   **25 human labels**, nothing is publishable — enforced in code
   ([`bridge-claim.ts`](../../packages/agent-eval/src/bridge-claim.ts)), not by memory.
5. Wilson 95% CIs on every rate. A point estimate from N=3 is not a result.

**Cross-report numbers are not comparable and will not be cited as if they were.** The published
`bu-max` 97% and `GPT-5.4` 93% figures were not scored by the same judge; quoting them beside ours would
be exactly the vendor-self-report anchoring the constitution's Never-list forbids.

## 5. The claim template

> On **[date]**, over **[N]** trials of **[k]** live-web tasks scored blind on verified-completion by a
> judge with **[x]%** agreement against **[m]** human labels, tepegoz achieved **[rate]%**
> (95% CI **[lo]–[hi]**), against **[rival rates]** measured the same week on the same tasks with the
> same judge.
>
> **Withdrawal clause: this claim is withdrawn the moment it fails to reproduce.** It is stamped with the
> week it ran and the rival build strings at that time. It is a measurement, not a property of the
> product, and it says nothing about builds released after that date — theirs or ours.

**Version 1 is published even if tepegoz loses.** Committing to that here, before the numbers exist, is
what removes the incentive to tune anything toward a headline.

## 6. ToS considerations

Driving a rival's product to measure it raises questions we would rather answer before than after.

- **Account and automation terms.** Each rival's terms are read manually before PR5, and the read is
  recorded per rival with a date. Where terms prohibit automated driving, that product is measured
  **by hand** or **not at all** — the result is reported as "measured manually" or "not measured", never
  quietly dropped.
- **No account abuse.** One ordinary paid account per rival, used as a user would. No scraping of rival
  infrastructure, no rate-limit evasion, no scripted account creation.
- **No commerce tasks in the H2H.** The subset above is read/navigate only, on purpose. _Amazon v.
  Perplexity_ is a live legal constraint on agentic commerce driving, and a benchmark is not a reason to
  test its edges with someone else's account.
- **Publication.** Rivals are named factually with their build strings and the date. No claim is made
  about their products beyond what these runs measured.

## 7. What would falsify this

Stated in advance, because a claim that cannot be wrong is not a claim:

- A re-run in the same week, same tasks, same judge, that does not reproduce the rate within its CI.
- Any evidence that the artifacts were not effectively identity-stripped (a judge able to identify the
  product invalidates the blinding, and the run with it).
- Judge↔human agreement below the bar on re-check.
- A task in the subset found to be unanswerable or ambiguous — that task is removed and **every** agent's
  number is recomputed without it, including ours.
