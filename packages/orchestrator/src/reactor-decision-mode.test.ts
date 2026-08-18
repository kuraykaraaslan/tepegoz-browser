import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import {
  ModelGateway,
  type CanonRequest,
  type CanonResponse,
  type CanonToolCall,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import { contentToText } from '@tepegoz/model-gateway';
import Reactor from './reactor';
import { parseNativeDecision } from './reactor-decision';
import { DECISION_TOOL_NAME, decisionToolDef, resolveDecisionMode } from './reactor-decision-mode';

/** A provider that answers with NATIVE tool calls, one scripted decision per turn. */
class NativeProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  readonly supportsNativeTools = true;
  readonly requests: CanonRequest[] = [];
  private turn = 0;
  constructor(private readonly decisions: readonly unknown[]) {}
  complete(req: CanonRequest): Promise<CanonResponse> {
    // The reactor mutates ONE messages array across the run, so a live reference would show every
    // later turn too. Snapshot it to assert on what this call actually carried.
    this.requests.push({ ...req, messages: [...req.messages] });
    const input = this.decisions[this.turn] ?? { action: 'finish', summary: 'done' };
    this.turn += 1;
    return Promise.resolve({
      text: '',
      stopReason: 'tool_use',
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [{ name: DECISION_TOOL_NAME, input, id: 'toolu_' + String(this.turn) }],
    });
  }
}

/** The legacy arm: JSON inside prose, no native support declared. */
class JsonProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  readonly requests: CanonRequest[] = [];
  private turn = 0;
  constructor(private readonly replies: readonly string[]) {}
  complete(req: CanonRequest): Promise<CanonResponse> {
    // The reactor mutates ONE messages array across the run, so a live reference would show every
    // later turn too. Snapshot it to assert on what this call actually carried.
    this.requests.push({ ...req, messages: [...req.messages] });
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

const calls: string[] = [];

function fakeTool(id: string, dangerClass: RiskLevel): RegisteredTool<unknown> {
  const descriptor: ToolDescriptor = {
    id,
    description: 'fake ' + id,
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
      return { ok: true };
    },
  };
}

const tools = () =>
  CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));

function response(over: Partial<CanonResponse> = {}): CanonResponse {
  return {
    text: '',
    stopReason: 'tool_use',
    usage: { inputTokens: 1, outputTokens: 1 },
    toolCalls: [],
    ...over,
  };
}

const savedEnv = process.env.TEPEGOZ_DECISION_MODE;

beforeEach(() => {
  calls.length = 0;
  delete process.env.TEPEGOZ_DECISION_MODE;
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
  CapabilityRegistry.register(fakeTool('browser_get_elements', 'read'));
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.TEPEGOZ_DECISION_MODE;
  else process.env.TEPEGOZ_DECISION_MODE = savedEnv;
});

describe('resolveDecisionMode', () => {
  it('defaults to native when the registered adapter supports it', () => {
    ModelGateway.register(new NativeProvider([]));
    expect(resolveDecisionMode('anthropic')).toBe('native');
  });

  it('falls back to JSON when the adapter does not support native tools', () => {
    ModelGateway.register(new JsonProvider([]));
    expect(resolveDecisionMode('anthropic')).toBe('json');
  });

  it('TEPEGOZ_DECISION_MODE=json forces the legacy arm on a native-capable provider', () => {
    ModelGateway.register(new NativeProvider([]));
    process.env.TEPEGOZ_DECISION_MODE = 'json';
    expect(resolveDecisionMode('anthropic')).toBe('json');
  });

  it('TEPEGOZ_DECISION_MODE=native degrades rather than failing every turn off a native provider', () => {
    ModelGateway.register(new JsonProvider([]));
    process.env.TEPEGOZ_DECISION_MODE = 'native';
    expect(resolveDecisionMode('anthropic')).toBe('json');
  });

  it('an explicit option beats the environment (so a test never depends on process env)', () => {
    ModelGateway.register(new NativeProvider([]));
    process.env.TEPEGOZ_DECISION_MODE = 'native';
    expect(resolveDecisionMode('anthropic', 'json')).toBe('json');
  });
});

