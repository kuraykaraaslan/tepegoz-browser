# ADR-0004: Event-sourced Event Journal as the single source of truth

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
Competitors' fatal weakness is black-box agency: users can't see what happened, tasks vanish on
crash, and transcripts bloat (base64 screenshots → token blowup). We need observability, durable
resume, and audit by construction.

## Decision
All state derives from an **append-only, immutable Event Journal** (L1). Events are facts
(`TabOpened`, `AgentStepExecuted`, `ToolInvoked`, `PolicyBlocked`, …) with `lsn` (monotonic),
`deviceId` (sync key), correlation id, redacted payload, and an optional `cas://<hash>` blob
reference. **base64 is never embedded**; large artifacts live in the content-addressed blob store.
Read models / projections are deterministic folds over events.

## Consequences
- "Shown = recorded" → the Agent Console and audit trail are the same data; black-box and
  "session lost" failures are structurally impossible.
- Replay re-folds events without re-calling the LLM (non-deterministic inputs are recorded as
  observation events) — cheap, deterministic, token-free.
- Append-only journal syncs by `(deviceId, lsn)`; mutable tables carry day-0 sync-meta.
