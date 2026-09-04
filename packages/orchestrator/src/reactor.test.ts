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
import { COLLAPSED_WORKING_STATE_PLACEHOLDER, WORKING_STATE_HEADER } from './reactor-working-state';
import { contentToText } from '@tepegoz/model-gateway';

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
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('runs the perceive→act→finish cycle, invoking each chosen tool in order', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([
      act('browser_get_elements'),
      act('browser_update_page', { action: 'click', ref: 1 }),
      finish,
    ]);
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
    // would otherwise hard-stop a healthy multi-step task. A pure-read spin is bounded by maxSteps and,
    // past the (default 5) consecutive-identical cap, by the M1 read-streak guard below.
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

  it('M1: caps IDENTICAL CONSECUTIVE reads — one nudge at the threshold, then loop_detected', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // The read exemption's counterweight: a live trial burned 22 consecutive identical
    // browser_get_elements calls unpunished. With the default cap (5): reads 1–4 execute, the 5th is
    // NUDGED (skipped, structured observation), and a further identical read stops the run.
    const read = act('browser_get_elements');
    script([read, read, read, read, read, read]);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('loop_detected');
    expect(calls).toEqual([
      'browser_get_elements',
      'browser_get_elements',
      'browser_get_elements',
      'browser_get_elements',
    ]);
  });

  it('M1: the read streak resets on any different call — read-act-read never trips', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const read = act('browser_get_elements');
    // Two identical reads, an action, two identical reads again: with cap 3 neither block reaches it.
    script([
      read,
      read,
      act('browser_update_page', { action: 'click', ref: 1 }),
      read,
      read,
      finish,
    ]);
    const res = await Reactor.run(req(), { readLoopThreshold: 3 });
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual([
      'browser_get_elements',
      'browser_get_elements',
      'browser_update_page',
      'browser_get_elements',
      'browser_get_elements',
    ]);
  });

  it('M1: reads with DIFFERENT args are a healthy pattern, not a streak', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    // Paging/polling with changing args must never trip the cap (each signature differs).
    const replies = Array.from({ length: 6 }, (_, i) => act('browser_get_elements', { page: i }));
    script([...replies, finish]);
    const res = await Reactor.run(req(), { readLoopThreshold: 3 });
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toHaveLength(6);
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
        Promise.resolve(
          ctx.trigger === 'periodic'
            ? { done: true, finalAnswer: 'auto-complete' }
            : { done: false },
        ),
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('auto-complete');
    expect(calls).toHaveLength(3); // periodic check fires after 3 actions and ends the run
  });
});

/**
 * C1 (s15): the typed working state is what the MODEL actually receives. A capturing provider snapshots
 * the messages handed to it each turn, so we assert on the real injected context — not a unit render.
 */
class CapturingProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  private turn = 0;
  readonly turns: { role: string; content: string }[][] = [];
  constructor(private readonly replies: string[]) {}
  complete(req: CanonRequest): Promise<CanonResponse> {
    this.turns.push(req.messages.map((m) => ({ role: m.role, content: contentToText(m.content) })));
    const text = this.replies[this.turn] ?? '{"action":"finish","summary":"done"}';
    this.turn += 1;
    return Promise.resolve({
      text,
      stopReason: 'end',
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [],
    });
  }
}

const actWithState = (tool: string, state: Record<string, unknown>): string =>
  JSON.stringify({ action: 'act', tool, args: {}, rationale: 'r', state });

