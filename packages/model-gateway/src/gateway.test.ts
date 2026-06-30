import { describe, it, expect, beforeEach } from 'vitest';
import { ModelGateway, TokenLedger, MockProvider, type CanonRequest } from './index';

function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'anthropic',
    model: 'mock-model',
    capability: 'plan',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

describe('ModelGateway', () => {
  beforeEach(() => {
    ModelGateway.reset();
    TokenLedger.reset();
  });

  it('rejects a call without a positive max_tokens', async () => {
    ModelGateway.register(new MockProvider());
    await expect(ModelGateway.complete(req({ maxTokens: 0 }))).rejects.toThrow(/max_tokens/);
  });

  it('rejects a call without a positive timeout', async () => {
    ModelGateway.register(new MockProvider());
    await expect(ModelGateway.complete(req({ timeoutMs: 0 }))).rejects.toThrow(/timeout/);
  });

  it('rejects when no provider is registered for the request', async () => {
    await expect(ModelGateway.complete(req())).rejects.toThrow(/No model provider/);
  });

  it('completes and records usage in the ledger', async () => {
    ModelGateway.register(new MockProvider('hello'));
    const res = await ModelGateway.complete(req());
    expect(res.text).toBe('hello');
    expect(res.stopReason).toBe('end');
    expect(TokenLedger.totalOutputForCapability('plan')).toBe('hello'.length);
  });

  it('aborts the provider on timeout', async () => {
    ModelGateway.register(new MockProvider('slow', 300));
    await expect(ModelGateway.complete(req({ timeoutMs: 20 }))).rejects.toThrow(/aborted/);
  });
});
