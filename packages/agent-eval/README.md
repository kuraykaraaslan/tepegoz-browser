# @tepegoz/agent-eval

The **real-result eval harness** — built by v1 AI-1
([`phases/ai-agent-super/archive/phase-ai-1-eval-harness.md`](../../phases/ai-agent-super/archive/phase-ai-1-eval-harness.md)),
now owned by the v3 program in [`phases/ai-agent-super/`](../../phases/ai-agent-super/README.md).
Dev-only + `private` — **never shipped in the app**. It is the measurement backbone the AI competence
track is scored against: a real agent driving real pages with ground-truth scoring, not a green offline
test.

## What's here

| Module                     | Role                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scenario-registry.ts` | Loads + `safeParse`s the data-driven scenario registry (`scenarios/*.json`). A new scenario is one JSON entry.                                                |
| `src/fixture-server.ts`    | Tiny `http.createServer` over repo-root `test-fixtures/sites/` — deterministic "real pages", no cloud dependency.                                             |
| `src/scorer.ts`            | **Ground-truth-first** scoring (DOM/value assertion).                                                                                                         |
| `src/judge.ts`             | Optional **LLM-judge** for open-ended scenarios (`judgeRubric`) — secondary to ground truth; model call injected, so prompt/verdict parsing is pure + tested. |
| `src/calibration.ts`       | Judge↔human **agreement rate** over `calibration/human-labels.json`, recorded in the report so a drifting judge is visible.                                   |
| `src/report.ts`            | Aggregates `AcceptanceMetrics`, splits **held-out** separately, emits the full pass/fail table + JSON artifact.                                               |
| `src/harness.eval.ts`      | The `_electron` driver: launches the **real app**, drives each scenario (scripted or live), scores, judges, writes the report.                                |

The schema (`EvalScenario`) lives in `@tepegoz/shared-types`; the metrics contract
(`AcceptanceMetrics` / `recordFromOutcomes` / `summarizeAcceptanceRuns`) is reused from
`@tepegoz/orchestrator`.

## Running

```sh
pnpm test          # the pure modules (registry/scorer/report/judge/calibration) — no browser, in turbo test

# Deterministic scripted tier (no cloud key) — drives the REAL app over local fixtures:
pnpm eval

# Live tier — the REAL product model over the full registry (honest competence):
TEPEGOZ_EVAL_MODE=live TEPEGOZ_EVAL_PROVIDER=anthropic TEPEGOZ_EVAL_API_KEY=sk-... pnpm eval
```

`pnpm eval` is **out-of-band** (not a blocking CI gate): the app runs in Electron batch mode via the
env-gated `apps/desktop/src/main/agent/agent-eval-runner.electron.ts` hook (`TEPEGOZ_EVAL=1`), which is
inert in production. The scripted tier runs only the scenarios with a scripted sequence (others are
skipped + logged); the live tier runs the whole registry, grading open-ended scenarios with the LLM-judge
and recording the judge↔human agreement rate. The nightly non-blocking workflow
(`.github/workflows/eval-nightly.yml`) uploads the JSON artifact and warns on a pass-rate regression.

> The live tier needs the Electron `better-sqlite3` ABI (like `pnpm e2e`); rebuilding native flips the
> Node ABI `pnpm test` uses (see the repo CLAUDE.md ABI note). Run it in the Electron env / nightly CI.
