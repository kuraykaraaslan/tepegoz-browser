/**
 * `@tepegoz/agent-runtime` — the Electron-free agentic run engine (L3): user prompt → ModelRouter →
 * Planner (DAG) → sequential Executor through the single ToolGateway PEP (Policy Kernel + HITL) →
 * live events + Human Handoff Controller. Every app/OS concern (the browser tool host, journal reader,
 * active-tab URL, localized handoff copy) is injected via `AgentRunDeps`, so the desktop app is a thin
 * adapter. Extracted from `apps/desktop` per docs/package-map.md.
 */
export {
  runAgent,
  type AgentRunHooks,
  type AgentRunDeps,
  type AgentRunSummary,
  type PlanApprovalDecision,
} from './agent-runtime';
export {
  advanceRunPhase,
  checkpointForDecision,
  checkpointForPlan,
  checkpointFromOutcome,
  isTerminalPhase,
  terminalCheckpoint,
  type AgentPageCheckpoint,
  type AgentPlanDecisionCheckpoint,
  type AgentRunCheckpoint,
  type AgentRunPhase,
  type AgentRunTransition,
  type AgentStepCheckpoint,
} from './run-lifecycle';