describe('Reactor.run typed working state (C1)', () => {
  const req = () => ({
    goal: 'do it',
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('injects the ledger into the messages the model receives, and merges across steps', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const provider = new CapturingProvider([
      actWithState('browser_update_page', { completedSubtasks: ['added to cart'] }),
      actWithState('browser_get_elements', { pendingVerifications: ['confirm order placed'] }),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Reactor.run(req());

    // Turn 0 saw no ledger yet (it is emitted on turn 0's decision).
    const turn0 = provider.turns[0] ?? [];
    expect(turn0.some((m) => m.content.includes(WORKING_STATE_HEADER))).toBe(false);

    // Turn 1 receives the ledger with turn 0's sub-task.
    const turn1 = provider.turns[1] ?? [];
    const ledger1 = turn1.find((m) => m.content.includes(WORKING_STATE_HEADER));
    expect(ledger1?.content).toContain('added to cart');

    // Turn 2 receives the MERGED ledger (sub-task carried forward + the new pending verification), and only
    // the latest block is live — the earlier one is collapsed to the placeholder.
    const turn2 = provider.turns[2] ?? [];
    const liveLedgers = turn2.filter((m) => m.content.includes(WORKING_STATE_HEADER));
    expect(liveLedgers).toHaveLength(1);
    expect(liveLedgers[0]?.content).toContain('added to cart');
    expect(liveLedgers[0]?.content).toContain('confirm order placed');
    expect(turn2.some((m) => m.content === COLLAPSED_WORKING_STATE_PLACEHOLDER)).toBe(true);
  });

  it('injects nothing when the model never emits state (byte-identical legacy path)', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    const provider = new CapturingProvider([
      act('browser_get_elements'),
      act('browser_get_elements'),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    await Reactor.run(req());
    const injectedAnywhere = provider.turns.some((turn) =>
      turn.some(
        (m) =>
          m.content.includes(WORKING_STATE_HEADER) ||
          m.content === COLLAPSED_WORKING_STATE_PLACEHOLDER,
      ),
    );
    expect(injectedAnywhere).toBe(false);
  });
});

describe('Reactor.run no-progress replan (C1 PR2)', () => {
  const goalReq = () => ({
    goal: 'do it',
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  /** Register a read tool + an update tool whose result is fixed, so we can drive stall vs progress. */
  function setupTools(updateResult: unknown): void {
    CapabilityRegistry.reset();
    ToolGateway.reset();
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
    CapabilityRegistry.register(fakeTool('browser_update_page', 'state_changing', updateResult));
  }

  it('fires a bounded replan after N no-progress acts and injects the new approach', async () => {
    // No `changed`/`filled`/`found` and a constant url ⇒ each VARIED update is a stall (exactly what the
    // identical-args loop detector misses). Varied refs keep the loop detector from tripping first.
    setupTools({ ok: true });
    const provider = new CapturingProvider([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    ModelGateway.reset();
    ModelGateway.register(provider);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 1,
      replan: (ctx) => {
        replanCalls += 1;
        expect(ctx.reason).toContain('acting steps');
        return Promise.resolve({ guidance: 'Open the menu and re-read.' });
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(1); // bounded by maxReplans
    // The 4th decision (turn index 3) must have seen the injected replan steer.
    const turn3 = provider.turns[3] ?? [];
    expect(turn3.some((m) => m.content.includes('Open the menu and re-read.'))).toBe(true);
    expect(turn3.some((m) => m.content.includes('DIFFERENT approach'))).toBe(true);
  });

  it('does not replan while the run is making progress (actions report changed:true)', async () => {
    setupTools({ changed: true, url: 'https://x', title: 'T' });
    script([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 2,
      replan: () => {
        replanCalls += 1;
        return Promise.resolve(null);
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(0);
  });

  it('fail-open: a throwing replan hook never kills the run', async () => {
    setupTools({ ok: true });
    script([
      act('browser_update_page', { ref: 1 }),
      act('browser_update_page', { ref: 2 }),
      act('browser_update_page', { ref: 3 }),
      act('browser_update_page', { ref: 4 }),
      finish,
    ]);
    const res = await Reactor.run(goalReq(), {
      noProgressThreshold: 3,
      maxReplans: 1,
      replan: () => Promise.reject(new Error('boom')),
    });
    expect(res.stoppedReason).toBe('completed');
  });

  /** C1 PR3: register a read-class escape tool + a normal read, so an escape does not trip the stall/loop
   *  detectors on its own — only the escape predicate should force the replan. */
  function setupEscapeTools(): void {
    CapabilityRegistry.reset();
    ToolGateway.reset();
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.register(fakeTool('web_search_items', 'read', { content: 'results' }));
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
  }

  it('C1 PR3: an escape-tool call forces a replan on the next step (no accumulated stalls needed)', async () => {
    setupEscapeTools();
    script([act('web_search_items', { q: 'how to save' }), act('browser_get_elements'), finish]);
    let replanCalls = 0;
    let sawEscapeReason = false;
    const res = await Reactor.run(goalReq(), {
      // Defaults (threshold 6, maxReplans 2): a single escape must still force the replan.
      replan: (ctx) => {
        replanCalls += 1;
        if (ctx.reason.includes('acting steps')) sawEscapeReason = true;
        return Promise.resolve({ guidance: 'Stay on the page; operate the form.' });
      },
      isEscapeTool: (tool) => tool === 'web_search_items',
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(1);
    expect(sawEscapeReason).toBe(true);
  });

  it('C1 PR3: without an escape predicate, the same escape does NOT trigger replan (legacy path)', async () => {
    setupEscapeTools();
    script([act('web_search_items', { q: 'how to save' }), act('browser_get_elements'), finish]);
    let replanCalls = 0;
    const res = await Reactor.run(goalReq(), {
      replan: () => {
        replanCalls += 1;
        return Promise.resolve(null);
      },
      // no isEscapeTool
    });
    expect(res.stoppedReason).toBe('completed');
    expect(replanCalls).toBe(0);
  });
});

describe('Reactor.run — navigation grounding + validator resilience', () => {
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('folds a navigation-grounding hint into the conversation after a browser_get_elements read', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    const seen: Array<[string, string]> = [];
    const res = await Reactor.run(req('open the blog'), {
      groundNavigation: (outcome, goal) => {
        seen.push([outcome.tool, goal]);
        return Promise.resolve('Grounded route → https://x/blog (a link visible on this page)');
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(seen).toEqual([['browser_get_elements', 'open the blog']]);
  });

  it('a grounding hook that returns null pushes nothing and the run continues', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(req(), { groundNavigation: () => Promise.resolve(null) });
    expect(res.stoppedReason).toBe('completed');
  });

  it('aborts right after grounding when the signal was tripped during the hook', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish, finish]);
    const signal = { aborted: false };
    const res = await Reactor.run(req(), {
      signal,
      groundNavigation: () => {
        signal.aborted = true;
        return Promise.resolve('hint');
      },
    });
    expect(res.stoppedReason).toBe('aborted');
  });

  it('a validateCompletion that THROWS fails open to "not done" — a validator hiccup never kills the run', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([finish, act('browser_get_elements'), finish, finish]);
    let n = 0;
    const res = await Reactor.run(req(), {
      maxSteps: 4,
      validateCompletion: () => {
        n += 1;
        return n === 1
          ? Promise.reject(new Error('validator boom'))
          : Promise.resolve({ done: true, finalAnswer: 'recovered' });
      },
    });
    expect(res.stoppedReason).toBe('completed');
    expect(res.summary).toBe('recovered');
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

describe('Reactor.run — run-control gate (mid-run steering + abort)', () => {
  const req = (goal = 'do it') => ({
    goal,
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  type Ctl = import('./run-control').RunControl;
  const control = (over: Partial<Ctl> = {}): Ctl => ({
    aborted: false,
    isHeld: () => false,
    waitWhileHeld: () => Promise.resolve(),
    drainSteer: () => [],
    modelSignal: () => new AbortController().signal,
    enterOfflineHold: () => undefined,
    enterHandoffHold: () => undefined,
    ...over,
  });

  it('folds a drained steer message into the conversation before the next decision', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    script([act('browser_get_elements'), finish]);
    let drained = false;
    const res = await Reactor.run(req(), {
      control: control({
        drainSteer: () => {
          if (drained) return [];
          drained = true;
          return ['also check the archive'];
        },
      }),
    });
    expect(res.stoppedReason).toBe('completed');
    expect(drained).toBe(true);
  });

  it('stops with stoppedReason "aborted" when control.aborted is set at the gate', async () => {
    script([finish]);
    const res = await Reactor.run(req(), { control: control({ aborted: true }) });
    expect(res.stoppedReason).toBe('aborted');
  });
});

describe('Reactor.run — urlFromOutcome tolerates a malformed result URL', () => {
  it('does not throw when a tool result carries an unparseable url', async () => {
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));
    CapabilityRegistry.reset();
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { url: 'http://[' }));
    script([act('browser_get_elements'), finish]);
    const res = await Reactor.run(
      {
        goal: 'go',
        tools: tools(),
        provider: 'anthropic' as const,
        model: 'mock',
      },
      { recallMemory: () => Promise.resolve(null) },
    );
    expect(res.stoppedReason).toBe('completed');
  });
});
