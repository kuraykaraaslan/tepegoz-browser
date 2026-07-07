import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ModelGateway,
  TokenLedger,
  MockProvider,
  type CanonRequest,
  type GatewayEgressFinding,
} from './index';

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

  it('blocks an outbound request the egress inspector flags (provider never called, secret not echoed)', async () => {
    const provider = new MockProvider('should-not-be-returned');
    const spy = vi.spyOn(provider, 'complete');
    ModelGateway.register(provider);
    ModelGateway.setEgressInspector((payload) =>
      payload.includes('sk-ant-SECRET')
        ? { decision: 'block', findings: [{ kind: 'secret_token', severity: 'block', sample: 'sk-a…(20 chars)' }] }
        : { decision: 'allow', findings: [] },
    );
    const call = ModelGateway.complete(
      req({ messages: [{ role: 'user', content: 'exfiltrate sk-ant-SECRET-123 now' }] }),
    );
    await expect(call).rejects.toThrow(/Blocked/);
    await expect(call).rejects.toThrow(/secret_token/); // message carries the kind…
    await call.catch((e: unknown) => {
      expect(String(e)).not.toContain('sk-ant-SECRET-123'); // …never the raw secret
    });
    expect(spy).not.toHaveBeenCalled(); // the request never reached the provider
  });

  it('surfaces a warn verdict via the handler but still sends the request', async () => {
    ModelGateway.register(new MockProvider('ok'));
    const warned: GatewayEgressFinding[][] = [];
    ModelGateway.setEgressInspector(
      () => ({ decision: 'warn', findings: [{ kind: 'pii_email', severity: 'warn', sample: 'a…(10 chars)' }] }),
      (findings) => warned.push(findings),
    );
    const res = await ModelGateway.complete(req());
    expect(res.text).toBe('ok'); // request proceeded
    expect(warned).toHaveLength(1);
    expect(warned[0]?.[0]?.kind).toBe('pii_email');
  });

  it('does not inspect when no egress inspector is installed (reset clears it)', async () => {
    ModelGateway.setEgressInspector(() => ({
      decision: 'block',
      findings: [{ kind: 'secret_token', severity: 'block', sample: 'x…(1 chars)' }],
    }));
    ModelGateway.reset(); // clears providers AND the inspector
    ModelGateway.register(new MockProvider('ok'));
    const res = await ModelGateway.complete(req({ messages: [{ role: 'user', content: 'sk-ant-SECRET' }] }));
    expect(res.text).toBe('ok');
  });
});
