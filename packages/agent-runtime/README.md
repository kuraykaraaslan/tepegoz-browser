# @tepegoz/agent-runtime (L3)

The Electron-free **agentic run engine**: user prompt → `ModelRouter` → `Planner` (DAG) → `Executor`
(single `ToolGateway` PEP + HITL) → live events + the Human Handoff Controller. Every app/OS concern —
the browser tool host, the journal reader, the active-tab URL (for Policy Kernel site context), and
localized handoff copy — is injected via `AgentRunDeps`, so `apps/desktop/src/main/agent/agent-service.ts`
is now a thin adapter over `runAgent`. The provider is registered from the safeStorage vault key at run
time; the raw key never leaves the main process. Extracted from `apps/desktop` per `docs/package-map.md`.

## Exports

- **`runAgent`** — the L3 orchestration entry point for one agent turn; drives Planner → Executor →
  Reactor over the injected deps and hooks, emitting live progress events.
- **`AgentRunDeps`** — the injected host seams: `browserHost` (a `BrowserHost`), `journal`
  (`JournalReader`), `activeTabUrl()`, localized `handoffStrings`, and an optional `localInference`
  config (absent → `'local'` routing is unavailable and the run falls back to a cloud provider).
- **`AgentRunHooks`** — `onEvent`, `requestPlanApproval` (HITL plan preview before the loop),
  `requestApproval` (HITL per gated tool call), and a cooperative-cancellation `signal`.
- **`AgentRunSummary`** — the turn's closing result (`stoppedReason`, `ok`, optional `summary` appended
  to conversation memory by the host).
- **`PlanApprovalDecision`** — the user's plan-review outcome (`approved` + optional `skipStepIds`).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
