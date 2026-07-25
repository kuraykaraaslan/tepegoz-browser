# AI Eval Loop — First On-Harness Results (2026-07-10)

The first **live-model** run of the AI-1 eval harness (the "on-harness measurement owed" that AI-1..AI-5
were blocked on), plus the fixes it drove. Recorded honestly per the anti-vanity contract — **numbers,
caveats, and what's still owed together.**

## How it was run
- **Model:** OpenAI **gpt-4o** (`plan`+`exec`), via `TEPEGOZ_EVAL_MODE=live`. **Not** the Anthropic product
  default (Opus-4.8 plan / Sonnet-4.6 exec) — gpt-4o drives the same JSON-in-text decision path, so every
  fix here is **provider-agnostic** (lands in `@tepegoz/http`, `browser-tools`, the CDP driver, `window.ts`),
  not tuned to a provider. A cross-check on Anthropic is still owed.
- **N=1** per scenario (single run). The real app, real BrowserHost + Policy/HITL plane; only the model swapped.
- **Key limit:** the key's **30,000 tokens/min (TPM)** shaped everything (see finding #1).

## Headline (N=1 — read with the caveats below)
| Run | dev task-success | held-out | note |
|---|---|---|---|
| baseline, **before** 429 fix | 22.2% (2/9) | 0% (0/5) | **rate-limit ARTIFACT**, not competence |
| baseline, **after** 429 fix | **66.7% (6/9)** | **60% (3/5)** | the honest "before" |
| after `select_option` fix | 77.8% (7/9) | 40% (2/5) | one run; N=1 noise (see #3) |

The +44pt dev jump from the 429 fix is **removing an infra artifact**, not a competence gain.

## Fixes this session drove (all committed, provider-agnostic, unit-tested)
| Commit | What | Evidence |
|---|---|---|
| `08f21a8`,`87db7af` | **429 + pre-send (DNS) retry** in the shared HTTP seam | the entire first "22%" was 429 hard-fails; run completes after |
| `8c97d39`,`50562b8` | **`select_option`** action for native `<select>` (+ tolerant args) | `native_select_country` FAIL(`loop_detected`, 110k tok) → PASS(`completed`, 13.8k tok), confirmed 2× |
| `d9445d9` | eval **observability** (per-scenario logs, run archive/trend, real steps+tokens) | made all diagnosis above possible |
| `8a2cb59`,`b4faa27` | **non-disruptive eval window** (shown-inactive; minimize/opacity broke perception) | eval no longer steals focus; perception fidelity preserved |
| `eca8ccf` | **expanded fixtures 14 → 23** (held-out 5 → 8) + fixed 2 flawed | see below |

## Findings
1. **The dominant first-baseline "failure" was infrastructure, not competence.** A 429 (rate limit) hard-
   failed the whole agent run before it took a step — so a low-TPM key looked like agent incompetence. Any
   real user on a rate-limited key hit the same wall. Fixed by bounded, `Retry-After`-honoring backoff.
2. **`native_select_country` was a real capability gap** — a native `<select>` opens an OS popup no synthetic
   click can drive, so the agent flailed (Tab/scroll/screenshot) into a loop, burning 110k tokens. The
   `select_option` action closes it (13.8k tokens, PASS).
3. **N=1 is too noisy for a headline.** Across runs, `div_button_products`, `blog_behind_menu`, and
   `infinite_scroll_find` flipped PASS→FAIL while `shadow_dom_nav`/`compare_plans_judged` flipped FAIL→PASS —
   pure model sampling. A defensible number needs **N=3** (per-scenario pass-frequency).
4. **Biggest remaining competence anti-pattern: the escape hatch.** On hard **multi-step** tasks the agent
   abandons on-page interaction and **guesses a URL / runs `web_search`** instead of persevering — e.g.
   navigating to the real `target.com` instead of using an on-page widget, or web-searching "how to dismiss a
   cookie banner." Seen in `blog_behind_menu`, `shadow_dom_nav`, `div_button_products`, and the new
   `cookie-consent`/`login-form`/`contact-form`/`pagination`. Maps to **AI-7 (navigation grounding)** +
   **AI-4 `s16` (validation-aware form engine)**. This is the next high-leverage competence target.

## Fixture set (now 23 scenarios; data-driven — one JSON entry each)
- **+9 web-pattern hard cases** (each gates its ground-truth string behind the correct action):
  `cookie-consent`, `login-form`, `contact-form`, `pagination` (held-out), `data-table`, `dynamic-content`
  (held-out), `accordion`, `custom-dropdown` (ARIA listbox — **not** a `<select>`, with a native-select
  distractor), `tabs-widget` (held-out). Generated + adversarially verified via a workflow.
- **Fixed 2 flawed fixtures:** `shadow-dom-nav` destination `Target`→`Section B` (the brand collided with the
  real target.com, so the agent navigated off-site); relaxed the `compare_plans_judged` rubric (it rejected a
  correct terse answer for not restating both prices).
- **New-fixture live validation (N=1):** 5/9 PASS (`data-table`, `dynamic-content`, `accordion`,
  `custom-dropdown`, `tabs-widget`); 4 FAIL — fixtures verified **sound**, the failures are finding #4
  (multi-step flows) amplified by finding #1 (9 token-heavy scenarios starving one 30k-TPM key).

## Still owed
- **N=3** run for a defensible dev/held-out headline (pass-frequency, not a single flip).
- **Provider cross-check** on the Anthropic product default (Opus/Sonnet) — fixes are provider-agnostic by
  construction; confirm the numbers there.
- The **escape-hatch / multi-step-flow** competence fix (finding #4 → AI-7 + AI-4 `s16`).
- A higher-TPM key (or intra-run pacing) so heavy runs aren't starved.

## Operational note
Live eval needs **no stray Electron instance** (single-instance lock makes a fresh launch quit → Playwright
"Target page closed"); the runner kills strays first. The window is shown **inactive** (composited, focus not
stolen); minimizing/hiding/opacity-0 pauses or races the compositor and **blinds render-DOM perception**.

---

# C1 Escape-Family Sweep — After PR1+PR2 (2026-07-24)

First live measurement **after** C1 (typed working state `s15` + no-progress replan `s14`) landed on
`main` (`d591523`, `1c5ddd0`). Recorded per the anti-vanity contract — **including that it did not work.**

## How it was run
- **Model:** OpenAI **gpt-4o** (`plan`+`exec`), `TEPEGOZ_EVAL_MODE=live`, **N=3** per scenario. **Not** the
  Anthropic product default C1's DoD is stated on — so this is a dual-provider cross-check, not the DoD close.
- Escape family: `form_validation_required, silent_api_failure, escape_bait, url_hallucination_trap,
  sitemap_only_route`. 43.6 min wall-clock for 15 trials (escape trials burn the full 900s per-trial timeout).
- **C1 engagement — now VERIFIED (2026-07-24, instrumented re-run).** Added two diagnostic log lines to the
  reactor (`[c1] typed working-state injected` / `[c1] no-progress replan fired`) and re-ran one trial:
  - **PR1 fired:** `working-state injections: 1` — gpt-4o **does** emit the typed `state` and receives it
    back. PR1 is *not* inert; the model simply overrides its own ledger and escapes anyway.
  - **PR2 did NOT fire:** `replan fires: 0`. The trial escaped via **`web_search_items`** — a **read-class**
    tool, which the no-progress detector treats as *neutral*, never a `stall`. **Escape ≠ stall, so replan is
    architecturally blind to the escape mode.** This is the design gap, not a wiring bug.

## Result — no improvement over the pre-C1 baseline
| scenario | pre-C1 (N=3) | after C1 (N=3) | note |
|---|---|---|---|
| `form_validation_required` | 1/3 | **1/3** [flaky] | 1 trial CUT OFF (escaped to `aster.co.uk`, timed out) |
| `silent_api_failure` | 1/3 | **0/3** | escaped; summary missing "507" |
| `escape_bait` | (owed) | **0/3** [escaped] | operated fixture, then `web_search_items` → `max_steps` (224k tok) |
| `url_hallucination_trap` | (owed) | **2/3** [flaky] | 1 CUT OFF (escaped to `zephyrproject.org`) |
| `sitemap_only_route` (held-out) | (owed) | **3/3** | the one clean win |

Pooled family aggregates (the new report metric, dev per-trial, Wilson 95%):
- **`ai-7`** (url_hallucination + escape_bait): pass **33.3%** [9.7–70.0] (2/6) · **escape 50.0%** [18.8–81.2] (3/6)
- **`form`** (escape_bait + form_validation): pass **16.7%** [3.0–56.4] (1/6) · **escape 66.7%** [30.0–90.3] (4/6)

**DoD targets (`form_validation_required` & `silent_api_failure` each ≥6/10): NOT met — no movement.**

## Finding — the escape hatch survived C1's soft steers
The agent still abandons on-page interaction and **escapes**: off-site nav to a real (unreachable) URL
(`aster.co.uk`, `zephyrproject.org` → `ERR_FAILED`, spins to the 900s timeout) or **`web_search_items`**.
C1's typed state + replan + escape prose are *advisory* — gpt-4o overrides them. This points at a **harder
lever than C1 shipped**: gate/deny the escape tools (`web_search_items`, off-origin `browser_update_location`)
while an on-page task is unfinished, rather than only steering against them. Candidate re-prioritization:
promote a policy-level on-page constraint (Lane A) ahead of the remaining soft-state work.

## Still owed
- ~~Verify C1 actually engaged~~ **DONE** — PR1 fires, PR2 blind to escape (see verified note above).
- **The escape lever (C1 PR3):** make an escape attempt (`web_search_items` / off-origin nav on an unfinished
  on-page task) TRIGGER the replan, so the replanner injects an on-page approach before the agent wanders off.
  Escape is a distinct failure mode from "stall"; PR2 must learn to see it. Then re-measure the family.
- The **Anthropic product-default** escape-family sweep (C1's real DoD model) — needs a funded Anthropic key.
- N≥10 for claim-grade CIs once a lever actually moves the family.

---

# C1 PR3 Re-measure — escape→replan fires, but gpt-4o ignores it (2026-07-24)

After PR3 (`5a0cfb0`): an escape attempt (web search / off-origin nav) forces the replan. gpt-4o, N=3,
same escape family, run off-screen via the new `TEPEGOZ_START_BACKGROUND=1` (perception confirmed intact).

## PR3 engages — proven from the logs
`[c1] escape attempt detected → forcing replan` and `[c1] no-progress replan fired` appear in every
escaping trial (e.g. `escape_bait.t2`: escape_forced=2, replan_fired=2). **The mechanism works.**

## …but it does not change behaviour
The same trials show `web_search=2` alongside `escape_forced=2`: the agent escapes, gets the replan steer
("stay on-page, do X"), and **escapes again** — gpt-4o overrides the advisory guidance until the replan
budget (maxReplans=2) is spent, then keeps web-searching.

| scenario | pre-PR3 (N=3) | post-PR3 (N=3) |
|---|---|---|
| form_validation_required | 1/3 | 0/3 |
| silent_api_failure | 0/3 | 2/3 |
| escape_bait | 0/3 | 0/3 |
| url_hallucination_trap | 2/3 | 2/3 |
| sitemap_only_route (held-out) | 3/3 | 3/3 |
| **pooled dev per-trial** | 3/12 = 25% [8.9–53.2] | 4/12 = 33% [13.8–60.9] |

CIs overlap → **not significant**; the form↔silent swap is N=3 sampling noise; dev escape rate 50%→75%.

## Verdict — soft levers are exhausted for gpt-4o's escape behaviour
Three C1 levers (PR1 typed state, PR2 stall-replan, PR3 escape-replan) all **fire correctly** and all fail
to stop gpt-4o escaping. The evidence now points hard at a **policy-level gate** (deny `web_search_items` /
off-origin nav while an on-page task is unfinished) rather than any further *steering*.

## BUT — the decisive caveat: this is all gpt-4o, not C1's DoD model
Every number here is **gpt-4o**, which is an unusually escape-prone model. C1's DoD is stated on the
**Anthropic product default** (Opus/Sonnet), which is **unmeasured**. It is entirely possible the DoD model
respects the typed state + steers and never escapes — in which case C1 already works on its target and a
hard gate is unnecessary. **The right next step is the Anthropic escape sweep BEFORE building a gate** — a
big product-affecting change should not be built to fix a model C1 was never scoped against.

---

# C1 Anthropic sweep — first attempt INVALID; a likely C1 PR1 regression surfaced (2026-07-25)

Ran the deciding measurement on C1's actual DoD model — **anthropic (plan=claude-opus-4-8,
exec=claude-sonnet-4-6)** — validation trial (`form_validation_required`, N=1, background). The key
**works** (the model responded), but the trial was **INVALID** for two reasons and answers nothing yet.

## Two problems, one confounded run
1. **Likely C1 PR1 regression — the `state` field truncates the decision JSON.** Two decisions came back
   as *"Agent returned invalid JSON"*, each cut off mid-`state` (`…"next_goal":"…","state":{"openTabs":[],"selected`
   ← truncated). The verbose Anthropic model emits rationale + memory + next_goal + the full typed `state`
   object and hits the exec token budget (`max_tokens`), so the JSON never closes → parse fails. This did
   NOT show on gpt-4o (terser output), which is exactly why a dual-provider check exists. **The typed
   working state can break the run on a verbose model** — a real bug to fix (compact/cap `state`, raise the
   decision budget, or salvage a truncated trailing field).
2. **Page-load flake.** Same run logged `No active page` ×2 and `Popup failed to load ERR_FAILED`, ending
   `stoppedReason: handoff` with **0 tokens / 0 actions** — the agent never had a page to work on. A launch
   flake, not competence (and it muddies #1).

## Verdict: the escape question on the DoD model is still UNANSWERED
This is a transport/harness-invalid trial, not a competence read (per the anti-vanity rule, excluded). The
central question — *does the Anthropic product-default escape, or respect C1's steers?* — remains open.

## Owed (next, in order)
1. **Fix the `state` truncation** (C1 PR1 follow-up) — a compact `state` contract and/or a larger decision
   budget so a verbose model's JSON always closes; regression-test a truncated decision.
2. Re-run the Anthropic validation clean (confirm the page-load flake was a one-off), then the full N=3
   escape sweep — the actual deciding measurement.
