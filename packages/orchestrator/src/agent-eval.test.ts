import { beforeEach, describe, it, expect } from 'vitest';
import { ModelGateway, MockProvider } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Planner from './planner';
import Executor from './executor';

/**
 * Deterministic agent-eval (golden-LLM replay). The MockProvider returns a canned plan, the registry
 * holds fake tools, and we assert the full loop — Planner (parse/validate/tool-check) → Executor →
 * ToolGateway (Policy Kernel + HITL) → outcomes — runs identically every time, with no network or
 * API key. This is the regression harness for the agent loop's behavior.
 */
const calls: string[] = [];

function fakeTool(id: string, dangerClass: RiskLevel, result: unknown): RegisteredTool<unknown> {
  const descriptor: ToolDescriptor = {
    id,
    description: `fake ${id}`,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
  };
  return {
    descriptor,
    inputSchema: {
      // Objects only. A validator that says yes to everything is refused at registration —
      // see CapabilityRegistry.register.
      safeParse: (data: unknown) =>
        typeof data === 'object' && data !== null
          ? { success: true as const, data }
          : { success: false as const, error: { issues: ['expected an object'] } },
    },
    handler: () => {
      calls.push(id);
      return result;
    },
  };
}

const GOLDEN_PLAN = JSON.stringify({
  goal: 'read the page then file a record',
  steps: [
    { id: 's1', tool: 'data_get_item', args: {}, rationale: 'read', dependsOn: [] },
    {
      id: 's2',
      tool: 'data_create_item',
      args: { name: 'x' },
      rationale: 'write',
      dependsOn: ['s1'],
    },
  ],
});

async function plan() {
  return Planner.plan({
    intent: 'do the demo task',
    tools: CapabilityRegistry.list().map((d) => ({
      id: d.id,
      description: d.description,
      dangerClass: d.dangerClass,
    })),
    provider: 'anthropic',
    model: 'mock',
  });
}

beforeEach(() => {
  calls.length = 0;
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
  ModelGateway.register(new MockProvider(GOLDEN_PLAN));
  CapabilityRegistry.register(fakeTool('data_get_item', 'read', { value: 42 }));
  CapabilityRegistry.register(fakeTool('data_create_item', 'state_changing', { id: 'rec-1' }));
});

describe('agent-eval: golden replay', () => {
  it('plans and runs to completion when HITL approves the state-changing step', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const p = await plan();
    expect(p.steps.map((s) => s.tool)).toEqual(['data_get_item', 'data_create_item']);

    const run = await Executor.run(p);
    expect(run.stoppedReason).toBe('completed');
    expect(run.outcomes.every((o) => o.ok)).toBe(true);
    expect(calls).toEqual(['data_get_item', 'data_create_item']); // both handlers actually ran, in order
  });

  it('halts at the state-changing step when HITL denies it', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(false));
    const run = await Executor.run(await plan());
    expect(run.stoppedReason).toBe('tool_error');
    expect(run.outcomes).toHaveLength(2);
    expect(run.outcomes[1]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual(['data_get_item']); // the denied write handler never executed
  });

  it('runs read-only steps with no HITL handler wired (auto-allow)', async () => {
    ModelGateway.reset();
    ModelGateway.register(
      new MockProvider(
        JSON.stringify({
          goal: 'just read',
          steps: [{ id: 'r1', tool: 'data_get_item', args: {}, rationale: 'read', dependsOn: [] }],
        }),
      ),
    );
    const run = await Executor.run(await plan());
    expect(run.stoppedReason).toBe('completed');
    expect(calls).toEqual(['data_get_item']);
  });

  it('applies per-step ctxFor so the sensitive-site lockout denies a state-changing call', async () => {
    ModelGateway.reset();
    ModelGateway.register(
      new MockProvider(
        JSON.stringify({
          goal: 'go to the bank',
          steps: [
            {
              id: 'b1',
              tool: 'data_create_item',
              args: { url: 'https://mybank.com/transfer' },
              rationale: '',
              dependsOn: [],
            },
          ],
        }),
      ),
    );
    ToolGateway.setConfirmHandler(() => Promise.resolve(true)); // even if approved, lockout must deny
    const run = await Executor.run(await plan(), {
      ctxFor: (step) => {
        const args = step.args as { url?: unknown };
        return typeof args.url === 'string' ? { targetUrl: args.url } : {};
      },
    });
    expect(run.stoppedReason).toBe('tool_error');
    expect(run.outcomes[0]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual([]); // handler never ran — denied before execution
  });

  it('rejects a plan that references an unregistered tool (LLM output is untrusted)', async () => {
    ModelGateway.reset();
    ModelGateway.register(
      new MockProvider(
        JSON.stringify({
          goal: 'escape',
          steps: [
            { id: 'x', tool: 'system_delete_everything', args: {}, rationale: '', dependsOn: [] },
          ],
        }),
      ),
    );
    await expect(plan()).rejects.toThrow();
  });
});
