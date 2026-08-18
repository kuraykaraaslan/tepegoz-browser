import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { AxiosInstance } from '@tepegoz/http';
import { toOpenAIParams } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { ModelGateway } from './gateway';
import { MockProvider } from './mock-provider';
import { TokenLedger } from './token-ledger';
import type {
  CanonRequest,
  CanonResponse,
  ModelDeltaSink,
  ModelProvider,
} from './types';

/**
 * Guard for the streaming boundary (ADR-0025): **a delta may reach the renderer; only a settled,
 * validated response reaches the Journal or the decision path.**
 *
 * This replaces the older guard, which enforced the same invariant by asserting that no adapter can
 * stream *at all*. That mechanism was too strong — it made time-to-first-feedback structurally equal to
 * a whole model call. What matters is not the absence of streaming but the boundary: these tests lock
 * that `complete()` stays non-streaming on every adapter, that a delta is delivered only to the caller's
 * sink, and that the caller still acts on the settled response alone.
 */
function req(over: Partial<CanonRequest> = {}): CanonRequest {
  return {
    provider: 'openai',
    model: 'm',
    capability: 'exec',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    timeoutMs: 1000,
    ...over,
  };
}

/** Emits fragments, then settles on a DIFFERENT final text — so a test can prove which one is used. */
class StreamingProvider implements ModelProvider {
  readonly id = 'anthropic' as const;
  constructor(
    private readonly fragments: readonly string[],
    private readonly settled: string,
    private readonly perFragmentMs = 0,
  ) {}
  complete(): Promise<CanonResponse> {
    return Promise.resolve({
      text: this.settled,
      stopReason: 'end',
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [],
    });
  }
  async completeStream(
    _r: CanonRequest,
    _s: AbortSignal,
    onDelta: ModelDeltaSink,
  ): Promise<CanonResponse> {
    for (const f of this.fragments) {
      if (this.perFragmentMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.perFragmentMs));
      }
      onDelta(f);
    }
    return this.complete();
  }
}

describe('complete() is non-streaming on every adapter (the settled path is unchanged)', () => {
  it('OpenAI request never enables streaming', () => {
    expect('stream' in toOpenAIParams(req())).toBe(false);
  });

  it('Gemini uses the non-streaming generateContent endpoint (not streamGenerateContent)', async () => {
    const post = vi.fn().mockResolvedValue({ data: { candidates: [], usageMetadata: null } });
    const client = { post } as unknown as AxiosInstance;
    await new GeminiProvider({ client }).complete(
      req({ provider: 'gemini' }),
      new AbortController().signal,
    );
    expect(post).toHaveBeenCalledTimes(1);
    const url = post.mock.calls[0]?.[0] as string;
    expect(url).toContain(':generateContent');
    expect(url).not.toContain(':streamGenerateContent');
  });

  it('Anthropic complete() uses messages.create, never the streaming API', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const stream = vi.fn();
    const client = { messages: { create, stream } } as unknown as Anthropic;
    await new AnthropicProvider({ client }).complete(
      req({ provider: 'anthropic' }),
      new AbortController().signal,
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();
  });
});

describe('the streaming boundary (ADR-0025)', () => {
  beforeEach(() => {
    ModelGateway.reset();
    TokenLedger.reset();
  });

  it('delivers fragments to the sink but returns the SETTLED response to the caller', async () => {
    const seen: string[] = [];
    ModelGateway.register(new StreamingProvider(['par', 'tial'], 'the settled answer'));
    const res = await ModelGateway.generateStream(req({ provider: 'anthropic' }), (d) => seen.push(d));
    expect(seen).toEqual(['par', 'tial']);
    // What the caller acts on is the settled text — never the concatenated fragments.
    expect(res.text).toBe('the settled answer');
  });

  it('never emits a delta on the non-streaming path (complete stays partial-free)', async () => {
    const seen: string[] = [];
    ModelGateway.register(new StreamingProvider(['par', 'tial'], 'settled'));
    const res = await ModelGateway.complete(req({ provider: 'anthropic' }));
    expect(seen).toEqual([]);
    expect(res.text).toBe('settled');
  });

  it('degrades honestly for an adapter with no streaming path: one delta, after settling', async () => {
    const seen: string[] = [];
    ModelGateway.register(new MockProvider('whole answer'));
    const res = await ModelGateway.generateStream(req({ provider: 'anthropic' }), (d) => seen.push(d));
    // Not simulated typing: exactly one fragment, and it is the settled text.
    expect(seen).toEqual(['whole answer']);
    expect(res.text).toBe('whole answer');
  });

  it('applies the same guards as complete — a blocked egress never reaches the sink', async () => {
    const seen: string[] = [];
    ModelGateway.register(new StreamingProvider(['leak sk-ant-SECRET'], 'settled'));
    ModelGateway.setEgressInspector((payload) =>
      payload.includes('sk-ant-SECRET')
        ? { decision: 'block', findings: [{ kind: 'api-key', severity: 'block', sample: 'sk-…(15)' }] }
        : { decision: 'allow', findings: [] },
    );
    await expect(
      ModelGateway.generateStream(
        req({ provider: 'anthropic', messages: [{ role: 'user', content: 'sk-ant-SECRET' }] }),
        (d) => seen.push(d),
      ),
    ).rejects.toThrow(/api-key/);
    expect(seen).toEqual([]);
  });

  it('records usage once, from the settled response (a delta is not a ledger entry)', async () => {
    ModelGateway.register(new StreamingProvider(['a', 'b', 'c'], 'settled'));
    await ModelGateway.generateStream(req({ provider: 'anthropic', capability: 'exec' }), () => {});
    expect(TokenLedger.totalOutputForCapability('exec')).toBe(1);
  });

  it('first delta arrives well under the 2s p50 budget on the scripted path', async () => {
    // Deterministic, non-funded: 11 runs against a provider that emits a fragment every 10ms. The gate
    // is a plumbing/latency assertion, NOT competence evidence.
    const firstDeltaMs: number[] = [];
    ModelGateway.register(new StreamingProvider(['first', 'second'], 'settled', 10));
    for (let i = 0; i < 11; i++) {
      const started = Date.now();
      let at: number | null = null;
      await ModelGateway.generateStream(req({ provider: 'anthropic' }), () => {
        at ??= Date.now() - started;
      });
      firstDeltaMs.push(at ?? Number.MAX_SAFE_INTEGER);
    }
    const p50 = [...firstDeltaMs].sort((a, b) => a - b)[Math.floor(firstDeltaMs.length / 2)] ?? 0;
    expect(p50).toBeLessThan(2000);
  });
});
