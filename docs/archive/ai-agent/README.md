# Archived: AI track v1 (AI-1 … AI-8)

This directory preserves the first generation of the AI agent competence track exactly as it last
stood (2026-07-24), including every dated status note and measurement — the audit trail is the
anti-vanity evidence and is never rewritten. The track was superseded by the **v2 roadmap**, which is
in turn superseded by the **v3 program** in [`../../concepts/ai-agent/README.md`](../../concepts/ai-agent/README.md); the
[residual-scope map](../../concepts/ai-agent/README.md#old-v2--new-s-residual-scope-map) there says where every remaining
item went, and [`../../concepts/ai-agent/reference/history.md`](../../concepts/ai-agent/reference/history.md) carries the canonical short form of the
`browser-use`/`nanobrowser` build-vs-buy decision.

## Provenance (restored by S0 PR1, 2026-08-16)

These 10 files were **deleted** from `docs/concepts/ai/archive/` by commit `e900567`
("chore: consolidate in-flight parallel-session work onto the branch"), leaving ~15 dangling
`archive/` links across the track. [S0](../../concepts/ai-agent/phases/00-truth-and-repair.md) PR1 restored them **verbatim**
from the last commit that carried them:

```sh
git checkout 49396c5 -- phases/ai/archive/
```

They now live under `docs/concepts/ai-agent-super/archive/` because this folder owns the program's history.
The **only** edits applied on restore were mechanical link repointing: sibling phase links gained one
`../` level for the new parent folder, README-v1's cross-cutting-gate pointer now resolves to
`docs/concepts/README.md`, and the `packages/` / `apps/` links — **already broken before the move**, from when
these documents were first demoted into an `archive/` subfolder — were repaired to the repo root. No
status note, measurement, or claim was touched. Recover the untouched originals at any time with
`git show 49396c5:phases/ai/archive/<file>`.

## Contents

| File                                                                       | What it holds                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`README-v1.md`](readme-v1.md)                                             | The v1 track index + the 30-signal (`s01`…`s30`) status table and the 2026-07-24 invalidation note |
| [`01-eval-harness.md`](01-eval-harness.md)                 | The `_electron` eval harness, scenario registry, scorer + judge                                    |
| [`02-perception-buildtree.md`](02-perception-buildtree.md) | The render-DOM `buildDomTree` port (default-on perception)                                         |
| [`03-agent-loop.md`](03-agent-loop.md)                     | Progress brain, planner-as-validator, loop detector, recovery taxonomy                             |
| [`04-action-vocabulary.md`](04-action-vocabulary.md)       | `scroll_to_text`, `select_option`, fill read-back, `browser_validate_form`                         |
| [`05-content-security.md`](05-content-security.md)         | Inbound content-guard + `SECURITY_PREAMBLE`                                                        |
| [`06-consolidation.md`](06-consolidation.md)               | Never started as a phase; re-scoped to the consolidation-as-DoD rule                               |
| [`07-navigation-grounding.md`](07-navigation-grounding.md) | Grounded candidate resolver + SSRF-safe sitemap reader + escape metric                             |
| [`08-beyond-the-port.md`](08-beyond-the-port.md)           | Network recorder + the screenshot-honesty fix                                                      |

> **These documents are history, not a plan.** Their unchecked boxes are v1 intent, superseded by the
> v3 phase index in [`../../concepts/ai-agent/README.md`](../../concepts/ai-agent/README.md). Read them for the measurement record and the
> port lineage — never as open work.
