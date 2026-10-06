import {
  ModelGateway,
  contentToText,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';

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

export const calls: string[] = [];

export function fakeTool(
  id: string,
  dangerClass: RiskLevel,
  result: unknown,
): RegisteredTool<unknown> {
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

export const tools = () =>
  CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));

export function script(replies: string[]): void {
  ModelGateway.reset();
  ModelGateway.register(new ScriptedProvider(replies));
}

export const act = (tool: string, args: Record<string, unknown> = {}): string =>
  JSON.stringify({ action: 'act', tool, args, rationale: 'r' });
export const finish = JSON.stringify({ action: 'finish', summary: 'done' });
/**
 * C1 (s15): the typed working state is what the MODEL actually receives. A capturing provider snapshots
 * the messages handed to it each turn, so we assert on the real injected context — not a unit render.
 */
export class CapturingProvider implements ModelProvider {
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

export const actWithState = (tool: string, state: Record<string, unknown>): string =>
  JSON.stringify({ action: 'act', tool, args: {}, rationale: 'r', state });

/** Per-test reset shared by every reactor suite (wire with `beforeEach(resetReactorFixtures)`): clean
 *  gateways + the two default fake tools. Kept vitest-free — this file is not a `*.test.ts`. */
export function resetReactorFixtures(): void {
  calls.length = 0;
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
  CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { content: 'els' }));
  CapabilityRegistry.register(fakeTool('browser_update_page', 'state_changing', { ok: true }));
}
