import { beforeEach, describe, it, expect } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor, ToolError } from '@tepegoz/shared-types';
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

function fakeToolSequence(id: string, dangerClass: RiskLevel, results: unknown[]): RegisteredTool<unknown> {
  let index = 0;
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
      const result = results[Math.min(index, results.length - 1)];
      index += 1;
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
const toolError = (code: ToolError['code'], message: string, retryable: boolean): ToolError => ({
  isError: true,
  code,
  message,
  retryable,
});

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

  it('rejects invalid JSON and shapes with no salvageable decision', () => {
    expect(() => parseDecision('not json')).toThrow(); // unparseable
    expect(() => parseDecision('{"action":"act"}')).toThrow(); // act with no tool
    expect(() => parseDecision('{"foo":"bar"}')).toThrow(); // no discriminator / tool / summary
  });

  it('coerces a tool id placed directly in the action field into an act decision', () => {
    // Observed from gpt-4o: {"action":"<toolid>", "args":{…}} instead of action:"act" + tool:"<id>".
    expect(
      parseDecision('{"action":"browser_update_location","args":{"url":"https://www.google.com"}}'),
    ).toEqual({
      action: 'act',
      tool: 'browser_update_location',
      args: { url: 'https://www.google.com' },
      rationale: '',
    });
  });

  it('promotes a tool-id-in-action over a bogus tool field (e.g. a misplaced ref number)', () => {
    // Observed from gpt-4o: the real tool id landed in `action`, while `tool` held the ref "21".
    expect(
      parseDecision(
        '{"action":"browser_update_page","tool":"21","args":{"action":"fill","ref":21,"text":"x"}}',
      ),
    ).toEqual({
      action: 'act',
      tool: 'browser_update_page',
      args: { action: 'fill', ref: 21, text: 'x' },
      rationale: '',
    });
  });

  it('parses the AI-3 progress brain (evaluation_previous_goal / memory / next_goal)', () => {
    expect(
      parseDecision(
        '{"action":"act","tool":"browser_get_elements","evaluation_previous_goal":"ok","memory":"1 of 3 done","next_goal":"open item 2"}',
      ),
    ).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: {},
      rationale: '',
      evaluation_previous_goal: 'ok',
      memory: '1 of 3 done',
      next_goal: 'open item 2',
    });
  });

  it('omits absent brain fields (weak models that skip them still parse)', () => {
    expect(parseDecision('{"action":"finish","summary":"ok"}')).toEqual({ action: 'finish', summary: 'ok' });
  });

  it('coerces weak-model near-miss shapes (missing action, "arguments" alias, envelope)', () => {
    // No `action`, tool present, OpenAI-style "arguments" key.
    expect(parseDecision('{"tool":"browser_get_elements","arguments":{"ref":"e1"}}')).toEqual({
      action: 'act',
      tool: 'browser_get_elements',
      args: { ref: 'e1' },
      rationale: '',
    });
    // No `action`, only a summary ⇒ finish.
    expect(parseDecision('{"summary":"done"}')).toEqual({ action: 'finish', summary: 'done' });
    // Wrapped in a single-object envelope.
    expect(parseDecision('{"decision":{"action":"finish","summary":"ok"}}')).toEqual({
      action: 'finish',
      summary: 'ok',
    });
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
    expect(res.stoppedReason).toBe('policy_denied');
    expect(res.failure?.kind).toBe('policy_denied');
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

  it('feeds stale element failures back with a recovery hint, then continues from a fresh snapshot', async () => {
    CapabilityRegistry.reset();
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'fresh elements' }));
    CapabilityRegistry.register(
      fakeTool(
        'browser_update_page',
        'state_changing',
        toolError('INTERNAL_ERROR', 'stale ref: element not found in latest snapshot', true),
      ),
    );
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([
      act('browser_update_page', { action: 'click', ref: 99 }),
      act('browser_get_elements'),
      finish,
    ]);
    const res = await Reactor.run(req(), { maxRecoveryAttempts: 1 });
    expect(res.stoppedReason).toBe('completed');
    expect(res.outcomes[0]?.ok).toBe(false);
    expect(res.outcomes[0]?.error?.message).toContain('stale ref');
    expect(calls).toEqual(['browser_update_page', 'browser_get_elements']);
  });

  it('fixture: falls back to a screenshot when text/a11y has no useful elements', async () => {
    CapabilityRegistry.reset();
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'No actionable elements', elements: [] }));
    CapabilityRegistry.register(
      fakeTool('browser_get_screenshot', 'read', {
        content: 'Viewport screenshot captured from https://fixture.local',
        mimeType: 'image/png',
        width: 640,
        height: 480,
      }),
    );
    script([act('browser_get_elements'), act('browser_get_screenshot'), finish]);

    const res = await Reactor.run(req('inspect a canvas-only form'));

    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual(['browser_get_elements', 'browser_get_screenshot']);
  });

  it('fixture: recovers a form action by re-reading elements and trying an alternate ref', async () => {
    CapabilityRegistry.reset();
    CapabilityRegistry.register(
      fakeToolSequence('browser_get_elements', 'read', [
        { content: '1. button "Continue"\n2. button "Submit order"' },
        { content: '1. button "Continue"\n2. button "Submit order"' },
      ]),
    );
    CapabilityRegistry.register(
      fakeToolSequence('browser_update_page', 'state_changing', [
        {
          ok: true,
          changed: false,
          recoveryHint: 'No visible change was detected. Re-read browser_get_elements and try a different ref.',
        },
        { ok: true, changed: true, url: 'https://fixture.local/done', title: 'Done' },
      ]),
    );
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([
      act('browser_get_elements'),
      act('browser_update_page', { action: 'click', ref: 1 }),
      act('browser_get_elements'),
      act('browser_update_page', { action: 'click', ref: 2 }),
      finish,
    ]);

    const res = await Reactor.run(req('submit the fixture form'));

    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual([
      'browser_get_elements',
      'browser_update_page',
      'browser_get_elements',
      'browser_update_page',
    ]);
    expect(res.outcomes[1]?.result).toMatchObject({ changed: false });
    expect(res.outcomes[3]?.result).toMatchObject({ changed: true });
  });

  it('keeps only the latest page-state blob live, collapsing superseded ones (AI-3 transient state)', async () => {
    // Two distinct LARGE observations (> collapse threshold); the earlier one must be collapsed by the
    // time the model is called for the finish decision, so DOM dumps never accumulate.
    const big1 = `ELEMENTS-ONE ${'A'.repeat(1000)}`;
    const big2 = `ELEMENTS-TWO ${'B'.repeat(1000)}`;
    CapabilityRegistry.reset();
    CapabilityRegistry.register(fakeToolSequence('browser_get_elements', 'read', [{ content: big1 }, { content: big2 }]));

    class RecordingProvider implements ModelProvider {
      readonly id: AIProvider = 'anthropic';
      readonly turns: string[][] = [];
      constructor(private readonly replies: string[]) {}
      complete(request: CanonRequest): Promise<CanonResponse> {
        this.turns.push(request.messages.map((m) => m.content));
        const text = this.replies[this.turns.length - 1] ?? finish;
        return Promise.resolve({ text, stopReason: 'end', usage: { inputTokens: 1, outputTokens: 1 }, toolCalls: [] });
      }
    }
    const provider = new RecordingProvider([
      act('browser_get_elements', { n: 1 }),
      act('browser_get_elements', { n: 2 }),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);

    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('completed');

    // At the finish turn (3rd model call) the latest blob is full; the earlier one is collapsed away.
    const finishTurn = provider.turns[2] ?? [];
    const joined = finishTurn.join('\n');
    expect(joined).toContain('ELEMENTS-TWO');
    expect(joined).not.toContain('ELEMENTS-ONE');
    expect(joined).toContain('an earlier page snapshot was omitted');
  });

  it('fixture: reads table-like page content before finishing', async () => {
    CapabilityRegistry.reset();
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', {
        content: 'Product | Price\nA | $10\nB | $12',
        url: 'https://fixture.local/table',
        title: 'Fixture table',
      }),
    );
    script([act('browser_get_page'), JSON.stringify({ action: 'finish', summary: 'A costs $10; B costs $12.' })]);

    const res = await Reactor.run(req('summarize the table'));

    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('A costs $10; B costs $12.');
    expect(calls).toEqual(['browser_get_page']);
  });
});

