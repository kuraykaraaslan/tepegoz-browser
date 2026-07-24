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
- **Caveat — C1 engagement UNVERIFIED.** The `[eval]` step trace does not echo the model's raw decision JSON,
  so these logs cannot confirm gpt-4o emitted the typed `state` field (→ working-state injected) or that
  replan fired. If gpt-4o did not emit `state`, PR1 was inert and this is really a *pre-C1* re-measurement.
  Closing this blind spot (surface "workingStateInjected" + "replanCount" in the eval out-JSON) is the
  immediate next task before any verdict on C1's design.

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
- **Verify C1 actually engaged for gpt-4o** (instrument the out-JSON; re-run one escape scenario) — blocks any
  design verdict.
- The **Anthropic product-default** escape-family sweep (C1's real DoD model) — needs a funded Anthropic key.
- N≥10 for claim-grade CIs once a lever actually moves the family.
