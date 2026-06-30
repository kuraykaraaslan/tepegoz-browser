# Architecture Decision Records (ADRs)

Each ADR captures one significant, hard-to-reverse decision: its context, the decision, and the
consequences (including rejected alternatives). Format is a lightweight [MADR](https://adr.github.io/madr/).

- ADRs are **immutable once Accepted**; to change a decision, add a new ADR that **supersedes** it.
- Status: `Proposed` → `Accepted` → (`Superseded by ADR-NNNN` | `Deprecated`).

| ADR | Title | Status |
|----|-------|--------|
| [0001](0001-electron-react-typescript.md) | Electron + React + TypeScript shell | Accepted |
| [0002](0002-monorepo-pnpm-turborepo.md) | pnpm workspaces + Turborepo monorepo | Accepted |
| [0003](0003-sqlite-persistence.md) | SQLite (better-sqlite3 + FTS5 + sqlite-vec) for L1 | Accepted |
| [0004](0004-event-sourced-journal.md) | Event-sourced Event Journal as the single source of truth | Accepted |
| [0005](0005-provider-agnostic-ai.md) | Provider-agnostic AI, BYO-key local-first | Accepted |
| [0006](0006-policy-kernel-hitl.md) | Deterministic Policy Kernel + HITL (security-by-design) | Accepted |
| [0007](0007-capability-plane-mcp.md) | Unified Capability/Tool Plane; Tepegöz as MCP client **and** server | Accepted |
| [0008](0008-perception-cdp.md) | DOM/a11y-first perception, vision fallback, WebMCP optional | Accepted |
| [0009](0009-boundary-mapping.md) | Boundary mapping: HTTP-semantic AppError → IPC / tool-call | Accepted |
| [0010](0010-ts-tooling-conventions.md) | TypeScript/tooling conventions & deviations | Accepted |