describe('Reactor system prompt (coreference + browsing strategy)', () => {
  /** Captures the system message the model receives so we can assert its guidance. */
  class CapturingProvider implements ModelProvider {
    readonly id: AIProvider = 'anthropic';
    system = '';
    complete(request: CanonRequest): Promise<CanonResponse> {
      this.system = request.messages.find((m) => m.role === 'system')?.content ?? '';
      return Promise.resolve({
        text: finish,
        stopReason: 'end',
        usage: { inputTokens: 1, outputTokens: 1 },
        toolCalls: [],
      });
    }
  }

  const capture = async (history?: CanonRequest['messages']): Promise<string> => {
    const provider = new CapturingProvider();
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Reactor.run({
      goal: 'do it',
      tools: tools(),
      provider: 'anthropic',
      model: 'mock',
      ...(history !== undefined ? { history } : {}),
    });
    return provider.system;
  };

  it('adds the coreference instruction ONLY when there are prior turns', async () => {
    const withHistory = await capture([
      { role: 'user', content: 'Atatürk' },
      { role: 'assistant', content: 'searched Atatürk' },
    ]);
    expect(withHistory).toContain('earlier turns of the SAME conversation');

    const withoutHistory = await capture();
    expect(withoutHistory).not.toContain('earlier turns of the SAME conversation');
  });

  it('always prefers reusing the current tab over opening a new one', async () => {
    expect(await capture()).toContain('Prefer to stay in the CURRENT tab');
  });

  it('mentions screenshot fallback and changed=false recovery', async () => {
    const prompt = await capture();
    expect(prompt).toContain('browser_get_screenshot');
    expect(prompt).toContain('changed=false');
  });

  it('guides opening hidden menus/drawers and trying conventional URL paths before giving up', async () => {
    const prompt = await capture();
    expect(prompt).toContain('REVEAL hidden navigation');
    expect(prompt).toContain('collapsed menu');
    expect(prompt).toContain('/blog');
  });

  it('requests the progress brain (memory ledger) so the actor tracks progress and does not give up', async () => {
    const prompt = await capture();
    expect(prompt).toContain('evaluation_previous_goal');
    expect(prompt).toContain('next_goal');
    expect(prompt).toContain('running progress ledger');
  });
});
