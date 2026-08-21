import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry, ToolGateway, type InputValidator } from '@tepegoz/capability-plane';
import type { Plan, PlanStep, RiskLevel } from '@tepegoz/shared-types';
import Executor from './executor';

/** Accepts any OBJECT, and rejects anything that is not one — what every real tool schema does. A
 *  validator that accepts everything is refused by `CapabilityRegistry.register`. */
const passAny: InputValidator<Record<string, unknown>> = {
  safeParse: (d) =>
    typeof d === 'object' && d !== null && !Array.isArray(d)
      ? { success: true, data: d as Record<string, unknown> }
      : { success: false, error: { issues: ['expected an object'] } },
};

function reg(
  id: string,
  dangerClass: RiskLevel,
  handler: (args: unknown) => unknown = () => 'ok',
): void {
  CapabilityRegistry.register({
    descriptor: {
      id,
      description: 't',
      dangerClass,
      source: 'builtin',
      inputSchema: {},
      requiresIdempotencyKey: false,
    },
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
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'tab_list_items')]),
    );
    expect(r.stoppedReason).toBe('completed');
    expect(r.outcomes.map((o) => o.result)).toEqual(['A', 'B']);
  });

  it('records a per-step duration from the injected clock', async () => {
    reg('browser_get_page', 'read', () => 'A');
    reg('tab_list_items', 'read', () => 'B');
    // 0→120 for the first step, 120→200 for the second (start/end read per step).
    const ticks = [0, 120, 120, 200];
    let i = 0;
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'tab_list_items')]),
      {
        now: () => ticks[i++] ?? 200,
      },
    );
    expect(r.outcomes.map((o) => o.durationMs)).toEqual([120, 80]);
  });

  it('times a failing step too — a slow failure must still be measured', async () => {
    reg('browser_get_page', 'read', () => {
      throw new Error('boom');
    });
    const ticks = [0, 5_000];
    let i = 0;
    const r = await Executor.run(plan([step('s1', 'browser_get_page')]), {
      now: () => ticks[i++] ?? 5_000,
    });
    expect(r.outcomes[0]?.ok).toBe(false);
    expect(r.outcomes[0]?.durationMs).toBe(5_000);
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
      plan([
        step('s1', 'browser_get_page'),
        step('s2', 'browser_get_page'),
        step('s3', 'browser_get_page'),
      ]),
      { loopThreshold: 3 },
    );
    expect(r.stoppedReason).toBe('loop_detected');
    expect(r.outcomes).toHaveLength(2);
  });

  it('caps at MAX_AGENT_STEPS', async () => {
    reg('browser_get_page', 'read');
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'browser_get_page')]),
      {
        maxSteps: 1,
      },
    );
    expect(r.stoppedReason).toBe('max_steps');
    expect(r.outcomes).toHaveLength(1);
  });

  it('halts on a post-step guard directive (human handoff) without running later steps', async () => {
    reg('browser_get_page', 'read', () => 'captcha page');
    reg('tab_create_item', 'read', () => 'should not run');
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'tab_create_item')]),
      { guard: (o) => (o.result === 'captcha page' ? 'handoff' : null) },
    );
    expect(r.stoppedReason).toBe('handoff');
    expect(r.outcomes).toHaveLength(1);
  });

  it('continues when the guard returns null', async () => {
    reg('browser_get_page', 'read', () => 'clean');
    reg('tab_list_items', 'read', () => 'B');
    const r = await Executor.run(
      plan([step('s1', 'browser_get_page'), step('s2', 'tab_list_items')]),
      {
        guard: () => null,
      },
    );
    expect(r.stoppedReason).toBe('completed');
    expect(r.outcomes).toHaveLength(2);
  });
});
