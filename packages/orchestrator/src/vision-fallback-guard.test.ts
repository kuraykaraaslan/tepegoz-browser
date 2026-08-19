import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelGateway,
  isBlockContent,
  type CanonRequest,
  type CanonResponse,
  type ModelProvider,
} from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type RegisteredTool } from '@tepegoz/capability-plane';
import type { AIProvider, RiskLevel, ToolDescriptor } from '@tepegoz/shared-types';
import Reactor from './reactor';

/**
 * The Never-list clause as a test: **screenshots-every-step must fail CI.**
 *
 * S10 makes vision a fallback. The way that guarantee breaks in practice is not someone deciding to send
 * an image every step — it is a refactor moving the capture call somewhere it fires unconditionally. So
 * the assertion is on what actually reaches the provider: with the capture hook installed and a page the
 * DOM can read, ZERO image blocks may be sent, ever.
 */

/** Records every request, so the assertion is on the transport, not on an internal flag. */
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
    inputSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
    handler: () => result,
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

/** Every image block the provider was ever handed, across every request. */
function imagesSent(provider: RecordingProvider): number {
  return provider.requests
    .flatMap((r) => r.messages)
    .filter((m) => isBlockContent(m.content))
    .flatMap((m) => (isBlockContent(m.content) ? m.content : []))
    .filter((b) => b.type === 'image').length;
}

beforeEach(() => {
  ModelGateway.reset();
  CapabilityRegistry.reset();
  ToolGateway.reset();
});

describe('vision is fallback-only', () => {
  const req = () => ({ goal: 'do it', tools: tools(), provider: 'anthropic' as const, model: 'mock' });

  it('sends NO image on an ordinary page, even with the capture hook installed', async () => {
    // A page the DOM can read: named elements, and an action that works.
    CapabilityRegistry.register(
      fakeTool('browser_get_elements', 'read', {
        elements: [{ ref: 1, name: 'Continue', tag: 'button' }],
        content: 'a page with plenty of readable text on it, and a named control to act on',
      }),
    );
    CapabilityRegistry.register(fakeTool('browser_update_page', 'state_changing', { ok: true, changed: true }));
    ToolGateway.setConfirmHandler(() => Promise.resolve(true));

    const provider = new RecordingProvider([
      act('browser_get_elements'),
      act('browser_update_page', { action: 'click', ref: 1 }),
      finish,
    ]);
    ModelGateway.register(provider);
    const captureVision = vi.fn(() =>
      Promise.resolve([{ type: 'image' as const, mediaType: 'image/png' as const, data: 'QUJD' }]),
    );

    const res = await Reactor.run(req(), { captureVision });
    expect(res.stoppedReason).toBe('completed');
    expect(captureVision).not.toHaveBeenCalled();
    expect(imagesSent(provider)).toBe(0);
  });

  it('sends an image ONLY once a trigger fires', async () => {
    // A blind page: content, but nothing actionable in it.
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', {
        content: 'A navigation menu and some figures are painted on this page, but nothing is in the DOM.',
      }),
    );
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { elements: [], content: 'none' }));

    const provider = new RecordingProvider([act('browser_get_page'), act('browser_get_elements'), finish]);
    ModelGateway.register(provider);
    const captureVision = vi.fn(() =>
      Promise.resolve([{ type: 'image' as const, mediaType: 'image/png' as const, data: 'QUJD' }]),
    );

    await Reactor.run(req(), { captureVision });
    expect(captureVision).toHaveBeenCalledTimes(1);
    expect(imagesSent(provider)).toBeGreaterThan(0);
  });

  it('sends no image at all when the host installs no capture hook', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { content: 'A page with content but nothing actionable in it.' }),
    );
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { elements: [], content: 'none' }));
    const provider = new RecordingProvider([act('browser_get_page'), act('browser_get_elements'), finish]);
    ModelGateway.register(provider);

    const res = await Reactor.run(req());
    // The escalation is still RECORDED — the rate is measurable without vision being enabled.
    expect(res.visionEscalations?.length).toBeGreaterThan(0);
    expect(imagesSent(provider)).toBe(0);
  });

  it('degrades rather than dying when the capture throws', async () => {
    CapabilityRegistry.register(
      fakeTool('browser_get_page', 'read', { content: 'A page with content but nothing actionable in it.' }),
    );
    CapabilityRegistry.register(fakeTool('browser_get_elements', 'read', { elements: [], content: 'none' }));
    const provider = new RecordingProvider([act('browser_get_page'), act('browser_get_elements'), finish]);
    ModelGateway.register(provider);

    const res = await Reactor.run(req(), { captureVision: () => Promise.reject(new Error('no debugger')) });
    expect(res.stoppedReason).toBe('completed');
    expect(imagesSent(provider)).toBe(0);
  });
});
