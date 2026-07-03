import { beforeEach, describe, it, expect } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor, { parseDecision } from './reactor';

/**
 * Reactive-loop replay: a scripted provider returns one canned decision per turn, so the whole
 * perceive→decide→act loop — model turn → parse/validate → ToolGateway (Policy Kernel + HITL) →
 * observation fed back → next turn — runs deterministically with no network/key.
 */
class ScriptedProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  private turn = 0;
  constructor(private readonly replies: string[]) {}
  complete(req: CanonRequest, signal: AbortSignal): Promise<CanonResponse> {
    if (signal.aborted) throw new Error('aborted');
    const text = this.replies[this.turn] ?? '{"action":"finish","summary":"done"}';
    this.turn += 1;
    const inputTokens = req.messages.reduce((n, m) => n + m.content.length, 0);
    return Promise.resolve({
      text,
      stopReason: 'end',
      usage: { inputTokens, outputTokens: text.length },
      toolCalls: [],
    });
  }
}

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
    inputSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
    handler: () => {
      calls.push(id);
      return result;
    },
  };
}

const tools = () =>
  CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));

function script(replies: string[]): void {
  ModelGateway.reset();
  ModelGateway.register(new ScriptedProvider(replies));
}

const act = (tool: string, args: Record<string, unknown> = {}): string =>
  JSON.stringify({ action: 'act', tool, args, rationale: 'r' });
const finish = JSON.stringify({ action: 'finish', summary: 'done' });

beforeEach(() => {
  calls.length = 0;
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
  CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
  CapabilityRegistry.register(fakeTool('browser_update_page', 'state_changing', { ok: true }));
});

describe('parseDecision (untrusted LLM output boundary)', () => {
  it('parses an act decision, defaulting args/rationale', () => {
    expect(parseDecision('{"action":"act","tool":"browser_get_elements"}')).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: {},
      rationale: '',
    });
  });

  it('parses a finish decision and unwraps ```json fences', () => {
    expect(parseDecision('```json\n{"action":"finish","summary":"ok"}\n```')).toEqual({
      action: 'finish',
      summary: 'ok',
    });
  });

  it('rejects invalid JSON and unknown actions', () => {
    expect(() => parseDecision('not json')).toThrow();
    expect(() => parseDecision('{"action":"delete_all"}')).toThrow();
  });
});

describe('Reactor.run', () => {
  const req = (goal = 'do it') => ({ goal, tools: tools(), provider: 'anthropic' as const, model: 'mock' });

  it('runs the perceive→act→finish cycle, invoking each chosen tool in order', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), act('browser_update_page', { action: 'click', ref: 1 }), finish]);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('done');
    expect(calls).toEqual(['browser_get_elements', 'browser_update_page']);
  });

  it('feeds an unknown tool back as an observation without running anything', async () => {
    script([act('system_delete_everything'), finish]);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual([]);
  });

  it('halts on a policy/HITL denial (FORBIDDEN) of a state-changing call', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(false));
    script([act('browser_update_page', { action: 'click', ref: 1 }), finish]);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('tool_error');
    expect(res.outcomes[0]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual([]);
  });

  it('stops on the max-steps cap', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // Always reads (distinct args each turn so the loop detector does not fire first).
    const replies = Array.from({ length: 10 }, (_, i) => act('browser_get_elements', { n: i }));
    script(replies);
    const res = await Reactor.run(req(), { maxSteps: 3 });
    expect(res.stoppedReason).toBe('max_steps');
    expect(calls).toHaveLength(3);
  });

  it('stops when the same action repeats (Loop Detector)', async () => {
    script([act('browser_get_elements'), act('browser_get_elements'), act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { loopThreshold: 3 });
    expect(res.stoppedReason).toBe('loop_detected');
  });

  it('honors cancellation before the first model call', async () => {
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { signal: { aborted: true } });
    expect(res.stoppedReason).toBe('aborted');
    expect(calls).toEqual([]);
  });

  it('applies the post-step guard to hand off (e.g. CAPTCHA)', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { guard: () => 'handoff' });
    expect(res.stoppedReason).toBe('handoff');
  });

  it('applies ctxFor so the sensitive-site lockout denies a state-changing call', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_update_page', { url: 'https://mybank.com/transfer' }), finish]);
    const res = await Reactor.run(req(), {
      ctxFor: (_tool, args) => {
        const a = args as { url?: unknown };
        return typeof a.url === 'string' ? { targetUrl: a.url } : {};
      },
    });
    expect(res.stoppedReason).toBe('tool_error');
    expect(res.outcomes[0]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual([]);
  });
});
