import { beforeEach, describe, it, expect } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';

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
    expect(res.stoppedReason).toBe('policy_denied');
    expect(res.failure?.kind).toBe('policy_denied');
    expect(res.outcomes[0]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual([]);
  });

  it('stops on the max-steps cap', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // Always reads (a 'read' tool, exempt from the loop detector), so only the maxSteps cap can stop it.
    const replies = Array.from({ length: 10 }, (_, i) => act('browser_get_elements', { n: i }));
    script(replies);
    const res = await Reactor.run(req(), { maxSteps: 3 });
    expect(res.stoppedReason).toBe('max_steps');
    expect(calls).toHaveLength(3);
  });

  it('exempts idempotent reads from the loop detector (state-every-step is not a loop)', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // Four identical browser_get_elements reads (a 'read' tool) — well past loopThreshold — must NOT trip
    // the detector: re-reading the page is the encouraged pattern, and the run-global signature counter
    // would otherwise hard-stop a healthy multi-step task. Only maxSteps bounds a pure-read spin.
    script([
      act('browser_get_elements'),
      act('browser_get_elements'),
      act('browser_get_elements'),
      act('browser_get_elements'),
      finish,
    ]);
    const res = await Reactor.run(req(), { loopThreshold: 3 });
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual([
      'browser_get_elements',
      'browser_get_elements',
      'browser_get_elements',
      'browser_get_elements',
    ]);
  });

  it('stops when a state-changing action repeats past the nudge (Loop Detector)', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // Threshold 3: the 3rd identical click fires a recovery nudge (skipped, not executed); only a 4th
    // identical repeat after the nudge is conceded as a real loop. Reads are exempt, so the detector is
    // exercised with a state-changing action.
    const click = act('browser_update_page', { action: 'click', ref: 1 });
    script([click, click, click, click]);
    const res = await Reactor.run(req(), { loopThreshold: 3 });
    expect(res.stoppedReason).toBe('loop_detected');
    // Boundary: the 1st and 2nd clicks executed; the 3rd was nudged (skipped) and the 4th tripped the stop.
    expect(calls).toEqual(['browser_update_page', 'browser_update_page']);
  });

  it('nudges once on a repeat and recovers when the model then switches action', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // 3rd identical click triggers the nudge (skipped, not executed); the model then advances with a
    // different action (ref 2) instead of looping, so the run proceeds to completion — proving 3 identical
    // state-changing calls do NOT stop when followed by a distinct action.
    const click = act('browser_update_page', { action: 'click', ref: 1 });
    script([click, click, click, act('browser_update_page', { action: 'click', ref: 2 }), finish]);
    const res = await Reactor.run(req(), { loopThreshold: 3 });
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual(['browser_update_page', 'browser_update_page', 'browser_update_page']);
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
    expect(res.stoppedReason).toBe('policy_denied');
    expect(res.failure?.kind).toBe('policy_denied');
    expect(res.outcomes[0]?.error?.code).toBe('FORBIDDEN');
    expect(calls).toEqual([]);
  });

  it('repairs malformed model decisions with a bounded JSON retry', async () => {
    script(['not-json', act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { maxDecisionRepairs: 1 });
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual(['browser_get_elements']);
  });

  it('AI-3 validator: challenges a premature finish, then completes when the validator confirms done', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([finish, act('browser_get_elements'), finish]);
    let validatorCalls = 0;
    const res = await Reactor.run(req(), {
      validateCompletion: () => {
        validatorCalls += 1;
        return Promise.resolve(
          validatorCalls === 1
            ? { done: false, reason: 'the blog was not actually opened' }
            : { done: true, finalAnswer: 'Latest post: Hello World' },
        );
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('Latest post: Hello World'); // the validator's answer is authoritative
    expect(validatorCalls).toBe(2);
    expect(calls).toEqual(['browser_get_elements']); // the challenge forced one more action
  });

  it('AI-3 validator: accepts a genuine completion claim and returns the final answer', async () => {
    script([finish]);
    const res = await Reactor.run(req(), {
      validateCompletion: () => Promise.resolve({ done: true, finalAnswer: 'the answer' }),
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('the answer');
  });

  it('AI-3 validator: fails closed to the actor claim after maxCompletionRejects rejections', async () => {
    script([finish, finish, finish]);
    let validatorCalls = 0;
    const res = await Reactor.run(req(), {
      maxCompletionRejects: 2,
      validateCompletion: () => {
        validatorCalls += 1;
        return Promise.resolve({ done: false, reason: 'never satisfied' });
      },
    });
    expect(res.stoppedReason).toBe('completed'); // conceded rather than burning the whole step budget
    expect(res.summary).toBe('done');
    expect(validatorCalls).toBe(3); // rejects 1,2 continue; the 3rd exceeds the cap and concedes
  });

  it('AI-3 validator: a periodic pass can end the run when the goal is already met', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script(Array.from({ length: 10 }, (_, i) => act('browser_get_elements', { n: i })));
    const res = await Reactor.run(req(), {
      planningInterval: 3,
      validateCompletion: (ctx) =>
        Promise.resolve(ctx.trigger === 'periodic' ? { done: true, finalAnswer: 'auto-complete' } : { done: false }),
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('auto-complete');
    expect(calls).toHaveLength(3); // periodic check fires after 3 actions and ends the run
  });
});
