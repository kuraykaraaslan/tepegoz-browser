import { beforeEach, describe, it, expect } from 'vitest';
import { ModelGateway, type CanonRequest, type CanonResponse, type ModelProvider } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';

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

describe('Reactor.run (transient page-state collapse)', () => {
  const req = (goal = 'do it') => ({ goal, tools: tools(), provider: 'anthropic' as const, model: 'mock' });

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
});
