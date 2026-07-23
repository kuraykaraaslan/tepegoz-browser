import { describe, expect, it } from 'vitest';
import type { Plan } from '@tepegoz/shared-types';
import type { StepOutcome } from '@tepegoz/orchestrator';
import {
  advanceRunPhase,
  checkpointForDecision,
  checkpointForPlan,
  checkpointFromOutcome,
  isTerminalPhase,
  terminalCheckpoint,
} from './run-lifecycle';

const PLAN: Plan = {
  goal: 'demo',
  steps: [
    { id: 's1', tool: 'browser_get_page', args: {}, rationale: 'read', dependsOn: [] },
    { id: 's2', tool: 'browser_update_page', args: { action: 'click', ref: 1 }, rationale: 'act', dependsOn: [] },
  ],
};

describe('agent run lifecycle', () => {
  it('enforces explicit phase transitions', () => {
    let phase = advanceRunPhase('requested', 'start_planning');
    phase = advanceRunPhase(phase, 'plan_ready');
    phase = advanceRunPhase(phase, 'plan_approved');
    phase = advanceRunPhase(phase, 'execution_started');
    phase = advanceRunPhase(phase, 'complete');
    expect(phase).toBe('done');
    expect(isTerminalPhase(phase)).toBe(true);
    expect(() => advanceRunPhase('requested', 'complete')).toThrow(/Invalid agent run transition/);
  });

  it('records plan and user-decision checkpoint fields', () => {
    expect(checkpointForPlan('awaiting_plan', PLAN)).toMatchObject({
      phase: 'awaiting_plan',
      planStepCount: 2,
    });
    expect(
      checkpointForDecision('awaiting_plan', PLAN, { approved: true, skippedStepIds: ['s2'] }),
    ).toMatchObject({
      phase: 'awaiting_plan',
      planStepCount: 2,
      approvedStepCount: 1,
      userDecision: { approved: true, skippedStepIds: ['s2'] },
    });
  });

  it('records the last successful step with tab/page snapshot metadata', () => {
    const outcome: StepOutcome = {
      stepId: 'r1',
      tool: 'browser_get_page',
      args: { tabId: 'tab-1' },
      ok: true,
      result: { url: 'https://example.com', title: 'Example', content: 'hello' },
      durationMs: 42,
    };
    expect(checkpointFromOutcome('executing', outcome)).toMatchObject({
      phase: 'executing',
      lastSuccessfulStep: {
        stepId: 'r1',
        tool: 'browser_get_page',
        page: {
          tabId: 'tab-1',
          url: 'https://example.com',
          title: 'Example',
          snapshotRef: 'runtime://r1',
        },
      },
    });
  });

  it('records classified failure and recovery advice in terminal checkpoints', () => {
    const checkpoint = terminalCheckpoint('error', 'model_malformed', {
      kind: 'model_malformed',
      message: 'Agent returned invalid JSON',
      retryable: true,
    });
    expect(checkpoint).toMatchObject({
      phase: 'error',
      stoppedReason: 'model_malformed',
      lastFailure: { kind: 'model_malformed' },
      recovery: { retryable: true },
    });
  });
});
