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