describe('parseNativeDecision', () => {
  it('settles the decision out of the named tool call', () => {
    const decision = parseNativeDecision(
      response({
        toolCalls: [
          { name: DECISION_TOOL_NAME, input: { action: 'act', tool: 'browser_get_page', args: {} } },
        ],
      }),
    );
    expect(decision).toMatchObject({ action: 'act', tool: 'browser_get_page' });
  });

  it('accepts a single call under a different name (a renamed tool still states the intent)', () => {
    const decision = parseNativeDecision(
      response({ toolCalls: [{ name: 'decide', input: { action: 'finish', summary: 'all done' } }] }),
    );
    expect(decision).toMatchObject({ action: 'finish', summary: 'all done' });
  });

  it('falls back to the JSON path when the model answered in prose despite the forced tool', () => {
    const decision = parseNativeDecision(
      response({ text: '{"action":"finish","summary":"prose"}', toolCalls: [], stopReason: 'end' }),
    );
    expect(decision).toMatchObject({ action: 'finish', summary: 'prose' });
  });

  it('rejects an empty turn as a transport failure, not a bad decision', () => {
    expect(() => parseNativeDecision(response({ text: '  ' }))).toThrow(/empty turn/i);
  });

  it('rejects a structurally wrong decision through the same zod settle step as the JSON arm', () => {
    const bad: CanonToolCall = { name: DECISION_TOOL_NAME, input: { action: 'act' } };
    expect(() => parseNativeDecision(response({ toolCalls: [bad] }))).toThrow(/malformed decision/i);
  });
});

describe('Reactor decision transport', () => {
  const req = () => ({ goal: 'do it', tools: tools(), provider: 'anthropic' as const, model: 'mock' });

  it('native arm: sends exactly one required tool and completes the run off tool calls', async () => {
    const provider = new NativeProvider([
      { action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' },
      { action: 'finish', summary: 'done' },
    ]);
    ModelGateway.register(provider);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual(['browser_get_elements']);
    const sent = provider.requests[0];
    expect(sent?.tools?.map((t) => t.name)).toEqual([DECISION_TOOL_NAME]);
    expect(sent?.toolChoice).toEqual({ type: 'tool', name: DECISION_TOOL_NAME });
    // The transport replaces the json_object nudge; sending both would be two changes, not one.
    expect(sent?.responseFormat).toBeUndefined();
  });

  it('json arm: sends no tools and keeps the json_object nudge', async () => {
    const provider = new JsonProvider([
      JSON.stringify({ action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' }),
      JSON.stringify({ action: 'finish', summary: 'done' }),
    ]);
    ModelGateway.register(provider);
    const res = await Reactor.run(req());
    expect(res.stoppedReason).toBe('completed');
    expect(calls).toEqual(['browser_get_elements']);
    expect(provider.requests[0]?.tools).toBeUndefined();
    expect(provider.requests[0]?.responseFormat).toBe('json');
  });

  it('both arms send the byte-identical system prompt (what makes the paired sweep single-variable)', async () => {
    const native = new NativeProvider([{ action: 'finish', summary: 'done' }]);
    ModelGateway.register(native);
    await Reactor.run(req());
    ModelGateway.reset();
    const json = new JsonProvider([JSON.stringify({ action: 'finish', summary: 'done' })]);
    ModelGateway.register(json);
    await Reactor.run(req());
    const systemOf = (r: CanonRequest | undefined): unknown =>
      r?.messages.find((m) => m.role === 'system')?.content;
    expect(systemOf(native.requests[0])).toBe(systemOf(json.requests[0]));
  });

  it('a native turn with empty text still records a non-empty assistant history entry', async () => {
    const provider = new NativeProvider([
      { action: 'act', tool: 'browser_get_elements', args: {}, rationale: 'r' },
      { action: 'finish', summary: 'done' },
    ]);
    ModelGateway.register(provider);
    await Reactor.run(req());
    const assistantTurns = (provider.requests[1]?.messages ?? []).filter((m) => m.role === 'assistant');
    expect(assistantTurns).toHaveLength(1);
    expect(contentToText(assistantTurns[0]?.content ?? '')).toContain('browser_get_elements');
  });

  it('the decision tool schema mirrors the decision contract, including the progress brain', () => {
    const schema = decisionToolDef().inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['action', 'tool', 'args', 'summary', 'memory', 'next_goal', 'state']),
    );
    expect(schema.required).toEqual(['action']);
  });
});
