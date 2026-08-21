import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelGateway,
  contentToText,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import { TRUSTED_TASK_OPEN } from '@tepegoz/tool-executor';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';

/**
 * Cross-run memory reaching a turn (S9 PR2) — and the two properties that keep it from becoming an
 * instruction channel: it arrives as an ordinary observation, and it arrives **once per site**.
 */

class RecordingProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  readonly requests: CanonRequest[] = [];
  private turn = 0;
  constructor(private readonly replies: readonly string[]) {}
  complete(req: CanonRequest): Promise<CanonResponse> {
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
    handler: () => result,
  };
}

const tools = () =>
  CapabilityRegistry.list().map((d) => ({
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
  }));
const act = (tool: string): string =>
  JSON.stringify({ action: 'act', tool, args: {}, rationale: 'r' });
const finish = JSON.stringify({ action: 'finish', summary: 'done' });

const NOTE =
  'Notes remembered from an earlier visit to shop.test: the part number is behind a drawer.';

beforeEach(() => {
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

/** Everything the provider was ever shown, flattened. */
function allText(provider: RecordingProvider): string {
  return provider.requests
    .flatMap((r) => r.messages.map((m) => `${m.role}:${contentToText(m.content)}`))
    .join('\n');
}

describe('recalling notes for a site', () => {
  const req = () => ({
    goal: 'do it',
    tools: tools(),
    provider: 'anthropic' as const,
    model: 'mock',
  });

  it('injects the remembered notes once the run lands on the site', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const provider = new RecordingProvider([act('browser_get_page'), finish]);
    ModelGateway.register(provider);
    await Reactor.run(req(), { recallMemory: () => Promise.resolve(NOTE) });
    expect(allText(provider)).toContain('the part number is behind a drawer');
  });

  it('injects them as an OBSERVATION, never inside the trusted task fence', async () => {
    // This is the whole safety property: a remembered note can inform a decision, never be one.
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const provider = new RecordingProvider([act('browser_get_page'), finish]);
    ModelGateway.register(provider);
    await Reactor.run(req(), { recallMemory: () => Promise.resolve(NOTE) });
    const carrier = provider.requests
      .flatMap((r) => r.messages)
      .find((m) => contentToText(m.content).includes('the part number is behind a drawer'));
    expect(carrier?.role).toBe('user');
    expect(contentToText(carrier?.content ?? '')).not.toContain(TRUSTED_TASK_OPEN);
  });

  it('recalls ONCE per host — re-injecting every step would spend what memory saves', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const recallMemory = vi.fn(() => Promise.resolve(NOTE));
    const provider = new RecordingProvider([
      act('browser_get_page'),
      act('browser_get_page'),
      finish,
    ]);
    ModelGateway.register(provider);
    await Reactor.run(req(), { recallMemory });
    expect(recallMemory).toHaveBeenCalledTimes(1);
  });

  it('recalls again when the run moves to a different site', async () => {
    let hop = 0;
    CapabilityRegistry.register(fakeTool('browser_get_page', 'read', { content: 'x' }));
    CapabilityRegistry.reset();
    CapabilityRegistry.register({
      descriptor: {
        id: 'browser_get_page',
        description: 'read',
        dangerClass: 'read',
        source: 'builtin',
        inputSchema: { type: 'object' },
        requiresIdempotencyKey: false,
      },
      inputSchema: {
        // Objects only. A validator that says yes to everything is refused at registration —
        // see CapabilityRegistry.register.
        safeParse: (data: unknown) =>
          typeof data === 'object' && data !== null
            ? { success: true as const, data }
            : { success: false as const, error: { issues: ['expected an object'] } },
      },
      handler: () => {
        hop += 1;
        return { url: hop === 1 ? 'https://shop.test/a' : 'https://other.test/b', content: 'x' };
      },
    });
    const recallMemory = vi.fn(() => Promise.resolve(NOTE));
    const provider = new RecordingProvider([
      act('browser_get_page'),
      act('browser_get_page'),
      finish,
    ]);
    ModelGateway.register(provider);
    await Reactor.run(req(), { recallMemory });
    expect(recallMemory).toHaveBeenCalledTimes(2);
    expect(recallMemory).toHaveBeenNthCalledWith(1, 'shop.test');
    expect(recallMemory).toHaveBeenNthCalledWith(2, 'other.test');
  });

  it('runs quietly, not fatally, when recall fails', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const provider = new RecordingProvider([act('browser_get_page'), finish]);
    ModelGateway.register(provider);
    const res = await Reactor.run(req(), {
      recallMemory: () => Promise.reject(new Error('db locked')),
    });
    expect(res.stoppedReason).toBe('completed');
  });

  it('injects nothing at all when the host has nothing to say', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const provider = new RecordingProvider([act('browser_get_page'), finish]);
    ModelGateway.register(provider);
    await Reactor.run(req(), { recallMemory: () => Promise.resolve('') });
    expect(allText(provider)).not.toContain('remembered');
  });

  it('does nothing when no recall seam is installed — memory is off by default', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { url: 'https://shop.test/a', content: 'x' }),
    );
    const provider = new RecordingProvider([act('browser_get_page'), finish]);
    ModelGateway.register(provider);
    await Reactor.run(req());
    expect(allText(provider)).not.toContain('remembered');
  });
});
