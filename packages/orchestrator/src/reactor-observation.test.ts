import { beforeEach, describe, it, expect } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor, ToolError } from '@tepegoz/shared-types';
import Reactor from './reactor';

/**
 * Observation-feedback slice of the reactive-loop replay: a scripted provider returns one canned
 * decision per turn, so the whole perceive→decide→act loop — model turn → parse/validate → ToolGateway
 * (Policy Kernel + HITL) → observation fed back → next turn — runs deterministically with no network/key.
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

describe('Reactor.run (observation feedback + recovery)', () => {
  const req = (goal = 'do it') => ({ goal, tools: tools(), provider: 'anthropic' as const, model: 'mock' });

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

  it('recovers from a malformed-args VALIDATION_ERROR: feeds the zod issues back, then completes on the corrected call', async () => {
    // A tool whose schema requires `text`; the gateway rejects the arg-less call BEFORE the handler runs
    // (so `calls` stays empty until the corrected call), attaching the zod issues as `details`.
    const schemaTool: RegisteredTool<unknown> = {
      descriptor: {
        id: 'data_create_item',
        description: 'fake data_create_item',
        dangerClass: 'state_changing',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: {
        safeParse: (data: unknown) => {
          const text = (data as { text?: unknown } | null)?.text;
          return typeof text === 'string' && text.length > 0
            ? { success: true, data }
            : { success: false, error: { issues: [{ path: ['text'], message: 'Required' }] } };
        },
      },
      handler: () => {
        calls.push('data_create_item');
        return { ok: true };
      },
    };
    CapabilityRegistry.reset();
    CapabilityRegistry.register(schemaTool);
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));

    // Recording provider so we can assert the concrete field error reaches the model's next prompt.
    const prompts: string[] = [];
    const replies = [
      act('data_create_item', {}), // rejected → VALIDATION_ERROR with issues
      act('data_create_item', { text: 'hello' }), // corrected → succeeds
      finish,
    ];
    let turn = 0;
    ModelGateway.reset();
    ModelGateway.register({
      id: 'anthropic',
      complete: (r: CanonRequest) => {
        prompts.push(r.messages.map((m) => m.content).join('\n'));
        const text = replies[turn] ?? finish;
        turn += 1;
        return Promise.resolve({
          text,
          stopReason: 'end' as const,
          usage: { inputTokens: 0, outputTokens: text.length },
          toolCalls: [],
        });
      },
    });

    const res = await Reactor.run(req('write an item'), { maxRecoveryAttempts: 1 });

    expect(res.stoppedReason).toBe('completed');
    expect(res.outcomes[0]?.ok).toBe(false);
    expect(res.outcomes[0]?.error?.code).toBe('VALIDATION_ERROR');
    // The handler ran exactly once — on the corrected call, never on the rejected one.
    expect(calls).toEqual(['data_create_item']);
    // The rejected call's field error was fed back so the model could fix it (turn 2 sees "text: Required").
    expect(prompts.some((p) => p.includes('text: Required'))).toBe(true);
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
