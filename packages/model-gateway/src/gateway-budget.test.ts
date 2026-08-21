import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ModelGateway,
  TokenLedger,
  MockProvider,
  type CanonRequest,
  type CanonResponse,
  type CanonUsage,
  type ModelProvider,
} from './index';
import type { AIProvider } from '@tepegoz/shared-types';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'anthropic',
    model: 'mock-model',
    capability: 'exec',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

/** A provider that reports exactly the usage a test needs, so cache behaviour can be driven directly. */
class UsageProvider implements ModelProvider {
  readonly id: AIProvider = 'anthropic';
  calls = 0;
  constructor(private readonly usage: CanonUsage) {}
  complete(): Promise<CanonResponse> {
    this.calls += 1;
    return Promise.resolve({ text: 'ok', stopReason: 'end', usage: this.usage, toolCalls: [] });
  }
}

describe('ModelGateway — per-run token ceiling', () => {
  beforeEach(() => {
    ModelGateway.reset();
    TokenLedger.reset();
    ModelGateway.setCacheWasteHandler(null);
  });

  it('sends nothing once the run has spent its ceiling', async () => {
    const provider = new UsageProvider({ inputTokens: 600, outputTokens: 0 });
    ModelGateway.register(provider);
    TokenLedger.setRunCeiling(1000);

    await ModelGateway.complete(req());
    await ModelGateway.complete(req());
    expect(provider.calls).toBe(2);

    await expect(ModelGateway.complete(req())).rejects.toThrow(/token ceiling/i);
    // The point of the gate: the third request never reached the provider.
    expect(provider.calls).toBe(2);
  });

  it('leaves runs without a ceiling completely unaffected', async () => {
    const provider = new UsageProvider({ inputTokens: 10_000_000, outputTokens: 0 });
    ModelGateway.register(provider);
    await ModelGateway.complete(req());
    await expect(ModelGateway.complete(req())).resolves.toMatchObject({ text: 'ok' });
  });

  /** The ceiling must not be mistaken for a provider outage — it is a budget decision, not a 5xx. */
  it('reports the ceiling as a client-side 429, not a provider failure', async () => {
    ModelGateway.register(new MockProvider());
    TokenLedger.setRunCeiling(1);
    TokenLedger.record('anthropic', 'm', 'exec', { inputTokens: 5, outputTokens: 5 });
    await expect(ModelGateway.complete(req())).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe('ModelGateway — wasted-cache reporting', () => {
  beforeEach(() => {
    ModelGateway.reset();
    TokenLedger.reset();
    ModelGateway.setCacheWasteHandler(null);
  });

  it('reports a write that read nothing back', async () => {
    ModelGateway.register(
      new UsageProvider({
        inputTokens: 10,
        outputTokens: 2,
        cacheWriteTokens: 900,
        cacheReadTokens: 0,
      }),
    );
    const onWaste = vi.fn();
    ModelGateway.setCacheWasteHandler(onWaste);

    await ModelGateway.complete(req({ cache: { systemAndTools: true } }));
    expect(onWaste).toHaveBeenCalledWith(900);
  });

  it('stays silent on a healthy cache hit', async () => {
    ModelGateway.register(
      new UsageProvider({
        inputTokens: 10,
        outputTokens: 2,
        cacheWriteTokens: 0,
        cacheReadTokens: 900,
      }),
    );
    const onWaste = vi.fn();
    ModelGateway.setCacheWasteHandler(onWaste);

    await ModelGateway.complete(req({ cache: { systemAndTools: true } }));
    expect(onWaste).not.toHaveBeenCalled();
  });

  it('stays silent when the caller never asked for caching', async () => {
    ModelGateway.register(
      new UsageProvider({
        inputTokens: 10,
        outputTokens: 2,
        cacheWriteTokens: 900,
        cacheReadTokens: 0,
      }),
    );
    const onWaste = vi.fn();
    ModelGateway.setCacheWasteHandler(onWaste);

    await ModelGateway.complete(req());
    expect(onWaste).not.toHaveBeenCalled();
  });

  it('is advisory — a reporting failure must never break the model call', async () => {
    ModelGateway.register(
      new UsageProvider({
        inputTokens: 10,
        outputTokens: 2,
        cacheWriteTokens: 900,
        cacheReadTokens: 0,
      }),
    );
    ModelGateway.setCacheWasteHandler(() => {
      throw new Error('telemetry is down');
    });
    await expect(
      ModelGateway.complete(req({ cache: { systemAndTools: true } })),
    ).resolves.toMatchObject({
      text: 'ok',
    });
  });
});
