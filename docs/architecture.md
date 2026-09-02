# Architecture — index

**This file is a thin index, not a source of truth.** It exists because
[`CLAUDE.md`](../CLAUDE.md) and [`phases/README.md`](../phases/README.md) both point here, and a dangling
pointer in the binding working agreement is exactly the drift
[S0](../phases/ai-agent/phase-s0-truth-and-repair.md) exists to close. Every section below links to
the document that actually owns the material — **read the owner, never duplicate it here**. A change to
the architecture is made in the owning document; this page only gains a link.

## The layer model (L0–L10)

**Owner:** [`../README.md` § Architecture at a glance](../README.md#architecture-at-a-glance)

Tepegöz is a layered, modular monorepo. Layers communicate only through typed, validated contracts;
direct cross-layer imports are forbidden and **enforced in CI** by
[`dependency-cruiser.cjs`](../dependency-cruiser.cjs).

|                         Layer | Responsibility                                                               | Deeper detail                                                                                                                         |
| ----------------------------: | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
|           **L0 — Core Shell** | Secure Electron windowing, fuses, sandboxing, typed IPC                      | [`apps/desktop`](../apps/desktop) · [ADR-0001](adr/0001-electron-react-typescript.md)                                                 |
|          **L1 — Persistence** | SQLite (WAL) + append-only Event Journal + content-addressed blob store      | [`packages/persistence`](../packages/persistence)                                                                                     |
|  **L2 — Durability & Memory** | Checkpoint/resume, handoff, per-task tiered memory                           | [Phase 1b](../phases/product/phase-1b-agentic-deepening.md)                                                                           |
|         **L3 — Orchestrator** | Intent → DAG planner, parallel scheduler, loop detection                     | [`packages/orchestrator`](../packages/orchestrator) · [ADR-0013](adr/0013-agent-orchestration-hitl.md)                                |
|   **L4 — Perception & Tools** | Out-of-process CDP driver, DOM + accessibility perception, content sanitizer | [`packages/tool-executor`](../packages/tool-executor) · [ADR-0008](adr/0008-perception-cdp.md)                                        |
|     **L5 — Capability Plane** | Tool gateway (single PEP), skills runtime, MCP client + server               | [ADR-0007](adr/0007-capability-plane-mcp.md)                                                                                          |
| **L6 — Integration Adapters** | Official-API-first connectors with browser fallback                          | [Phase 2](../phases/product/phase-2-adapters-safe-browsing.md)                                                                        |
|        **L7 — Model Gateway** | Provider-agnostic AI routing, transports, Token Ledger                       | **[`ai-transparency.md`](ai-transparency.md)** · [ADR-0005](adr/0005-provider-agnostic-ai.md)                                         |
|      **L8 — Security Kernel** | Policy Kernel, Capability Broker, Egress Firewall, HITL, prompt/rules engine | [`threat-model.md`](threat-model.md) · [ADR-0006](adr/0006-policy-kernel-hitl.md) · [ADR-0024](adr/0024-action-interception-plane.md) |
|           **L9 — Browser UI** | Command Palette, Live Agent Console, browser shell, settings                 | [`package-map.md`](package-map.md)                                                                                                    |
|       **L10 — Safe Browsing** | Adblock, Safe Browsing, AgentThreatShield, popup/permission guard            | [Phase 2](../phases/product/phase-2-adapters-safe-browsing.md)                                                                        |

> An ADR is cited only where one exists; the index of record is [`adr/`](adr/) (ADR-0024 is the current
> head — new records continue from 0025).

## Where each question is answered

| Question                                                                             | Document                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is the **realized** module map — which `@tepegoz/*` package holds what?         | [`package-map.md`](package-map.md) (+ [ADR-0015](adr/0015-package-extraction-roadmap.md)) — `apps/desktop` is a thin Electron shell; **new work targets a package, not `apps/desktop` growth** |
| How does the **L7 model plane** work (routing, transports, token ledger, providers)? | [`ai-transparency.md`](ai-transparency.md)                                                                                                                                                     |
| What is the **threat model** and the security posture?                               | [`threat-model.md`](threat-model.md) + [`sec/`](research/README.md)                                                                                                                            |
| **Why** was a given design decision made?                                            | [`adr/`](adr/) — decisions are recorded, never re-litigated in prose                                                                                                                           |
| What is being **built next**, in what order, with what exit criteria?                | [`../phases/README.md`](../phases/README.md)                                                                                                                                                   |
| What is the state of the **AI agent's competence** and how is it measured?           | [`../phases/ai-agent/README.md`](../phases/ai-agent/README.md) — the sole authoritative AI roadmap, with its results ledger and statistical constitution                                       |
| How do I **run the eval harness**?                                                   | [`../phases/ai-agent/eval-loop-runbook.md`](../phases/ai-agent/eval-loop-runbook.md)                                                                                                           |
| What are the **working agreement** rules (git, TS, zod, i18n, secrets)?              | [`../CLAUDE.md`](../CLAUDE.md)                                                                                                                                                                 |

## Cross-cutting foundations

Event-sourced state · a strict **zod `safeParse` boundary on every untrusted input** (IPC, LLM tool-call
args, MCP, adapters, journal, policy) · a uniform [`AppError`](adr/0009-boundary-mapping.md) contract
(services throw, the boundary maps) · redacted logging with secrets only in the main process via
`safeStorage` · an **i18n-from-day-0** mandate (English-first, Turkish first-class, each package owning
its dictionary — [ADR-0016](adr/0016-per-package-i18n.md)) · the renderer treated as untrusted, reached
only through a typed `contextBridge`.

## A note on the "approved plan"

[`../phases/README.md`](../phases/README.md) refers to an out-of-repo source plan that was to be moved
in as `docs/architecture.md` + `docs/ROADMAP.md`. That never happened, and it no longer should: the
architecture is now **realized in code and ADRs**, and the roadmap is **realized in
[`../phases/`](../phases/)**. Those are the sources of truth. This index replaces the missing pointer;
`docs/ROADMAP.md` is deliberately _not_ created, because [`../phases/`](../phases/) already is it.
