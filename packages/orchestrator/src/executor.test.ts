import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry, ToolGateway, type InputValidator } from '@tepegoz/capability-plane';
import type { Plan, PlanStep, RiskLevel } from '@tepegoz/shared-types';
import Executor from './executor';

const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) => ({ success: true, data: (typeof d === 'object' && d !== null ? d : {}) as Record<string, unknown> }),
};

function reg(id: string, dangerClass: RiskLevel, handler: (args: unknown) => unknown = () => 'ok'): void {
  CapabilityRegistry.register({
    descriptor: { id, description: 't', dangerClass, source: 'builtin', inputSchema: {}, requiresIdempotencyKey: false },
    inputSchema: passAny,
    handler,
  });
}

function step(id: string, tool: string, args: unknown = {}): PlanStep {
  return { id, tool, args, rationale: '', dependsOn: [] };
}
function plan(steps: PlanStep[]): Plan {
  return { goal: '', steps };
}

beforeEach(() => {
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

describe('Executor.run', () => {
  it('runs steps sequentially through the gateway and collects results', async () => {
    reg('browser_get_page', 'read', () => 'A');
    reg('tab_list_items', 'read', () => 'B');
    const r = await Executor.run(plan([step('s1', 'browser_get_page'), step('s2', 'tab_list_items')]));
    expect(r.stoppedReason).toBe('completed');
    expect(r.outcomes.map((o) => o.result)).toEqual(['A', 'B']);
  });

  it('halts on the first tool error (e.g. a policy denial)', async () => {
    reg('file_delete_item', 'destructive'); // ask + no confirm handler → FORBIDDEN
    const r = await Executor.run(plan([step('s1', 'file_delete_item')]));
    expect(r.stoppedReason).toBe('tool_error');
    expect(r.outcomes[0]?.ok).toBe(false);
  });

  it('stops on a repeated action (loop detector)', async () => {
    reg('browser_get_page', 'read');
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'browser_get_page'), step('s3', 'browser_get_page')]),
      { loopThreshold: 3 },
    );
    expect(r.stoppedReason).toBe('loop_detected');
    expect(r.outcomes).toHaveLength(2);
  });

  it('caps at MAX_AGENT_STEPS', async () => {
    reg('browser_get_page', 'read');
    const r = await Executor.run(plan([step('s1', 'browser_get_page'), step('s2', 'browser_get_page')]), {
      maxSteps: 1,
    });
    expect(r.stoppedReason).toBe('max_steps');
    expect(r.outcomes).toHaveLength(1);
  });
});
