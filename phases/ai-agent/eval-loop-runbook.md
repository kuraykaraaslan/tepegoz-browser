# AI Eval Loop — Runbook

How to run the **test → diagnose → fix → re-test** competence loop end-to-end, and the gotchas that cost
real time to learn. Companion to [`eval-results-2026-07.md`](eval-results-2026-07.md) (the first run's
numbers + findings). Institutionalises the loop (AI-6 goal); keep it current as the harness evolves.

## Run it (Windows / PowerShell)

```powershell
# 0. Kill stray Electron FIRST — the app has a single-instance lock, so a fresh eval launch quits
#    immediately (Playwright then reports "Target page, context or browser has been closed").
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force

# 1. Scripted tier (no key) — plumbing/regression only. Runs just blog_behind_menu. Proves the harness
#    drives the real app; NEVER competence evidence.
pnpm eval

# 2. Live tier (real model) — the honest competence measurement.
$env:TEPEGOZ_EVAL_MODE     = 'live'
$env:TEPEGOZ_EVAL_PROVIDER = 'openai'      # anthropic | openai | gemini | kimi
$env:TEPEGOZ_EVAL_API_KEY  = '<key>'       # keep out of git/logs; rotate after
pnpm eval
```

### Knobs (env)

| Var                                              | Effect                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEPEGOZ_EVAL_MODE=live`                         | real model over the full registry (else scripted, 1 scenario)                                                                                                                              |
| `TEPEGOZ_EVAL_PROVIDER` / `TEPEGOZ_EVAL_API_KEY` | which model + its key (provider-agnostic by design)                                                                                                                                        |
| **`TEPEGOZ_EVAL_REPEAT=3`**                      | **run each scenario N times** — the table shows the MAJORITY verdict, plus a MEAN per-trial pass-rate + per-scenario `k/N` frequency. **Use N≥3 for any headline** — N=1 flips run-to-run. |
| `TEPEGOZ_EVAL_ONLY=id1,id2`                      | run only these scenario ids (fast iterations; a full live run is minutes-per-scenario)                                                                                                     |
| `TEPEGOZ_PERCEPTION=a11y`                        | force the accessibility-tree fallback (default is render-DOM)                                                                                                                              |

### Output

- stdout table (majority pass/fail + `k/N`), `agent-eval-report.json` (latest), and a git-ignored archive
  `agent-eval-runs/<ts>-<mode>.json` + per-scenario logs `agent-eval-runs/<ts>-<mode>-logs/<id>[.tN].log`.

### Regenerating the report — never commit it

`agent-eval-report.json` is a **regenerable artefact, not a source of truth.** Both it and
`agent-eval-runs/` are git-ignored, and they must stay that way: a committed report goes stale the moment
the scoring logic changes, and then it lies. This is not hypothetical —
[S0](phase-s0-truth-and-repair.md) deleted a root report still showing `sitemap_only_route` 0/3 and
`silent_api_failure` 0/3 long after the transport-invalid / dead-key exclusions (`isTransportInvalid`,
`isDeadKeyError`, `UNMEASURED`) had corrected the reading to 3/7.

To reproduce the number on demand, re-run the harness — it rewrites the report at the repo root:

```powershell
$env:TEPEGOZ_EVAL_MODE     = 'live'
$env:TEPEGOZ_EVAL_PROVIDER = 'anthropic'
$env:TEPEGOZ_EVAL_API_KEY  = '<key>'
$env:TEPEGOZ_EVAL_REPEAT   = '3'          # N>=3 for anything you intend to quote
pnpm eval
```

**The durable record is [`eval-results.md`](eval-results.md)**, where a human writes the number down with
its model tier, N, exclusion accounting, Wilson CIs, and $/trial. The JSON is scratch; the ledger is the
claim. If you need an old run, it is in `agent-eval-runs/<ts>-<mode>.json`, not in git.

- The trend line compares only against a **like-for-like** prior archive (same model + scenario count).
- Diagnose a FAIL from its `<id>.log`: the `[eval] <kind>` step trace (plan → decisions → step_ok/error →
  done) + `stoppedReason` + token count.

## Gotchas (learned the hard way)

- **Single-instance lock** → always kill stray Electron before a run (step 0).
- **Window must stay composited.** The eval window is shown **inactive** (no focus steal) but on-screen.
  Minimizing / hiding / opacity-0 / off-screen **pauses or races the compositor** → `elementFromPoint`
  returns null → render-DOM perception goes blind and screenshots fail. Don't "hide" it.
- **better-sqlite3 ABI:** live needs the **Electron** ABI. If `pnpm test` ran under Node ABI this session,
  `pnpm --filter @tepegoz/desktop rebuild` first (`pnpm eval` builds but does NOT rebuild native modules).
- **Provider rate limits are real.** A low-TPM key (e.g. 30k tokens/min) hard-limited runs; the shared HTTP
  client now backs off + retries 429s (and pre-send DNS blips), but heavy back-to-back scenarios still get
  starved — prefer `TEPEGOZ_EVAL_ONLY` subsets, or a higher-TPM key, for N≥3.
- **A 429/DNS hard-fail is NOT a competence failure.** Separate transport failures (`stoppedReason:
tool_error` at ~0 tokens, or a log full of "backing off") from real agent misses.

## Authoring a fixture (data-driven — one JSON entry + one HTML)

- Add `test-fixtures/sites/<dir>/index.html` (self-contained: inline CSS/JS, no external assets) and a
  scenario entry in `packages/agent-eval/scenarios/*.json`.
- **Gate the ground-truth string:** the `domAssertion` text must be ABSENT from the initial visible
  innerText and appear ONLY after the correct action (reveal a `display:none` node, JS-inject on the right
  event, or navigate). A no-op / wrong action must fail. (Canonical: `<select>` change → `Selected: X`.)
- `expectedValue` is checked against the agent's **summary** (so the value must be readable on the page).
- Mark `heldOut: true` for the never-tuned honesty subset — reported separately, never used to design a fix.

## Iteration discipline (the anti-vanity contract)

1. **Baseline** the live tier (N≥3) → the honest "before".
2. **Diagnose** each dev-set FAIL from its log; classify **systematic → code** vs open-ended → general.
3. **Fix ONE root cause per iteration**, in **code** not prose, in provider-neutral layers (so all models
   benefit) → **one commit**.
4. **Re-run** the affected dev subset + a held-out tripwire (N≥3) → confirm the delta + **no regression**.
5. **Never tune to held-out**; never present scripted greens as competence; a wrong answer MUST show FAIL.
6. **Record** honest before/after (with caveats) — see `eval-results-2026-07.md`.

## Concurrent-work note

This branch often carries parallel WIP. Commit **explicit paths only** — `git commit -- <path>` (never
`git add .` + bare `commit`), or a concurrent actor's staged files get swept into your commit.
