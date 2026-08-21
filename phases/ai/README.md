# Retired: AI track v2 (M1–M2 / C1–C7 / F1–F3) — tombstone

> **This track is retired. The live AI roadmap is [`../ai-agent-super/`](../ai-agent-super/README.md).**

The v2 "falsifiable world's-best browser agent" rewrite was **superseded by v3** on **2026-08-16** by
[S0 — Truth & Repair](../ai-agent-super/phase-s0-truth-and-repair.md) PR2. This stub exists only so that
external references to `phases/ai/` land somewhere honest instead of 404-ing. **Add nothing here.**

## Why v2 was re-cut, not merely renamed

v2's own M1 close condition pre-registered a humility clause: _"if the full baseline disagrees with this
plan's failure ranking, re-cut C1..C5 rather than defend the document."_ The one DoD-model signal that
exists — Anthropic-tier **0% escape**, with failures landing **on-page** (wrong / incomplete answer) —
triggered exactly that clause. v2 had ranked the escape gate first. v3 is that re-cut: it re-orders the
capability work around on-page competence, perception economy, and the missing substrate.

## Where everything went

Nothing was dropped. v2's machinery was **absorbed**, not destroyed:

| v2 material                                                                                        | Now lives at                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The statistical constitution (two-tier N, Wilson CIs, anti-debt, fixture freeze, judge discipline) | [`../ai-agent-super/constitution.md`](../ai-agent-super/constitution.md)                                                                                                                                                     |
| The dated results ledger                                                                           | [`../ai-agent-super/eval-results.md`](../ai-agent-super/eval-results.md) (+ the 2026-07 history in [`eval-results-2026-07.md`](../ai-agent-super/eval-results-2026-07.md))                                                   |
| The prose-debt ledger                                                                              | [`../ai-agent-super/PROSE-LEDGER.md`](../ai-agent-super/PROSE-LEDGER.md)                                                                                                                                                     |
| The eval-loop runbook                                                                              | [`../ai-agent-super/eval-loop-runbook.md`](../ai-agent-super/eval-loop-runbook.md)                                                                                                                                           |
| The v1 archive (AI-1…AI-8) + build-vs-buy decision                                                 | [`../ai-agent-super/archive/`](../ai-agent-super/archive/README.md) + [`../ai-agent-super/history.md`](../ai-agent-super/history.md)                                                                                         |
| The 13 phase documents (M1–M2, C1–C7, F1–F3)                                                       | Deleted. Their residual scope is mapped row-by-row in the [v2 → v3 residual-scope map](../ai-agent-super/README.md#old-v2--new-s-residual-scope-map); recover any document verbatim with `git show 0eaafcd:phases/ai/<file>` |

## The landed v2 code is still live

Retiring the _documents_ retired no _code_. M1's measurement backbone (cost, wall-clock, Wilson CIs,
pooled family aggregates), all of C1 (typed working state, no-progress replan, escape→replan trigger),
and C7-PR1 (the 24-scenario adversarial battery + reachable strict inbound-guard mode) are shipped and
default-on. [S0](../ai-agent-super/phase-s0-truth-and-repair.md)'s status-truth pass records exactly what
landed and which S-phase now owns its owed measurement.
