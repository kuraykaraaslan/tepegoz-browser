# ADR-0013: Agent orchestration & two-stage HITL (end-to-end agentic task)

- **Status:** Accepted
- **Date:** 2026-07-01

## Context
Phase 1a's Definition of Done is one concrete end-to-end agentic task that is **observable** and
**security-by-design**: a user prompt must flow through planning, the deterministic Policy Kernel, a
human-in-the-loop gate, tool execution, and a live console — with no security decision delegated to
the model. The agent core existed as independently-tested packages (model-gateway, orchestrator,
capability-plane, security-policy, tool-executor); this ADR records how they are composed inside the
Electron app.

## Decision
- **Main-process `AgentService` orchestrates; the renderer only displays + answers HITL.** Flow:
  prompt → `ModelRouter` (capability→tier + cost-saver) → provider registered from the safeStorage
  vault key (raw key never leaves main) → `Planner` (Intent→DAG, LLM output zod-validated, unknown
  tools rejected) → **plan-preview HITL** → sequential `Executor` through the single `ToolGateway`
  PEP (Policy Kernel + **per-tool HITL**) → built-in browser/tab tools on the isolated active tab.
- **Two HITL gates, both fail-safe.** (1) *Plan preview before the loop:* the whole DAG is shown; the
  user may prune steps and must approve — reject or a timeout runs **nothing**. (2) *Per-tool:* any
  `state_changing`/`destructive`/`financial` (or tainted, or sensitive-site) call is gated at the
  ToolGateway; no confirm handler / no response = **deny**. Both round-trip main→renderer→main via a
  pending-promise map keyed by a per-run id.
- **Perception is sanitized + wrapped.** Page text is read through the isolated `WebContentsView`
  (Phase 1a: DOM text via `executeJavaScript`; out-of-process CDP + a11y tree later), run through the
  Content Sanitizer, length-capped, and XML-wrapped with an anti-injection footer before it can reach
  the model. Page/LLM output is UNTRUSTED input to the Taint Tracker.
- **Observability-first.** Every step emits a live Agent Console event (plan / step_start / step_ok /
  step_error / awaiting_approval / done / error); the Token Ledger's aggregate is surfaced as a live
  indicator. (Event Journal projection of these events is a follow-up.)
- **IPC discipline (ADR-0009 sibling).** New `agent:*` / `token:*` channels are sender-validated
  (exact-host allow-list) and zod-validated; `agent:run` uses an async boundary so rejections map
  cleanly; only a **redacted** args preview crosses to the renderer, never raw args or the key.

## Consequences
- The end-to-end task works with security enforced deterministically **before** the model and a human
  gate **before** any side effect — a prompt-injected model cannot widen its own authority.
- Concurrency: `ToolGateway` confirm/audit handlers are process-global statics, so Phase 1a assumes
  effectively one active run; true concurrent runs need per-run handler scoping (tracked for 1b).
- Workspace packages must be **bundled** (not externalized) by electron-vite because they ship TS
  source; the Anthropic SDK stays external.
- Rejected: running the agent loop in the renderer (would expose keys/tools to untrusted UI) and
  letting the model self-police via prompt rules (injection defeats it — hence the deterministic
  kernel + HITL).
- Refined later: out-of-process CDP perception (ADR-0008), Event Journal projection (ADR-0004),
  Windows Hello biometric on high-risk gates, and durable checkpoint/resume of agent runs.
