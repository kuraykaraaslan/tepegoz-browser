import type { Plan } from '@tepegoz/shared-types';
import type { AgentFailure, RecoveryAdvice, StepOutcome } from '@tepegoz/orchestrator';
import { classifyToolFailure, recoveryAdviceFor } from '@tepegoz/orchestrator';

export type AgentRunPhase =
  | 'requested'
  | 'planning'
  | 'awaiting_plan'
  | 'executing'
  | 'paused'
  | 'done'
  | 'error'
  | 'cancelled';

export type AgentRunTransition =
  | 'start_planning'
  | 'plan_ready'
  | 'plan_approved'
  | 'plan_rejected'
  | 'execution_started'
  | 'pause'
  | 'complete'
  | 'fail'
  | 'cancel';

export interface AgentPlanDecisionCheckpoint {
  approved: boolean;
  skippedStepIds: readonly string[];
}

export interface AgentPageCheckpoint {
  tabId?: string | undefined;
  url?: string | undefined;
  title?: string | undefined;
  snapshotRef?: string | undefined;
}

export interface AgentStepCheckpoint {
  stepId: string;
  tool: string;
  page?: AgentPageCheckpoint | undefined;
}

export interface AgentRunCheckpoint {
  phase: AgentRunPhase;
  ts: number;
  planStepCount?: number | undefined;
  approvedStepCount?: number | undefined;
  userDecision?: AgentPlanDecisionCheckpoint | undefined;
  lastSuccessfulStep?: AgentStepCheckpoint | undefined;
  lastFailure?: AgentFailure | undefined;
  recovery?: RecoveryAdvice | undefined;
  stoppedReason?: string | undefined;
}

const TRANSITIONS: Record<AgentRunPhase, Partial<Record<AgentRunTransition, AgentRunPhase>>> = {
  requested: { start_planning: 'planning', cancel: 'cancelled', fail: 'error' },
  planning: { plan_ready: 'awaiting_plan', cancel: 'cancelled', fail: 'error' },
  awaiting_plan: {
    plan_approved: 'awaiting_plan',
    plan_rejected: 'done',
    execution_started: 'executing',
    complete: 'done',
    cancel: 'cancelled',
    fail: 'error',
  },
  executing: { pause: 'paused', complete: 'done', cancel: 'cancelled', fail: 'error' },
  paused: { execution_started: 'executing', complete: 'done', cancel: 'cancelled', fail: 'error' },
  done: {},
  error: {},
  cancelled: {},
};

export function advanceRunPhase(phase: AgentRunPhase, transition: AgentRunTransition): AgentRunPhase {
  const next = TRANSITIONS[phase][transition];
  if (next === undefined) {
    throw new Error(`Invalid agent run transition: ${phase} -> ${transition}`);
  }
  return next;
}

export function isTerminalPhase(phase: AgentRunPhase): boolean {
  return phase === 'done' || phase === 'error' || phase === 'cancelled';
}

function tabIdFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'tabId' in args) {
    const tabId = (args as { tabId?: unknown }).tabId;
    if (typeof tabId === 'string' && tabId.length > 0) return tabId;
  }
  return undefined;
}

function pageFromResult(outcome: StepOutcome): AgentPageCheckpoint | undefined {
  const result = outcome.result;
  if (result === null || typeof result !== 'object') return undefined;
  const raw = result as { url?: unknown; title?: unknown };
  const url = typeof raw.url === 'string' && raw.url.length > 0 ? raw.url : undefined;
  const title = typeof raw.title === 'string' && raw.title.length > 0 ? raw.title : undefined;
  const tabId = tabIdFromArgs(outcome.args);
  if (url === undefined && title === undefined && tabId === undefined) return undefined;
  const snapshotRef = `runtime://${outcome.stepId}`;
  return { ...(tabId !== undefined ? { tabId } : {}), ...(url !== undefined ? { url } : {}), ...(title !== undefined ? { title } : {}), snapshotRef };
}

export function checkpointFromOutcome(phase: AgentRunPhase, outcome: StepOutcome): AgentRunCheckpoint {
  if (outcome.ok) {
    const page = pageFromResult(outcome);
    const lastSuccessfulStep: AgentStepCheckpoint = {
      stepId: outcome.stepId,
      tool: outcome.tool,
      ...(page !== undefined ? { page } : {}),
    };
    return { phase, ts: Date.now(), lastSuccessfulStep };
  }
  const lastFailure = classifyToolFailure(outcome);
  return {
    phase,
    ts: Date.now(),
    lastFailure,
    recovery: recoveryAdviceFor(lastFailure),
  };
}

export function checkpointForPlan(phase: AgentRunPhase, plan: Plan): AgentRunCheckpoint {
  return { phase, ts: Date.now(), planStepCount: plan.steps.length };
}

export function checkpointForDecision(
  phase: AgentRunPhase,
  plan: Plan,
  decision: AgentPlanDecisionCheckpoint,
): AgentRunCheckpoint {
  const skipped = new Set(decision.skippedStepIds);
  return {
    phase,
    ts: Date.now(),
    planStepCount: plan.steps.length,
    approvedStepCount: plan.steps.filter((step) => !skipped.has(step.id)).length,
    userDecision: decision,
  };
}

export function terminalCheckpoint(
  phase: AgentRunPhase,
  stoppedReason: string,
  failure?: AgentFailure,
): AgentRunCheckpoint {
  return {
    phase,
    ts: Date.now(),
    stoppedReason,
    ...(failure !== undefined ? { lastFailure: failure, recovery: recoveryAdviceFor(failure) } : {}),
  };
}
